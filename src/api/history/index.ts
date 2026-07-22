import {
  AggregateMethod,
  ContextsRequest,
  ContextsResponse,
  HistoryApi,
  HistoryProvider,
  HistoryProviders,
  isHistoryProvider,
  PathSpec,
  PathsRequest,
  PathsResponse,
  HistorySourcePolicy,
  TimeRangeParams,
  ValuesRequest,
  ValuesResponse,
  WithHistoryApi
} from '@signalk/server-api/history'
import { IRouter } from 'express'
import { Temporal } from '@js-temporal/polyfill'
import { Context, Path, SourceRef } from '@signalk/server-api'
import { createDebug } from '../../debug'
import { Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'
import { ConfigApp, writeSettingsFile } from '../../config/config'

import { Responses } from '../'

const debug = createDebug('signalk-server:api:history')

const HISTORY_API_PATH = `/signalk/v2/api/history`
const PROVIDER_NOTIFICATION_PATH =
  'notifications.server.history.defaultProvider' as Path

export interface HistoryApplication
  extends WithSecurityStrategy, IRouter, ConfigApp, WithHistoryApi {}

export class HistoryApiHttpRegistry {
  private historyProviders: Map<string, HistoryProvider> = new Map()
  /** Persisted user choice; may reference a provider that is not
   * currently registered (e.g. plugin disabled). */
  private configuredProviderId?: string
  /** True while a warn notification about the configured provider
   * being unavailable is active. */
  private warnedUnavailable = false
  proxy: HistoryApi

  /** The configured provider when it is registered, otherwise the first
   * registered provider as fallback. Keeps the default independent of
   * plugin load order. */
  private get defaultProviderId(): string | undefined {
    if (
      this.configuredProviderId &&
      this.historyProviders.has(this.configuredProviderId)
    ) {
      return this.configuredProviderId
    }
    return this.historyProviders.keys().next().value
  }

  constructor(private app: HistoryApplication) {
    this.configuredProviderId = app.config.settings.historyApi?.defaultProvider
    this.proxy = {
      getValues: (query: ValuesRequest): Promise<ValuesResponse> => {
        return this.defaultProvider().getValues(query)
      },
      getContexts: (query: ContextsRequest): Promise<ContextsResponse> => {
        return this.defaultProvider().getContexts(query)
      },
      getPaths: (query: PathsRequest): Promise<PathsResponse> => {
        return this.defaultProvider().getPaths(query)
      }
    }
    app.getHistoryApi = (providerId?: string) => {
      if (providerId !== undefined) {
        const provider = this.historyProviders.get(providerId)
        return provider
          ? Promise.resolve(provider)
          : Promise.reject(
              new Error(`History api provider '${providerId}' not found`)
            )
      }
      return this.defaultProviderId &&
        this.historyProviders.has(this.defaultProviderId)
        ? Promise.resolve(this.proxy)
        : Promise.reject(new Error('No history api provider configured'))
    }
  }

  registerHistoryApiProvider(
    pluginId: string,
    provider: HistoryProvider
  ): void {
    if (!isHistoryProvider(provider)) {
      throw new Error('Invalid history api provider')
    }
    if (!this.historyProviders.has(pluginId)) {
      this.historyProviders.set(pluginId, provider)
    }
    if (pluginId === this.configuredProviderId) {
      this.notifyConfiguredAvailable()
    }
    debug(
      `Registered history api provider ${pluginId},`,
      `total=${this.historyProviders.size},`,
      `default=${this.defaultProviderId}`
    )
  }

  unregisterHistoryApiProvider(pluginId: string): void {
    if (!pluginId || !this.historyProviders.has(pluginId)) {
      return
    }
    this.historyProviders.delete(pluginId)
    debug(
      `Unregistered history api provider ${pluginId},`,
      `total=${this.historyProviders.size},`,
      `default=${this.defaultProviderId}`
    )
  }

  start() {
    // return list of history providers
    this.app.get(
      `${HISTORY_API_PATH}/_providers`,
      async (req: Request, res: Response) => {
        debug(`**route = ${req.method} ${req.path}`)
        try {
          const r: HistoryProviders = {}
          this.historyProviders.forEach((_v: HistoryProvider, k: string) => {
            r[k] = {
              isDefault: k === this.defaultProviderId
            }
          })
          res.status(200).json(r)
        } catch (err: unknown) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }
    )

    // return default history provider identifier
    this.app.get(
      `${HISTORY_API_PATH}/_providers/_default`,
      async (req: Request, res: Response) => {
        debug(`**route = ${req.method} ${req.path}`)
        try {
          res.status(200).json({
            id: this.defaultProviderId,
            configured: this.configuredProviderId
          })
        } catch (err: unknown) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }
    )

    // change default history provider
    this.app.post(
      `${HISTORY_API_PATH}/_providers/_default/:id`,
      async (req: Request, res: Response) => {
        debug(`**route = ${req.method} ${req.path}`)
        try {
          if (
            !this.app.securityStrategy.shouldAllowPut(
              req,
              'vessels.self',
              null,
              'history'
            )
          ) {
            res.status(403).json(Responses.unauthorised)
            return
          }
          if (!req.params.id) {
            throw new Error('Provider id not supplied!')
          }
          if (this.historyProviders.has(req.params.id)) {
            this.saveConfiguredProvider(req.params.id, (err) => {
              if (err) {
                res.status(500).json({
                  statusCode: 500,
                  state: 'FAILED',
                  message: `Failed to save settings: ${err.message}`
                })
              } else {
                res.status(200).json({
                  statusCode: 200,
                  state: 'COMPLETED',
                  message: `Default provider set to ${req.params.id}.`
                })
              }
            })
          } else {
            throw new Error(`Provider ${req.params.id} not found!`)
          }
        } catch (err: unknown) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }
    )

    this.app.get(`${HISTORY_API_PATH}/values`, (req, res) =>
      respondWith(
        () => this.useProvider(req),
        (provider) => {
          return provider.getValues(parseValuesQuery(req.query))
        },
        res
      )
    )

    this.app.get(`${HISTORY_API_PATH}/contexts`, (req, res) =>
      respondWith(
        () => this.useProvider(req),
        (provider) => {
          const { timeRangeParams, errors } = parseTimeRangeParams(req.query)
          if (errors.length > 0) {
            throw new Error(`Validation errors: ${errors.join(', ')}`)
          }
          debug.enabled && debug(JSON.stringify(timeRangeParams, null, 2))
          return provider.getContexts(timeRangeParams)
        },
        res
      )
    )

    this.app.get(`${HISTORY_API_PATH}/paths`, (req, res) =>
      respondWith(
        () => this.useProvider(req),
        (provider) => {
          const { timeRangeParams, errors } = parseTimeRangeParams(req.query)
          if (errors.length > 0) {
            throw new Error(`Validation errors: ${errors.join(', ')}`)
          }
          debug.enabled && debug(JSON.stringify(timeRangeParams, null, 2))
          return provider.getPaths(timeRangeParams)
        },
        res
      )
    )
  }

  // Commit the new default only when the write succeeds, so a failed
  // save does not leave the active provider or the in-memory settings
  // out of sync with the settings file. The write gets an immutable
  // snapshot; app.config.settings is untouched until the write lands.
  private saveConfiguredProvider(id: string, cb: (err?: Error) => void) {
    const settings = this.app.config.settings
    const snapshot = {
      ...settings,
      historyApi: {
        ...settings.historyApi,
        defaultProvider: id
      }
    }
    writeSettingsFile(this.app, snapshot, (err?: Error) => {
      if (!err) {
        settings.historyApi = snapshot.historyApi
        this.configuredProviderId = id
        // The newly configured id is guaranteed registered by the
        // caller, so any active "unavailable" warning no longer applies.
        this.notifyConfiguredAvailable()
      }
      cb(err)
    })
  }

  // Raise a warn notification the first time a request needs the
  // default provider while the configured one is unavailable; cleared
  // via notifyConfiguredAvailable() when its plugin registers again.
  private warnIfConfiguredUnavailable() {
    const configured = this.configuredProviderId
    if (
      !configured ||
      this.historyProviders.has(configured) ||
      this.warnedUnavailable
    ) {
      return
    }
    this.warnedUnavailable = true
    const fallback = this.defaultProviderId
    this.notify(
      'warn',
      `Configured default history provider '${configured}' is not available` +
        (fallback
          ? `, using '${fallback}' instead`
          : ' and no other provider is registered')
    )
  }

  private notifyConfiguredAvailable() {
    if (!this.warnedUnavailable) {
      return
    }
    this.warnedUnavailable = false
    this.notify(
      'normal',
      `Configured default history provider '${this.configuredProviderId}' is available`
    )
  }

  private notify(state: 'normal' | 'warn', message: string) {
    this.app.handleMessage('historyApi', {
      updates: [
        {
          values: [
            {
              path: PROVIDER_NOTIFICATION_PATH,
              value: {
                state,
                method: [],
                message
              }
            }
          ]
        }
      ]
    })
  }

  private defaultProvider(): HistoryProvider {
    this.warnIfConfiguredUnavailable()
    if (
      this.defaultProviderId &&
      this.historyProviders.has(this.defaultProviderId)
    ) {
      return this.historyProviders.get(this.defaultProviderId)!
    }
    throw new Error('No history api provider configured')
  }

  private useProvider(req: Request): HistoryProvider | undefined {
    if (req.query.provider) {
      const provider = this.historyProviders.get(req.query.provider as string)
      if (!provider) {
        throw new Error(`Requested provider not found! (${req.query.provider})`)
      }
      return provider
    }
    this.warnIfConfiguredUnavailable()
    return this.defaultProviderId
      ? this.historyProviders.get(this.defaultProviderId)
      : undefined
  }
}

async function respondWith<T>(
  getProvider: () => HistoryProvider | undefined,
  handler: (provider: HistoryProvider) => Promise<T> | undefined,
  res: Response
) {
  try {
    const provider = getProvider()
    if (!provider) {
      return res
        .status(501)
        .json({ error: 'No history api provider configured' })
    }
    res.json(await handler(provider))
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request'
    })
  }
}

const parseValuesQuery = (query: Record<string, unknown>): ValuesRequest => {
  const { timeRangeParams, errors } = parseTimeRangeParams(query)

  const context = query.context as Context | undefined
  let resolution: number | undefined
  try {
    resolution = parseResolution(query.resolution)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Invalid resolution')
  }

  const paths = query.paths as string
  if (!paths) {
    errors.push('paths parameter is required and must be a string')
  }

  let sourcePolicy: HistorySourcePolicy | undefined
  try {
    sourcePolicy = parseSourcePolicy(query.sourcePolicy)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Invalid sourcePolicy')
  }

  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`)
  }

  const pathExpressions = ((query.paths as string) || '')
    .replace(/[^0-9a-z.,_:|]/gi, '')
    .split(',')
  const pathSpecs: PathSpec[] = pathExpressions.map(splitPathExpression)

  const parsed = {
    ...timeRangeParams,
    context,
    resolution,
    sourcePolicy,
    pathSpecs
  }
  debug.enabled && debug(JSON.stringify(parsed, null, 2))
  return parsed
}

const parseSourcePolicy = (value: unknown): HistorySourcePolicy | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'preferred' || value === 'all') return value
  throw new Error("sourcePolicy parameter must be 'preferred' or 'all'")
}

// Maps the single-letter unit suffix in a resolution time expression to seconds.
const RESOLUTION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400
}

// Matches resolution time expressions per the History API spec, e.g.
// '1s' -> 1, '15m' -> 900, '2h' -> 7200, '1d' -> 86400.
const RESOLUTION_TIME_EXPRESSION = /^(\d+)([smhd])$/

// Parses the `resolution` query parameter into seconds.
// Accepts a number (already in seconds), a numeric string, or a time
// expression of the form `<integer><unit>` where unit is s|m|h|d.
// Returns undefined when the parameter is absent.
// Exported for unit testing.
export const parseResolution = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const match = RESOLUTION_TIME_EXPRESSION.exec(trimmed)
  if (match) {
    return Number(match[1]) * RESOLUTION_UNIT_SECONDS[match[2]]
  }
  const asNumber = Number(trimmed)
  if (!Number.isNaN(asNumber)) return asNumber
  throw new Error(
    `resolution parameter must be a number of seconds or a time expression like '1s', '1m', '1h', '1d'`
  )
}

// Parses a path expression into a PathSpec.
// Input examples and what they parse into:
//   'navigation.speedOverGround'                    -> { path, aggregate: 'average', parameter: [] }
//   'navigation.speedOverGround:max'                -> { path, aggregate: 'max',     parameter: [] }
//   'navigation.speedOverGround:sma:5'              -> { path, aggregate: 'sma',     parameter: ['5'] }
//   'navigation.speedOverGround|n2k-on-ve.can0.115' -> { path, aggregate: 'average', parameter: [], sourceRef }
//   'navigation.speedOverGround:max|n2k-on-ve.can0.115' -> { path, aggregate: 'max', parameter: [], sourceRef }
//   'navigation.position'                           -> { path, aggregate: 'first',   parameter: [] }
//   'navigation.position:last'                      -> { path, aggregate: 'last',    parameter: [] }
//
// The `|` separator is used to specify a sourceRef after the path and aggregate.
//
// `navigation.position` is object-valued (lat/lon), so numeric aggregates
// like `average` are not meaningful. When the caller does not specify an
// aggregate, we default to `first` instead of the usual `average`. An
// explicit aggregate is always honored so callers can still ask for
// `last` or `middle_index` when that matches their intent.
export const splitPathExpression = (pathExpression: string): PathSpec => {
  const pipeIdx = pathExpression.indexOf('|')
  let sourceRef: SourceRef | undefined
  let expr: string
  if (pipeIdx >= 0) {
    sourceRef = pathExpression.substring(pipeIdx + 1) as SourceRef
    expr = pathExpression.substring(0, pipeIdx)
  } else {
    expr = pathExpression
  }

  const parts = expr.split(':')
  const aggregateMethod = (parts[1] ||
    (parts[0] === 'navigation.position'
      ? 'first'
      : 'average')) as AggregateMethod

  const parameters: string[] = parts.slice(2).filter((p) => p.length > 0)

  const spec: PathSpec = {
    path: parts[0] as Path,
    aggregate: aggregateMethod,
    parameter: parameters
  }
  if (sourceRef) {
    spec.sourceRef = sourceRef
  }
  return spec
}

// Exported for unit testing.
export const parseTimeRangeParams = (query: Record<string, unknown>) => {
  const errors: string[] = []

  const fromStr = query.from as string | undefined
  let from: Temporal.Instant | undefined
  if (fromStr) {
    try {
      from = Temporal.Instant.from(fromStr)
    } catch (error) {
      errors.push(
        `from parameter must be a valid ISO 8601 timestamp: ${error instanceof Error ? error.message : 'Invalid format'}`
      )
    }
  }

  const durationStr = query.duration as string | undefined
  let duration: Temporal.Duration | undefined
  if (durationStr) {
    try {
      duration = Temporal.Duration.from(durationStr)
    } catch {
      // Strict non-negative decimal integer only: rule out negatives, hex
      // (0x10), exponential (9e2), surrounding whitespace, and fractional
      // forms that Number() would otherwise silently accept.
      if (/^\d+$/.test(durationStr)) {
        duration = Temporal.Duration.from({ seconds: Number(durationStr) })
      } else {
        errors.push(
          `duration parameter must be an ISO 8601 duration string (e.g. 'PT15M') or an integer number of seconds`
        )
      }
    }
  }

  if (!from && !duration) {
    errors.push('Either from or duration parameter is required at minimum')
  }

  const toStr = query.to as string | undefined
  let to: Temporal.Instant | undefined
  if (toStr) {
    try {
      to = Temporal.Instant.from(toStr)
    } catch (error) {
      errors.push(
        `to parameter must be a valid ISO 8601 timestamp: ${error instanceof Error ? error.message : 'Invalid format'}`
      )
    }
  }

  if (from && to && duration) {
    errors.push(
      'Cannot specify all of from, to, and duration together; choose either from+to or from+duration or to+duration'
    )
  }

  if (from && to && Temporal.Instant.compare(from, to) >= 0) {
    errors.push('from parameter must be before to parameter')
  }

  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`)
  }

  return { timeRangeParams: { from, to, duration } as TimeRangeParams, errors }
}
