import { _AttrSchema, MetaValue } from './metadata'

/** RFC 3339 (UTC only without local offset) string representing date and time. */
export type Timestamp = string

/** NMEA2000 pgn of the source message */
export type Pgn = string

export type FullValue<T> = CommonValueFields & {
  value?: T
  values?: {
    value?: T
    timestamp?: Timestamp
    pgn?: Pgn
    sentence?: string
  }
}

export interface CommonValueFields {
  timestamp: Timestamp
  /**
   * Reference to the source under /sources. A dot spearated path to the data. eg [type].[bus].[device]
   */
  $source: string
  _attr?: _AttrSchema
  meta?: MetaValue
  pgn?: Pgn
  sentence?: string
}
