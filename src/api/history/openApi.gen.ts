/**
 * OpenAPI 3.1.0 Document for the Signal K History API
 */

import { ValuesResponseSchema } from '@signalk/server-api'
import {
  toOpenApiSchema,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Reusable parameters
// ---------------------------------------------------------------------------

const timeRangeFromParam = {
  name: 'from',
  in: 'query' as const,
  description: 'Start of the time range, inclusive as ISO 8601 timestamp',
  schema: {
    type: 'string',
    format: 'date-time',
    example: '2018-03-20T09:13:28Z'
  }
}

const timeRangeDurationParam = {
  name: 'duration',
  in: 'query' as const,
  description:
    "Duration of the time range in milliseconds (integer) or as an ISO8601 Duration string. Can be specified with either 'from' or 'to'. If they are both omitted is relative to 'now'. See https://datatracker.ietf.org/doc/html/rfc3339#appendix-A",
  schema: {
    oneOf: [
      { type: 'integer', description: 'Duration in milliseconds' },
      {
        type: 'string',
        format: 'duration',
        description: 'ISO8601 Duration string',
        example: 'PT15M'
      }
    ]
  }
}

const timeRangeToParam = {
  name: 'to',
  in: 'query' as const,
  description: "End of the time range, inclusive. 'Now' if omitted",
  schema: {
    type: 'string',
    format: 'date-time',
    example: '2018-03-20T09:13:28Z'
  }
}

const timeRangeParams = [
  timeRangeFromParam,
  timeRangeDurationParam,
  timeRangeToParam
]

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const historyOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K History API',
    description:
      'API for querying historical data, typically stored in a database. The actual storage backend is not defined by this API and can be implemented in various ways, typically as a plugin like [signalk-parquet](https://www.npmjs.com/package/signalk-parquet) and [signalk-to-influxdb2](https://www.npmjs.com/package/signalk-to-influxdb2). The most common use case for the API is to show graphs of past values.\n\n The time range can be defined as a combination of **from**, **to** and **duration** parameters. Omitted from and to parameters default to current moment in time, so that for example specifying just **duration** refers to the length of duration up to this moment.',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/signalk/v2/api/history' }],
  tags: [{ name: 'History', description: 'Historical data queries' }],
  components: {
    schemas: {
      ValuesResponse: toOpenApiSchema(ValuesResponseSchema)
    }
  },
  paths: {
    '/values': {
      get: {
        tags: ['History'],
        summary: 'Retrieve historical data',
        description:
          'Returns historical data series for the paths and time range specified in query parameters',
        parameters: [
          ...timeRangeParams,
          {
            name: 'paths',
            in: 'query' as const,
            description:
              "Comma separated list of Signal K paths whose data should be retrieved, optional aggregation methods for each path as postfix separated by a colon. Aggregation methods: 'average' | 'min' | 'max' | 'first' | 'last' | 'mid' | 'middle_index' | 'sma' | 'ema'. The 'sma' (simple moving average) and 'ema' (exponential moving average) methods accept an optional numeric parameter separated by colon: for sma it is the number of samples, for ema it is the alpha value (0-1). If not provided, implementations should use sensible defaults.",
            example:
              'navigation.speedOverGround:sma:5,navigation.speedThroughWater:max',
            schema: { type: 'string' },
            required: true
          },
          {
            name: 'context',
            in: 'query' as const,
            description:
              "Signal K context that the data is about, defaults to 'vessels.self'",
            example: 'vessels.urn:mrn:imo:mmsi:123456789',
            schema: { type: 'string' }
          },
          {
            name: 'resolution',
            in: 'query' as const,
            description:
              "Length of data sample time window in milliseconds or as a time expression ('1s', '1m', '1h', '1d'). If resolution is not specified the server should provide data in a reasonable time resolution, depending on the time range in the request.",
            schema: { type: 'number', format: 'integer' }
          }
        ],
        responses: {
          '200': {
            description: 'Series data with header',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValuesResponse' }
              }
            }
          }
        }
      }
    },
    '/contexts': {
      get: {
        tags: ['History'],
        summary: 'Get contexts that have some historical data',
        description:
          'Returns an array of contexts that have some historical data to query with /values for the specified time range',
        parameters: timeRangeParams,
        responses: {
          '200': {
            description: 'Array of contexts',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'string',
                    description: 'Signal K Context',
                    example: 'vessels.urn:mrn:imo:mmsi:123456789'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/paths': {
      get: {
        tags: ['History'],
        summary: 'Get paths that have some historical data',
        description:
          'Returns an array of paths that have some historical data to query with /values for the specified time range',
        parameters: timeRangeParams,
        responses: {
          '200': {
            description: 'Array of paths',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'string',
                    description: 'Signal K Path',
                    example: 'navigation.speedOverGround'
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dynamic examples — inject current timestamps for Swagger UI Try-It
// ---------------------------------------------------------------------------

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(historyOpenApiDoc.paths['/values'].get.parameters[0] as any).example =
  yesterday.toISOString()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(historyOpenApiDoc.paths['/values'].get.parameters[1] as any).example =
  new Date().toISOString()
