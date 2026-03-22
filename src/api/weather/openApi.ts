import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  WeatherDataModelSchema,
  WeatherWarningModelSchema
} from '@signalk/server-api/typebox'

const weatherApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '2.5.0',
    title: 'Weather API',
    description: 'Signal K weather API endpoints.',
    termsOfService: 'http://signalk.org/terms/',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  externalDocs: {
    url: 'http://signalk.org/specification/',
    description: 'Signal K specification.'
  },
  servers: [{ url: '/signalk/v2/api/weather' }],
  tags: [
    {
      name: 'Weather',
      description: 'Operations to interact with weather service data.'
    },
    {
      name: 'Provider',
      description: 'Operations to view / switch providers.'
    }
  ],
  components: {
    schemas: typeboxToOpenApiSchemas([
      WeatherDataModelSchema,
      WeatherWarningModelSchema
    ]),
    responses: {
      '200OKResponse': {
        description: 'Successful operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Request success response',
              properties: {
                state: { type: 'string', enum: ['COMPLETED'] },
                statusCode: { type: 'number', enum: [200] }
              },
              required: ['state', 'statusCode']
            }
          }
        }
      },
      ErrorResponse: {
        description: 'Failed operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Request error response',
              properties: {
                state: { type: 'string', enum: ['FAILED'] },
                statusCode: { type: 'number', enum: [404] },
                message: { type: 'string' }
              },
              required: ['state', 'statusCode', 'message']
            }
          }
        }
      }
    },
    parameters: {
      ProviderIdParam: {
        name: 'id',
        in: 'path',
        description:
          'Plugin id of the weather provider the request will be directed to.',
        required: true,
        schema: { type: 'string', example: 'myweather-provider' }
      },
      ProviderIdQuery: {
        in: 'query',
        name: 'provider',
        description:
          'Plugin id of the weather provider the request will be directed to.',
        style: 'form',
        explode: false,
        schema: { type: 'string', example: 'myweather-provider' }
      },
      LatitudeParam: {
        in: 'query',
        required: true,
        name: 'lat',
        description: 'Latitude at specified position.',
        schema: { type: 'number', min: -90, max: 90 }
      },
      LongitudeParam: {
        in: 'query',
        required: true,
        name: 'lon',
        description: 'Longitude at specified position.',
        schema: { type: 'number', min: -180, max: 180 }
      },
      CountParam: {
        in: 'query',
        required: false,
        name: 'count',
        description: 'Number of entries to return.',
        schema: { type: 'number', min: 1 }
      },
      StartDateParam: {
        in: 'query',
        required: false,
        name: 'date',
        description: 'Start date for weather data to return.',
        schema: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'JAUTHENTICATION'
      }
    }
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  paths: {
    '/observations': {
      parameters: [
        { $ref: '#/components/parameters/ProviderIdQuery' },
        { $ref: '#/components/parameters/LatitudeParam' },
        { $ref: '#/components/parameters/LongitudeParam' },
        { $ref: '#/components/parameters/CountParam' },
        { $ref: '#/components/parameters/StartDateParam' }
      ],
      get: {
        tags: ['Weather'],
        summary: 'Retrieve observation data.',
        responses: {
          default: {
            description:
              'Returns the observation data for the specified location (lat / lon).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WeatherDataModel' }
                }
              }
            }
          }
        }
      }
    },
    '/forecasts/daily': {
      parameters: [
        { $ref: '#/components/parameters/ProviderIdQuery' },
        { $ref: '#/components/parameters/LatitudeParam' },
        { $ref: '#/components/parameters/LongitudeParam' },
        { $ref: '#/components/parameters/CountParam' },
        { $ref: '#/components/parameters/StartDateParam' }
      ],
      get: {
        tags: ['Weather'],
        summary: 'Retrieve daily forecast data.',
        responses: {
          default: {
            description:
              'Returns daily forecast data for the specified location (lat / lon).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WeatherDataModel' }
                }
              }
            }
          }
        }
      }
    },
    '/forecasts/point': {
      parameters: [
        { $ref: '#/components/parameters/ProviderIdQuery' },
        { $ref: '#/components/parameters/LatitudeParam' },
        { $ref: '#/components/parameters/LongitudeParam' },
        { $ref: '#/components/parameters/CountParam' },
        { $ref: '#/components/parameters/StartDateParam' }
      ],
      get: {
        tags: ['Weather'],
        summary: 'Retrieve point forecast data.',
        responses: {
          default: {
            description:
              'Returns point forecast data for the specified location (lat / lon).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WeatherDataModel' }
                }
              }
            }
          }
        }
      }
    },
    '/warnings': {
      parameters: [
        { $ref: '#/components/parameters/ProviderIdQuery' },
        { $ref: '#/components/parameters/LatitudeParam' },
        { $ref: '#/components/parameters/LongitudeParam' }
      ],
      get: {
        tags: ['Weather'],
        summary: 'Retrieve warning data.',
        responses: {
          default: {
            description:
              'Returns the warning data for the specified location (lat / lon).',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WeatherWarningModel' }
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
                    description: 'Provider identifier',
                    required: ['name', 'isDefault'],
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Provider name.'
                      },
                      isDefault: {
                        type: 'boolean',
                        description:
                          '`true` if this provider is set as the default.'
                      }
                    },
                    example: { name: 'OpenMeteo', isDefault: true }
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
              'Returns the id of the provider id that is the target of requests (if provider is not specified).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: {
                      type: 'string',
                      description: 'Provider identifier.'
                    }
                  },
                  example: { id: 'open-meteo' }
                }
              }
            }
          }
        }
      }
    },
    '/_providers/_default/{id}': {
      parameters: [{ $ref: '#/components/parameters/ProviderIdParam' }],
      post: {
        tags: ['Provider'],
        summary: 'Sets the default weather provider.',
        description: 'Sets the proivder with the supplied `id` as the default.',
        responses: {
          default: { $ref: '#/components/responses/ErrorResponse' },
          '200': { $ref: '#/components/responses/200OKResponse' }
        }
      }
    }
  }
}

export const weatherApiRecord = {
  name: 'weather',
  path: '/signalk/v2/api',
  apiDoc: weatherApiDoc as unknown as OpenApiDescription
}
