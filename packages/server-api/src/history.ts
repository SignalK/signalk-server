import { Context, Path, Timestamp } from '.'

export type AggregateMethod = 'average' | 'min' | 'max' | 'first' | 'last' | 'mid' | 'middle_index'

export type ValueList = {
  path: Path
  method: AggregateMethod
}[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataRow = [Timestamp, ...any[]]

export interface HistoryResponse {
  context: Context
  range: {
    from: Timestamp
    to: Timestamp
  }
  values: ValueList

  data: DataRow[]
}

const _example: HistoryResponse = {
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

export type HistoryRequestQueryParams = (
  ({
    // only duration, to defaults to now
    duration: number | string
    from?: never
    to?: never
  }) | ({
    // duration from
    duration: number | string
    from: string
    to?: never
  }) | ({
    // duration to
    duration: number | string
    from?: never
    to: string
  }) | ({
    // no duration, only from, to defaults to now
    duration?: never
    from: string
    to?: never
  }) | ({
    // from - to
    duration: never
    from: string
    to: string
  })) & {
    context?: string
    resolution?: number
  }