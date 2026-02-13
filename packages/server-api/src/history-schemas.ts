/**
 * TypeBox Schema Definitions for the Signal K History API
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Aggregate method
// ---------------------------------------------------------------------------

export const AggregateMethodSchema = Type.Union(
  [
    Type.Literal('average'),
    Type.Literal('min'),
    Type.Literal('max'),
    Type.Literal('first'),
    Type.Literal('last'),
    Type.Literal('mid'),
    Type.Literal('middle_index'),
    Type.Literal('sma'),
    Type.Literal('ema')
  ],
  {
    $id: 'AggregateMethod',
    description:
      "Aggregation method for historical data. The 'sma' (Simple Moving Average) and 'ema' (Exponential Moving Average) methods accept an optional numeric parameter separated by colon: for sma it is the number of samples, for ema it is the alpha value (0-1)."
  }
)
export type AggregateMethodSchemaType = Static<typeof AggregateMethodSchema>

// ---------------------------------------------------------------------------
// Values response schema (GET /values response body)
// ---------------------------------------------------------------------------

export const ValuesResponseSchema = Type.Object(
  {
    context: Type.String({
      description: 'Signal K context that the data is about',
      examples: ['vessels.urn:mrn:imo:mmsi:123456789']
    }),
    range: Type.Object({
      from: Type.String({
        format: 'date-time',
        description: 'Start of the time range, inclusive, as UTC timestamp',
        examples: ['2018-03-20T09:12:28Z']
      }),
      to: Type.String({
        format: 'date-time',
        description: 'End of the time range, inclusive, as UTC timestamp',
        examples: ['2018-03-20T09:13:28Z']
      })
    }),
    values: Type.Array(
      Type.Object({
        path: Type.String({ description: 'Signal K path' }),
        method: Type.String({ description: 'Aggregation method' })
      })
    ),
    data: Type.Array(
      Type.Array(
        Type.Union([
          Type.String(),
          Type.Number(),
          Type.Null(),
          Type.Array(Type.Number())
        ]),
        {
          description:
            'Data for a point in time. The first array element is the timestamp in ISO 8601 format. Missing data for a path is returned as null'
        }
      ),
      {
        examples: [[['2023-11-09T02:45:38.160Z', 13.2, null, [-120.5, 59.2]]]]
      }
    )
  },
  {
    $id: 'HistoryValuesResponse',
    description: 'Historical data series with header and data rows'
  }
)
export type ValuesResponseSchemaType = Static<typeof ValuesResponseSchema>
