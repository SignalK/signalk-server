import {
  AggregateMethod,
  ContextsRequest,
  ContextsResponse,
  HistoryApi,
  HistoryProviders,
  isHistoryApi,
  PathSpec,
  PathsRequest,
  PathsResponse,
  TimeRangeParams,
  ValuesRequest,
  ValuesResponse,
  WithHistoryApi
} from '@signalk/server-api/history'
import { IRouter } from 'express'
import { Temporal } from '@js-temporal/polyfill'
import { Context, Path } from '@signalk/server-api'
import { createDebug } from '../../debug'
import { Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'

const debug = createDebug('signalk-server:api:history')

const HISTORY_API_PATH = `/signalk/v2/api/history`

interface HistoryApplication extends WithSecurityStrategy, IRouter {}

export class HistoryApiHttpRegistry {
  private historyProviders: Map<string, HistoryApi> = new Map()
  private defaultProviderId?: string
  proxy: HistoryApi

  constructor(private app: HistoryApplication & WithHistoryApi) {
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
    app.getHistoryApi = () => {
      return this.defaultProviderId &&
        this.historyProviders.has(this.defaultProviderId)
        ? Promise.resolve(this.proxy)
        : Promise.reject('No history api provider configured')
    }
  }

  registerHistoryApiProvider(pluginId: string, provider: HistoryApi): void {
    if (!isHistoryApi(provider)) {
      throw new Error('Invalid history api provider')
    }
    if (!this.historyProviders.has(pluginId)) {
      this.historyProviders.set(pluginId, provider)
    }
    if (this.historyProviders.size === 1) {
      this.defaultProviderId = pluginId
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
    if (pluginId === this.defaultProviderId) {
      this.defaultProviderId = this.historyProviders.keys().next().value
    }
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
          this.historyProviders.forEach((_v: HistoryApi, k: string) => {
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
            id: this.defaultProviderId
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
            this.defaultProviderId = req.params.id
            res.status(200).json({
              statusCode: 200,
              state: 'COMPLETED',
              message: `Default provider set to ${req.params.id}.`
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
          debug(JSON.stringify(timeRangeParams, null, 2))
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
          debug(JSON.stringify(timeRangeParams, null, 2))
          return provider.getPaths(timeRangeParams)
        },
        res
      )
    )
  }

  private defaultProvider(): HistoryApi {
    if (
      this.defaultProviderId &&
      this.historyProviders.has(this.defaultProviderId)
    ) {
      return this.historyProviders.get(this.defaultProviderId)!
    }
    throw new Error('No history api provider configured')
  }

  private useProvider(req: Request): HistoryApi | undefined {
    if (req.query.provider) {
      const provider = this.historyProviders.get(req.query.provider as string)
      if (!provider) {
        throw new Error(`Requested provider not found! (${req.query.provider})`)
      }
      return provider
    }
    return this.defaultProviderId
      ? this.historyProviders.get(this.defaultProviderId)
      : undefined
  }
}

async function respondWith<T>(
  getProvider: () => HistoryApi | undefined,
  handler: (provider: HistoryApi) => Promise<T> | undefined,
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
  const resolution = getMaybeNumber(query.resolution)

  const paths = query.paths as string
  if (!paths) {
    errors.push('paths parameter is required and must be a string')
  }

  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`)
  }

  const pathExpressions = ((query.paths as string) || '')
    .replace(/[^0-9a-z.,:]/gi, '')
    .split(',')
  const pathSpecs: PathSpec[] = pathExpressions.map(splitPathExpression)

  const parsed = {
    ...timeRangeParams,
    context,
    resolution,
    pathSpecs
  }
  debug(JSON.stringify(parsed, null, 2))
  return parsed
}

const getMaybeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'number') return value
  return undefined
}

const splitPathExpression = (pathExpression: string): PathSpec => {
  const parts = pathExpression.split(':')
  let aggregateMethod = (parts[1] || 'average') as AggregateMethod
  if (parts[0] === 'navigation.position') {
    aggregateMethod = 'first' as AggregateMethod
  }

  // Extract all parameters from parts[2] onwards
  const parameters: string[] = parts.slice(2).filter((p) => p.length > 0)

  const pathSpec: PathSpec = {
    path: parts[0] as Path,
    aggregate: aggregateMethod,
    parameter: parameters
  }

  return pathSpec
}

const parseTimeRangeParams = (query: Record<string, unknown>) => {
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
  const durationNum = getMaybeNumber(query.duration)
  let duration: Temporal.Duration | undefined
  if (durationStr) {
    try {
      duration = Temporal.Duration.from(durationStr)
    } catch (error) {
      errors.push(
        `duration parameter must be a valid ISO 8601 duration string: ${error instanceof Error ? error.message : 'Invalid format'}`
      )
    }
  } else if (durationNum !== undefined) {
    duration = Temporal.Duration.from({ milliseconds: durationNum })
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
