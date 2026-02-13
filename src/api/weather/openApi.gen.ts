/**
 * OpenAPI 3.1.0 Document for the Signal K Weather API
 */

import {
  WeatherDataModelSchema,
  WeatherWarningModelSchema
} from '@signalk/server-api'
import {
  toOpenApiSchema,
  okResponse,
  errorResponse,
  securitySchemes,
  defaultSecurity,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Reusable parameters
// ---------------------------------------------------------------------------

const providerIdParam = {
  name: 'id',
  in: 'path' as const,
  description:
    'Plugin id of the weather provider the request will be directed to.',
  required: true,
  schema: { type: 'string', examples: ['myweather-provider'] }
}

const providerIdQuery = {
  in: 'query' as const,
  name: 'provider',
  description:
    'Plugin id of the weather provider the request will be directed to.',
  style: 'form' as const,
  explode: false,
  schema: { type: 'string', examples: ['myweather-provider'] }
}

const latitudeParam = {
  in: 'query' as const,
  required: true,
  name: 'lat',
  description: 'Latitude at specified position.',
  schema: { type: 'number', minimum: -90, maximum: 90 }
}

const longitudeParam = {
  in: 'query' as const,
  required: true,
  name: 'lon',
  description: 'Longitude at specified position.',
  schema: { type: 'number', minimum: -180, maximum: 180 }
}

const countParam = {
  in: 'query' as const,
  required: false,
  name: 'count',
  description: 'Number of entries to return.',
  schema: { type: 'number', minimum: 1 }
}

const startDateParam = {
  in: 'query' as const,
  required: false,
  name: 'date',
  description: 'Start date for weather data to return.',
  schema: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }
}

const weatherDataParams = [
  providerIdQuery,
  latitudeParam,
  longitudeParam,
  countParam,
  startDateParam
]

// ---------------------------------------------------------------------------
// Helper for weather data endpoints
// ---------------------------------------------------------------------------

function weatherDataEndpoint(summary: string, description: string) {
  return {
    get: {
      tags: ['Weather'],
      summary,
      parameters: weatherDataParams,
      responses: {
        default: {
          description,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: toOpenApiSchema(WeatherDataModelSchema)
              }
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const weatherOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Weather API',
    description: 'Signal K weather API endpoints',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/signalk/v2/api/weather' }],
  tags: [
    {
      name: 'Weather',
      description: 'Operations to interact with weather service data.'
    },
    { name: 'Provider', description: 'Operations to view / switch providers.' }
  ],
  components: {
    schemas: {
      WeatherDataModel: toOpenApiSchema(WeatherDataModelSchema),
      WeatherWarningModel: toOpenApiSchema(WeatherWarningModelSchema)
    },
    responses: {
      '200OKResponse': okResponse,
      ErrorResponse: errorResponse
    },
    securitySchemes
  },
  security: defaultSecurity,
  paths: {
    '/observations': weatherDataEndpoint(
      'Retrieve observation data.',
      'Returns the observation data for the specified location (lat / lon).'
    ),
    '/forecasts/daily': weatherDataEndpoint(
      'Retrieve daily forecast data.',
      'Returns daily forecast data for the specified location (lat / lon).'
    ),
    '/forecasts/point': weatherDataEndpoint(
      'Retrieve point forecast data.',
      'Returns point forecast data for the specified location (lat / lon).'
    ),
    '/warnings': {
      get: {
        tags: ['Weather'],
        summary: 'Retrieve warning data.',
        parameters: [providerIdQuery, latitudeParam, longitudeParam],
        responses: {
          default: {
            description:
              'Returns the warning data for the specified location (lat / lon).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: toOpenApiSchema(WeatherWarningModelSchema)
                }
              }
            }
          }
        }
      }
    },
    '/_providers': {
      get: {
        tags: ['Provider'],
        summary: 'Retrieve list of registered providers.',
        responses: {
          default: {
            description:
              'Return information about the registered weather providers.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    required: ['name', 'isDefault'],
                    properties: {
                      name: { type: 'string', description: 'Provider name.' },
                      isDefault: {
                        type: 'boolean',
                        description:
                          '`true` if this provider is set as the default.'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/_providers/_default': {
      get: {
        tags: ['Provider'],
        summary: 'Get the default weather provider id.',
        responses: {
          default: {
            description:
              'Returns the id of the provider that is the target of requests (if provider is not specified).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string', description: 'Provider identifier.' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/_providers/_default/{id}': {
      parameters: [providerIdParam],
      post: {
        tags: ['Provider'],
        summary: 'Sets the default weather provider.',
        description: 'Sets the provider with the supplied `id` as the default.',
        responses: {
          '200': { $ref: '#/components/responses/200OKResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}
