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
import { parseTracksQuery, parseTrackImport } from './query'
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
      },
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
      void this.readOneFromProviders(req, res)
    })

    this.app.post(TRACKS_API_PATH, (req: Request, res: Response) => {
      // Parsed before the check, because what is being authorised depends on
      // what was sent: a track declaring a context is a write against *that*
      // vessel, and checking `vessels.self` first would let anyone permitted
      // to write their own vessel store a track under someone else's.
      const { track, errors } = parseTrackImport(req.body)
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
          provider
            .storeTrack!(track)
            .then((feature) => stampProvider(single(feature), id).features[0]),
        201
      )
    })

    this.app.delete(
      `${TRACKS_API_PATH}/:id`,
      (req: Request, res: Response) => {
        void (async () => {
          // Resolved before the check, and deleted from the provider that
          // answered. Authorising against `vessels.self` would let anyone who
          // may write their own vessel delete another vessel's track by id,
          // and deleting from the default provider would address whichever
          // track happened to share the id there.
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
            const deleted = await found.provider.deleteTrack(req.params.id)
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
      }
    )
  }

  /**
   * Find one track by id across the providers.
   *
   * Asked of every provider rather than just the default, because an id names
   * a track wherever it lives and a client holding one from a listing has no
   * reason to know which provider answered. An id is unique only within a
   * provider, so two of them holding the same one is a 409 naming both rather
   * than a silent pick by registration order.
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
   * Find the track with this id, and the provider holding it.
   *
   * An id is unique within a provider, not across them, so the provider is
   * part of the answer: acting on a track found in one provider while writing
   * to another would address a different track that happens to share an id.
   * `?provider=` narrows the search when a client knows where to look.
   *
   * Responds with the failure itself — 400, 404, 500, 501 — and resolves
   * undefined, so callers only handle the success.
   */
  private async locate(
    req: Request,
    res: Response,
    forDeletion = false
  ): Promise<
    | { id: string; provider: TrackProvider; track: TrackFeature | undefined }
    | undefined
  > {
    let selected: { id: string; provider: TrackProvider }[]
    try {
      selected = this.selectProviders(req)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      })
      return undefined
    }
    if (selected.length === 0) {
      res.status(501).json({ error: 'No track api provider configured' })
      return undefined
    }
    try {
      const readable = selected.filter(
        (s) => typeof s.provider.getTrack === 'function'
      )
      // Every provider is asked, not just until one answers: an id is unique
      // within a provider and two of them may mint the same one, so stopping
      // at the first match would act on whichever registered earlier.
      const matches = (
        await Promise.all(
          readable.map(async ({ id, provider }) => {
            const track = await provider.getTrack!(req.params.id)
            return track ? { id, provider, track } : undefined
          })
        )
      ).filter((m): m is { id: string; provider: TrackProvider; track: TrackFeature } => !!m)

      if (matches.length > 1) {
        res.status(409).json({
          error: `Track id '${req.params.id}' exists in more than one provider (${matches
            .map((m) => m.id)
            .join(', ')}); name one with ?provider=`
        })
        return undefined
      }
      if (matches.length === 1) {
        return matches[0]
      }
      // A provider may delete without being able to read back — the two are
      // independent in the contract — so an unreadable single provider is
      // still a legitimate target rather than an automatic 404.
      const deleteOnly = selected.filter(
        (s) =>
          typeof s.provider.getTrack !== 'function' &&
          typeof s.provider.deleteTrack === 'function'
      )
      // Only for a delete. A provider that cannot read cannot answer a GET,
      // so letting it stand in there would turn "no readable track" into a
      // 409 or a phantom hit.
      if (!forDeletion) {
        // Nothing registered can read a track by id: that is an operation
        // this server does not support, not a track that is absent.
        if (readable.length === 0) {
          res.status(501).json({
            error: 'No track api provider supports reading a track by id'
          })
          return undefined
        }
        res.status(404).json({ error: 'Track not found' })
        return undefined
      }
      // A provider that deletes without reading is a legitimate target once
      // the readable ones have found nothing, whether or not any are
      // registered alongside it.
      if (deleteOnly.length === 1) {
        return { ...deleteOnly[0], track: undefined }
      }
      if (deleteOnly.length > 1) {
        res.status(409).json({
          error: `Track id '${req.params.id}' may be held by more than one provider (${deleteOnly
            .map((d) => d.id)
            .join(', ')}); name one with ?provider=`
        })
        return undefined
      }
      res.status(404).json({ error: 'Track not found' })
    } catch (error) {
      console.error('Track api provider failed:', error)
      res.status(500).json({ error: 'Track api provider failed' })
    }
    return undefined
  }

  /**
   * Run a write against one provider.
   *
   * One, not the fan-out the reads use: a write has to land somewhere definite,
   * so it goes to the provider named by `?provider=` or to the default. A
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
      res
        .status(501)
        .json({ error: `Provider '${target.id}' does not support this operation` })
      return
    }
    try {
      const result = await run(target.provider, target.id)
      // Where the new track lives, so a client need not parse the body to
      // find out. The provider assigns the id, so only the response knows it.
      const created = (result as { properties?: { id?: string } })?.properties?.id
      if (successStatus === 201 && created) {
        res.setHeader('Location', `${TRACKS_API_PATH}/${encodeURIComponent(created)}`)
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
      properties: { ...feature.properties, providerId }
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
