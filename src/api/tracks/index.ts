import {
  isTrackProvider,
  TrackApi,
  TrackProvider,
  TrackProviders,
  TracksRequest,
  TracksResponse,
  WithTrackApi
} from '@signalk/server-api/tracks'
import { Context } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { createDebug } from '../../debug'
import { WithSecurityStrategy } from '../../security'
import { ConfigApp } from '../../config/config'
import { parseTracksQuery } from './query'

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

  constructor(private app: TrackApplication) {
    this.proxy = {
      getTracks: (query: TracksRequest): Promise<TracksResponse> =>
        this.defaultProvider().getTracks(query),
      getTrackContexts: (query: TracksRequest): Promise<Context[]> =>
        this.defaultProvider().getTrackContexts(query)
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
