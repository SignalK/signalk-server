import {
  AggregateMethod,
  ContextsRequest,
  ContextsResponse,
  HistoryApi,
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

export class HistoryApiHttpRegistry {
  private provider?: HistoryApi
  private providerPluginId?: string
  proxy: HistoryApi

  constructor(private app: IRouter & WithHistoryApi) {
    this.proxy = {
      getValues: (query: ValuesRequest): Promise<ValuesResponse> => {
        return this.provider!.getValues(query)
      },
      getContexts: (query: ContextsRequest): Promise<ContextsResponse> => {
        return this.provider!.getContexts(query)
      },
      getPaths: (query: PathsRequest): Promise<PathsResponse> => {
        return this.provider!.getPaths(query)
      }
    }
  }

  registerHistoryApiProvider(pluginId: string, provider: HistoryApi): void {
    if (!isHistoryApi(provider)) {
      throw new Error('Invalid history api provider')
    }
    this.provider = provider
    this.app.historyApi = this.proxy
  }
  unregisterHistoryApiProvider(pluginId: string): void {
    if (this.providerPluginId !== pluginId) {
      throw new Error(
        'No history api provider registered for pluginId ' + pluginId
      )
    }
    this.provider = undefined
    this.providerPluginId = undefined
    this.app.historyApi = undefined
  }

  start() {
    this.app.get('/signalk/v2/history/values', async (req, res) => {
      if (!this.provider) {
        return res
          .status(501)
          .json({ error: 'No history api provider configured' })
      }
      try {
        const query = parseValuesQuery(req.query)
        const history = await this.provider.getValues(query)
        res.json(history)
      } catch (error) {
        res
          .status(400)
          .json({
            error: error instanceof Error ? error.message : 'Invalid request'
          })
      }
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

  return {
    ...timeRangeParams,
    context,
    resolution,
    pathSpecs
  }
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
  return {
    path: parts[0] as Path,
    aggregate: aggregateMethod
  }
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
