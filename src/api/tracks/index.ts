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
      // Selection stays inside respondWith's guard: naming a provider that does
      // not exist throws, and that has to stay a 400 rather than escaping as an
      // unhandled error. The chosen id is captured for provenance on the way
      // through.
      let selectedId: string | undefined
      void respondWith(
        () => {
          const selected = this.selectProvider(req)
          selectedId = selected?.id
          return selected?.provider
        },
        // geometry=false is a listing rather than a different resource: the
        // provider still decides which contexts match, it just omits the
        // coordinates it would otherwise have to read and thin.
        (provider) =>
          provider
            .getTracks(request)
            .then((response) => stampProvider(response, selectedId)),
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
        void respondWith(
          () => this.useProvider(req),
          (provider) => provider.getTrackContexts(request),
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

  private useProvider(req: Request): TrackProvider | undefined {
    return this.selectProvider(req)?.provider
  }

  /**
   * The provider that will answer, and the id it is registered under.
   *
   * The id comes from the registry rather than from the provider, so a
   * provider never has to name itself and cannot name itself wrongly.
   */
  private selectProvider(
    req: Request
  ): { id: string; provider: TrackProvider } | undefined {
    if (req.query.provider) {
      const id = req.query.provider as string
      const provider = this.trackProviders.get(id)
      if (!provider) {
        throw new Error(`Requested provider not found! (${id})`)
      }
      return { id, provider }
    }
    const id = this.defaultProviderId
    const provider = id ? this.trackProviders.get(id) : undefined
    return id && provider ? { id, provider } : undefined
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

async function respondWith<T>(
  getProvider: () => TrackProvider | undefined,
  handler: (provider: TrackProvider) => Promise<T> | undefined,
  res: Response
) {
  // Provider selection and the provider call fail for different reasons and
  // must not share a status. Naming a provider that does not exist is a client
  // error; a provider throwing is a server fault, and its message can carry
  // file paths, connection strings or SQL, so it is logged rather than
  // returned.
  let provider: TrackProvider | undefined
  try {
    provider = getProvider()
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request'
    })
  }
  if (!provider) {
    return res.status(501).json({ error: 'No track api provider configured' })
  }
  try {
    res.json(await handler(provider))
  } catch (error) {
    console.error('Track api provider failed:', error)
    res.status(500).json({ error: 'Track api provider failed' })
  }
}
