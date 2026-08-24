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
    if (!this.trackProviders.has(pluginId)) {
      this.trackProviders.set(pluginId, provider)
    }
    debug(
      `Registered track api provider ${pluginId}, total=${this.trackProviders.size}`
    )
  }

  unregisterTrackApiProvider(pluginId: string): void {
    this.trackProviders.delete(pluginId)
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
      void respondWith(
        () => this.useProvider(req),
        // geometry=false is a listing rather than a different resource: the
        // provider still decides which contexts match, it just omits the
        // coordinates it would otherwise have to read and thin.
        (provider) => provider.getTracks(request),
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
    if (req.query.provider) {
      const provider = this.trackProviders.get(req.query.provider as string)
      if (!provider) {
        throw new Error(`Requested provider not found! (${req.query.provider})`)
      }
      return provider
    }
    return this.defaultProviderId
      ? this.trackProviders.get(this.defaultProviderId)
      : undefined
  }
}

async function respondWith<T>(
  getProvider: () => TrackProvider | undefined,
  handler: (provider: TrackProvider) => Promise<T> | undefined,
  res: Response
) {
  try {
    const provider = getProvider()
    if (!provider) {
      return res.status(501).json({ error: 'No track api provider configured' })
    }
    res.json(await handler(provider))
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request'
    })
  }
}
