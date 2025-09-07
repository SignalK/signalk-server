import { Context, Path, Timestamp } from '.'
import { Temporal } from '@js-temporal/polyfill';

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

export interface HistoryProvider {
  getValues(
    query: ValuesRequest
  ): Promise<ValuesResponse>
  getContexts(query: ContextsRequest): Promise<ContextsResponse>
  getPaths(query: PathsRequest): Promise<PathsResponse>
}

export function isHistoryProvider(
  obj: unknown
): obj is HistoryProvider {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  return typeof (obj as HistoryProvider).getValues === 'function' &&
    typeof (obj as HistoryProvider).getContexts === 'function' &&
    typeof (obj as HistoryProvider).getPaths === 'function'
}

type Duration = Temporal.Duration | number
type TimeRangeParams = (
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
)

export type ValuesRequest = TimeRangeParams & {
  context?: Context
  resolution?: number
}

export type PathsRequest = TimeRangeParams
export type ContextsRequest = TimeRangeParams