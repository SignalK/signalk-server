import {
  isTrackProvider,
  TrackApi,
  TrackFeature,
  TrackProvider,
  TrackProviders,
  isTrackRejectedError,
  TracksRequest,
  TracksResponse,
  WithTrackApi
} from '@signalk/server-api/tracks'
import { Context } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { createDebug } from '../../debug'
import { WithSecurityStrategy } from '../../security'
import { ConfigApp } from '../../config/config'
import {
  parseTracksQuery,
  parseTrackImport,
  rejectUnknownParams
} from './query'
import { Responses } from '../'

const debug = createDebug('signalk-server:api:tracks')

const TRACKS_API_PATH = `/signalk/v2/api/tracks`

export interface TrackApplication
  extends WithSecurityStrategy, IRouter, ConfigApp, WithTrackApi {}

/**
 * HTTP surface for the Track API.
 *
 * Follows the History API's registry pattern: plugins that record positions
 * register as providers, and the server owns the route, the query contract and
 * the response shape. Where the positions are actually kept — sqlite, a
 * time-series database, parquet — is entirely the provider's business.
 *
 * Design discussion: https://github.com/SignalK/signalk-server/issues/2504
 */
export class TrackApiHttpRegistry {
  private trackProviders: Map<string, TrackProvider> = new Map()
  proxy: TrackApi

  /** First registered provider, keeping the default independent of load order. */
  private get defaultProviderId(): string | undefined {
    return this.trackProviders.keys().next().value
  }

  /** The default provider, or undefined once the last one unregisters. */
  private currentDefaultProvider(): TrackProvider | undefined {
    return this.defaultProviderId
      ? this.trackProviders.get(this.defaultProviderId)
      : undefined
  }

  constructor(private app: TrackApplication) {
    // Captured because `this` inside an object-literal getter is the literal,
    // not the registry.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.proxy = {
      getTracks: (query: TracksRequest): Promise<TracksResponse> =>
        this.defaultProvider().getTracks(query),
      getTrackContexts: (query: TracksRequest): Promise<Context[]> =>
        this.defaultProvider().getTrackContexts(query),
      // Delegated on each call rather than copied once: which provider is the
      // default, and whether it can write, are both answered when the call is
      // made. A proxy built at construction would answer for whichever
      // provider happened to register first and keep answering after it went.
      // The optional methods are getters rather than plain properties: they
      // report what the *current* default provider can do, and a caller that
      // checks `api.storeTrack` before calling it must not be told yes by a
      // proxy that merely forwards. Defined this way they are absent exactly
      // when the provider lacks them.
      get getTrack() {
        const provider = self.currentDefaultProvider()
        return typeof provider?.getTrack === 'function'
          ? provider.getTrack.bind(provider)
          : undefined
      },
      get storeTrack() {
        const provider = self.currentDefaultProvider()
        return typeof provider?.storeTrack === 'function'
          ? provider.storeTrack.bind(provider)
          : undefined
      },
      get deleteTrack() {
        const provider = self.currentDefaultProvider()
        return typeof provider?.deleteTrack === 'function'
          ? provider.deleteTrack.bind(provider)
          : undefined
      }
      // Absent rather than throwing once the last provider unregisters: a
      // caller holding the proxy is asking what can be done, and "nothing"
      // is an answer.
    }

    app.getTrackApi = (providerId?: string) => {
      if (providerId !== undefined) {
        const provider = this.trackProviders.get(providerId)
        return provider
          ? Promise.resolve(provider)
          : Promise.reject(
              new Error(`Track api provider '${providerId}' not found`)
            )
      }
      return this.defaultProviderId
        ? Promise.resolve(this.proxy)
        : Promise.reject(new Error('No track api provider configured'))
    }
  }

  registerTrackApiProvider(pluginId: string, provider: TrackProvider): void {
    if (!isTrackProvider(provider)) {
      throw new Error('Invalid track api provider')
    }
    // A track is addressed `providerId:trackId` and split on the first colon,
    // so an id containing one would silently make every track this provider
    // holds unreachable: the prefix would name a provider that is not
    // registered. Refused at registration, where it is diagnosable.
    if (pluginId.includes(':')) {
      throw new Error(
        `Invalid track api provider id '${pluginId}': must not contain ':'`
      )
    }
    // Replace rather than keep the first: a plugin that re-registers after a
    // restart or a config change means the new provider, and silently serving
    // the stale one would be very hard to diagnose.
    this.trackProviders.set(pluginId, provider)
    debug.enabled &&
      debug(
        `Registered track api provider ${pluginId}, total=${this.trackProviders.size}`
      )
  }

  unregisterTrackApiProvider(pluginId: string): void {
    this.trackProviders.delete(pluginId)
    debug.enabled &&
      debug(
        `Unregistered track api provider ${pluginId}, total=${this.trackProviders.size}`
      )
  }

  async start() {
    this.initRoutes()
    return Promise.resolve()
  }

  private initRoutes() {
    this.app.get(`${TRACKS_API_PATH}/_providers`, (_req, res) => {
      const providers: TrackProviders = {}
      this.trackProviders.forEach((_v, id) => {
        providers[id] = { isDefault: id === this.defaultProviderId }
      })
      res.json(providers)
    })

    // Query validation runs before the provider lookup on both routes: a
    // malformed query is a client error whether or not a provider happens to
    // be installed, and reporting 501 for it would send someone hunting for a
    // missing plugin when the real problem is their query string.
    this.app.get(TRACKS_API_PATH, (req: Request, res: Response) => {
      const { request, errors } = parseTracksQuery(req.query)
      if (errors.length > 0) {
        res.status(400).json({ error: errors.join(', ') })
        return
      }
      debug.enabled && debug(JSON.stringify(request, null, 2))
      void respondWithAll(
        () => this.selectProviders(req),
        // geometry=false is a listing rather than a different resource: the
        // provider still decides which contexts match, it just omits the
        // coordinates it would otherwise have to read and thin.
        ({ id, provider }) =>
          provider.getTracks(request).then((r) => stampProvider(r, id)),
        (responses) => ({
          type: 'FeatureCollection' as const,
          features: responses.flatMap((r) => r.features)
        }),
        res
      )
    })

    this.app.get(
      `${TRACKS_API_PATH}/contexts`,
      (req: Request, res: Response) => {
        const { request, errors } = parseTracksQuery(req.query)
        if (errors.length > 0) {
          res.status(400).json({ error: errors.join(', ') })
          return
        }
        void respondWithAll(
          () => this.selectProviders(req),
          ({ provider }) => provider.getTrackContexts(request),
          // Deduplicated: the same vessel may be recorded by more than one
          // provider, and a listing of which contexts exist should name each
          // once. The tracks themselves stay separate, since two providers
          // genuinely hold two recordings.
          (lists) => [...new Set(lists.flat())],
          res
        )
      }
    )

    // Writes are guarded the way the Resources API guards its own: a track a
    // client uploads is data the server keeps and serves back, so it needs the
    // same authority as writing a route or a waypoint.
    const writeAllowed = (req: Request, context: string): boolean =>
      this.app.securityStrategy.shouldAllowPut(req, context, null, 'tracks')

    // Registered after /contexts and /_providers, which are also single
    // segments under this prefix: express matches in registration order, so a
    // wildcard added first would swallow both.
    this.app.get(`${TRACKS_API_PATH}/:id`, (req: Request, res: Response) => {
      // No `provider`: the id names it. Accepting one that the addressing
      // ignores would let a client believe it had chosen where to look.
      const unknown = rejectUnknownParams(req.query, [])
      if (unknown.length > 0) {
        res.status(400).json({ error: unknown.join(', ') })
        return
      }
      void this.readOneFromProviders(req, res)
    })

    this.app.post(TRACKS_API_PATH, (req: Request, res: Response) => {
      const unknown = rejectUnknownParams(req.query, ['provider'])
      if (unknown.length > 0) {
        res.status(400).json({ error: unknown.join(', ') })
        return
      }
      // Parsed before the check, because what is being authorised depends on
      // what was sent: a track declaring a context is a write against *that*
      // vessel, and checking `vessels.self` first would let anyone permitted
      // to write their own vessel store a track under someone else's.
      const { track, errors, unknownProperties } = parseTrackImport(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: errors.join(', ') })
        return
      }
      // A track naming no vessel is authorised as own-vessel data: it is the
      // uploader's to keep, and there is no other principal it could belong
      // to.
      if (!writeAllowed(req, track?.context ?? 'vessels.self')) {
        res.status(403).json(Responses.unauthorised)
        return
      }
      // Stored as sent, but said out loud: a misspelled `coordTimes` is kept
      // rather than rejected, and without this nothing would distinguish that
      // from the times having been understood.
      if (unknownProperties && unknownProperties.length > 0) {
        debug(
          `track import carried unknown properties: ${unknownProperties.join(', ')}`
        )
      }
      if (!track) {
        // Unreachable in practice: no parser branch reports success without a
        // track. Narrowed rather than asserted so it stays that way.
        res.status(400).json({ error: 'Malformed track' })
        return
      }
      void this.writeToProvider(
        req,
        res,
        (provider) => provider.storeTrack,
        (provider, id) =>
          provider.storeTrack!(track).then(
            (feature) => stampProvider(single(feature), id).features[0]
          ),
        201
      )
    })

    this.app.delete(`${TRACKS_API_PATH}/:id`, (req: Request, res: Response) => {
      // As for the GET above: the id names the provider.
      const unknown = rejectUnknownParams(req.query, [])
      if (unknown.length > 0) {
        res.status(400).json({ error: unknown.join(', ') })
        return
      }
      void (async () => {
        // Deletion is destructive, irreversible and addressed only by an
        // id, and a track carries no record of who uploaded it — so an
        // imported track has no owner to check a requester against.
        // Requiring admin answers that without inventing an identity the
        // API does not have.
        //
        // On a server with security disabled there is no admin to be:
        // `allowConfigure` is false for everyone, so requiring it would
        // make deletion impossible rather than safe. There the ordinary
        // write check applies, which is how the rest of the server treats
        // an unsecured install.
        const security = this.app.securityStrategy
        const permitted = security.isDummy()
          ? writeAllowed(req, 'vessels.self')
          : security.allowConfigure(req)
        if (!permitted) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        const found = await this.locate(req, res, true)
        if (!found) {
          return
        }
        if (typeof found.provider.deleteTrack !== 'function') {
          res.status(501).json({
            error: `Provider '${found.id}' does not support this operation`
          })
          return
        }
        try {
          const deleted = await found.provider.deleteTrack(found.trackId)
          if (!deleted) {
            res.status(404).json({ error: 'Track not found' })
            return
          }
          res.status(200).json({})
        } catch (error) {
          console.error('Track api provider failed:', error)
          res.status(500).json({ error: 'Track api provider failed' })
        }
      })()
    })
  }

  /**
   * One track, addressed as `providerId:trackId`.
   */
  private async readOneFromProviders(req: Request, res: Response) {
    const found = await this.locate(req, res)
    if (!found) {
      return
    }
    if (!found.track) {
      res.status(404).json({ error: 'Track not found' })
      return
    }
    res.json(stampProvider(single(found.track), found.id).features[0])
  }

  /**
   * The provider named by a composite id, and the track it holds.
   *
   * A track is identified by the provider holding it and the id that provider
   * minted, written `providerId:trackId`. The provider is therefore addressed
   * directly: an id names one track in one place, so there is nothing to
   * search for and no way for two providers to answer for the same id.
   *
   * Only the first colon separates the two: a provider id may not contain one,
   * a track id may.
   *
   * Responds with the failure itself — 400, 404, 500, 501 — and resolves
   * undefined, so callers only handle the success.
   */
  private async locate(
    req: Request,
    res: Response,
    forDeletion = false
  ): Promise<
    | {
        id: string
        trackId: string
        provider: TrackProvider
        track: TrackFeature | undefined
      }
    | undefined
  > {
    const composite = req.params.id
    const separator = composite.indexOf(':')
    if (separator < 1 || separator === composite.length - 1) {
      res.status(400).json({
        error: `Track id '${composite}' must be written providerId:trackId`
      })
      return undefined
    }
    const id = composite.slice(0, separator)
    const trackId = composite.slice(separator + 1)

    const provider = this.trackProviders.get(id)
    if (!provider) {
      res.status(404).json({ error: `Provider '${id}' is not registered` })
      return undefined
    }

    // Reading and deleting are independent in the provider contract, so a
    // provider that can delete without reading back is a legitimate target
    // for a delete even though a GET against it cannot be answered.
    if (typeof provider.getTrack !== 'function') {
      if (forDeletion && typeof provider.deleteTrack === 'function') {
        return { id, trackId, provider, track: undefined }
      }
      res.status(501).json({
        error: `Provider '${id}' does not support this operation`
      })
      return undefined
    }

    try {
      const track = await provider.getTrack(trackId)
      if (!track) {
        // For a delete this is still a legitimate target: the provider may
        // hold a track it cannot read back, and only deleteTrack can say.
        if (forDeletion && typeof provider.deleteTrack === 'function') {
          return { id, trackId, provider, track: undefined }
        }
        res.status(404).json({ error: 'Track not found' })
        return undefined
      }
      return { id, trackId, provider, track }
    } catch (error) {
      console.error('Track api provider failed:', error)
      res.status(500).json({ error: 'Track api provider failed' })
    }
    return undefined
  }

  /**
   * Run a write against one provider.
   *
   * One, not the fan-out a listing uses: a write has to land somewhere
   * definite, so it goes to the provider named by `?provider=` or to the
   * default. A
   * provider that does not implement the operation is a 501 rather than a
   * failure, since a recorder with no storage for imported tracks is a
   * legitimate provider, not a broken one.
   */
  private async writeToProvider<T>(
    req: Request,
    res: Response,
    capability: (provider: TrackProvider) => unknown,
    run: (provider: TrackProvider, id: string) => Promise<T>,
    successStatus: number
  ) {
    let selected: { id: string; provider: TrackProvider }[]
    try {
      selected = this.selectProviders(req)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      })
      return
    }
    const target = req.query.provider
      ? selected[0]
      : this.defaultProviderId
        ? { id: this.defaultProviderId, provider: this.defaultProvider() }
        : undefined
    if (!target) {
      res.status(501).json({ error: 'No track api provider configured' })
      return
    }
    if (typeof capability(target.provider) !== 'function') {
      res.status(501).json({
        error: `Provider '${target.id}' does not support this operation`
      })
      return
    }
    try {
      const result = await run(target.provider, target.id)
      // Where the new track lives, so a client need not parse the body to
      // find out. The provider assigns the id, so only the response knows it.
      const created = (result as { properties?: { id?: string } })?.properties
        ?.id
      // `created` is already the composite the stamping in the caller
      // produced, so it addresses the track as posted back to the client.
      if (successStatus === 201 && created) {
        res.setHeader(
          'Location',
          `${TRACKS_API_PATH}/${encodeURIComponent(created)}`
        )
      }
      res.status(successStatus).json(result)
    } catch (error) {
      // A provider refusing the track itself is a client error: it means what
      // was sent cannot be kept here, not that the store broke. Documented on
      // storeTrack, which says a provider may refuse an untimed import.
      if (isTrackRejectedError(error)) {
        res.status(400).json({ error: error.message })
        return
      }
      console.error('Track api provider failed:', error)
      res.status(500).json({ error: 'Track api provider failed' })
    }
  }

  private defaultProvider(): TrackProvider {
    if (this.defaultProviderId) {
      return this.trackProviders.get(this.defaultProviderId)!
    }
    throw new Error('No track api provider configured')
  }

  /**
   * The providers that will answer, and the ids they are registered under.
   *
   * Every registered provider unless `?provider=` names one. Two providers can
   * legitimately hold tracks for the same vessel — one recording AIS, another
   * the own vessel, or the same passage imported twice — so their responses are
   * concatenated rather than merged, and each feature carries the id of the
   * provider that produced it.
   *
   * Ids come from the registry rather than from the providers, so a provider
   * never has to name itself and cannot name itself wrongly.
   */
  private selectProviders(
    req: Request
  ): { id: string; provider: TrackProvider }[] {
    if (req.query.provider) {
      const id = req.query.provider as string
      const provider = this.trackProviders.get(id)
      if (!provider) {
        throw new Error(`Requested provider not found! (${id})`)
      }
      return [{ id, provider }]
    }
    return [...this.trackProviders.entries()].map(([id, provider]) => ({
      id,
      provider
    }))
  }
}

/**
 * Record which provider answered, on each feature.
 *
 * Costs nothing today with a single provider, and is what lets a client tell
 * features apart if a query is ever answered by several. Stamped by the server
 * rather than the provider so the id always matches the registry.
 */
/** One feature as a collection, so `stampProvider` can be reused for a write. */
function single(feature: TrackFeature): TracksResponse {
  return { type: 'FeatureCollection', features: [feature] }
}

function stampProvider(
  response: TracksResponse,
  providerId: string | undefined
): TracksResponse {
  if (providerId === undefined) {
    return response
  }
  return {
    ...response,
    features: response.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        providerId,
        // Composed here rather than by the provider: a provider mints an id
        // unique within itself and never has to know its own registry name,
        // so it cannot compose this wrongly. Absent when the provider does
        // not identify its tracks at all.
        ...(feature.properties.id === undefined
          ? {}
          : { id: `${providerId}:${feature.properties.id}` })
      }
    }))
  }
}

/**
 * Query every selected provider and combine what they return.
 *
 * Providers are queried concurrently: one being slow makes that provider slow,
 * which is its own business, and serialising them would make the response as
 * slow as the sum rather than the slowest.
 *
 * A provider that throws fails the request rather than being dropped from a
 * partial answer, because a client cannot tell a provider that failed from one
 * that simply had no data in the window.
 */
async function respondWithAll<T, R>(
  select: () => { id: string; provider: TrackProvider }[],
  query: (selected: { id: string; provider: TrackProvider }) => Promise<T>,
  combine: (results: T[]) => R,
  res: Response
) {
  // Selection and the provider calls fail for different reasons and must not
  // share a status: naming a provider that does not exist is a client error,
  // while a provider throwing is a server fault whose message can carry file
  // paths, connection strings or SQL.
  let selected: { id: string; provider: TrackProvider }[]
  try {
    selected = select()
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request'
    })
  }
  if (selected.length === 0) {
    return res.status(501).json({ error: 'No track api provider configured' })
  }
  try {
    res.json(combine(await Promise.all(selected.map(query))))
  } catch (error) {
    console.error('Track api provider failed:', error)
    res.status(500).json({ error: 'Track api provider failed' })
  }
}
