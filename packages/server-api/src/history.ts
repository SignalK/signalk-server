import { Context, Path, Timestamp } from '.'
import { Temporal } from '@js-temporal/polyfill'

export type AggregateMethod =
  | 'average'
  | 'min'
  | 'max'
  | 'first'
  | 'last'
  | 'mid'
  | 'middle_index'

export type ValueList = {
  path: Path
  method: AggregateMethod
}[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataRow = [Timestamp, ...any[]]

export interface ValuesResponse {
  context: Context
  range: {
    from: Timestamp
    to: Timestamp
  }
  values: ValueList

  data: DataRow[]
}

/** @ignore */
const _example: ValuesResponse = {
  context:
    'vessels.urn:mrn:signalk:uuid:2ffee4a6-52f6-4d4e-8179-0fc9aaf22c87' as Context,
  range: {
    from: '2025-08-11T05:26:04.888Z' as Timestamp,
    to: '2025-08-11T05:41:04.888Z' as Timestamp
  },
  values: [
    {
      path: 'navigation.speedOverGround' as Path,
      method: 'average' as AggregateMethod
    }
  ],
  data: [
    ['2025-08-11T05:26:05.000Z' as Timestamp, null],
    ['2025-08-11T05:26:10.000Z' as Timestamp, 3.14]
  ]
}

export type TimeRangeQueryParams =
  | {
      // only duration, to defaults to now
      duration: number | string
      from?: never
      to?: never
    }
  | {
      // duration from
      duration: number | string
      from: string
      to?: never
    }
  | {
      // duration to
      duration: number | string
      from?: never
      to: string
    }
  | {
      // no duration, only from, to defaults to now
      duration?: never
      from: string
      to?: never
    }
  | {
      // from - to
      duration: never
      from: string
      to: string
    }

export type ValuesRequestQueryParams = TimeRangeQueryParams & {
  context?: string
  resolution?: number
}

export type PathsRequestQueryParams = TimeRangeQueryParams
export type PathsResponse = Path[]

export type ContextsRequestQueryParams = TimeRangeQueryParams
export type ContextsResponse = Context[]

export type HistoryApiRegistry = {
  registerHistoryApiProvider(provider: HistoryApi): void
  unregisterHistoryApiProvider(): void
}
/** @category  History API */
export type WithHistoryApi = {
  /**
   * Returns a promise for the active History API implementation, or rejects if unavailable.
   * The property is optional to support explicitly older servers that do not have a history api provider.
   *
   * @returns Promise that resolves to a {@link HistoryApi} instance if available, or rejects with an error if not.
   */
  getHistoryApi?: () => Promise<HistoryApi>
}

/** @category  History API */
export interface HistoryApi {
  /**
   * Retrieves historical values for the specified query parameters.
   *
   * @param query - The {@link ValuesRequest} containing context, time range, resolution, and path specifications.
   * @returns A promise that resolves to a {@link ValuesResponse} containing the requested historical data.
   */
  getValues(query: ValuesRequest): Promise<ValuesResponse>

  /**
   * Lists available contexts for which historical data can be queried.
   *
   * @param query - The {@link ContextsRequest} specifying time range and filters.
   * @returns A promise that resolves to a {@link ContextsResponse} array of available contexts.
   */
  getContexts(query: ContextsRequest): Promise<ContextsResponse>

  /**
   * Lists available paths for historical data queries.
   *
   * @param query - The {@link PathsRequest} specifying time range and filters.
   * @returns A promise that resolves to a {@link PathsResponse} array of available paths.
   */
  getPaths(query: PathsRequest): Promise<PathsResponse>
}

export function isHistoryApi(obj: unknown): obj is HistoryApi {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  return (
    typeof (obj as HistoryApi).getValues === 'function' &&
    typeof (obj as HistoryApi).getContexts === 'function' &&
    typeof (obj as HistoryApi).getPaths === 'function'
  )
}

/**
 * Represents a time duration, either as a {@link Temporal.Duration} object or a number (milliseconds).
 *
 * @example
 * // Using Temporal.Duration
 * const duration: Duration = Temporal.Duration.from({ minutes: 5 });
 *
 * // Using milliseconds
 * const duration: Duration = 300000; // 5 minutes in milliseconds
 */
export type Duration = Temporal.Duration | number

export type TimeRangeParams =
  | {
      // only duration, to defaults to now
      duration: Temporal.Duration
      from?: never
      to?: never
    }
  | {
      // duration from
      duration: Duration
      from: Temporal.Instant
      to?: never
    }
  | {
      // duration to
      duration: Duration
      from?: never
      to: Temporal.Instant
    }
  | {
      // no duration, only from, to defaults to now
      duration?: never
      from: Temporal.Instant
      to?: never
    }
  | {
      // from - to
      duration: never
      from: Temporal.Instant
      to: Temporal.Instant
    }

export interface PathSpec {
  path: Path
  aggregate: AggregateMethod
}

export type ValuesRequest = TimeRangeParams & {
  context?: Context
  resolution?: number
  pathSpecs: PathSpec[]
}

export type PathsRequest = TimeRangeParams
export type ContextsRequest = TimeRangeParams
