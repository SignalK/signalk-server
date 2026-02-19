/**
 * OpenAPI 3.1.0 Document for the Signal K Radar API
 */

import {
  RadarInfoSchema,
  RadarControlsSchema,
  RadarControlValueSchema,
  RadarStatusSchema
} from '@signalk/server-api'
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

const radarIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Radar ID',
  schema: { type: 'string' }
}

// ---------------------------------------------------------------------------
// Helper for simple control endpoints
// ---------------------------------------------------------------------------

function controlEndpoint(
  summary: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestSchema: Record<string, any>,
  successDescription: string
) {
  return {
    put: {
      tags: ['radar'],
      summary,
      parameters: [radarIdParam],
      requestBody: {
        content: {
          'application/json': {
            schema: requestSchema
          }
        }
      },
      responses: {
        '200': { description: successDescription },
        '403': { description: 'Unauthorized' },
        '404': { description: 'Radar not found' }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const radarOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Radar API',
    description: 'API for managing marine radar devices',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/signalk/v2/api/vessels/self/radars' }],
  tags: [
    { name: 'radar', description: 'Radar operations' },
    { name: 'provider', description: 'Provider management' }
  ],
  components: {
    schemas: {
      RadarInfo: toOpenApiSchema(RadarInfoSchema),
      RadarControls: toOpenApiSchema(RadarControlsSchema),
      RadarControlValue: toOpenApiSchema(RadarControlValueSchema),
      RadarStatus: toOpenApiSchema(RadarStatusSchema)
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['radar'],
        summary: 'List all radars',
        description:
          'Returns a list of all radars from all registered providers',
        responses: {
          '200': {
            description: 'List of radars',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/RadarInfo' }
                }
              }
            }
          }
        }
      }
    },
    '/_providers': {
      get: {
        tags: ['provider'],
        summary: 'List radar providers',
        description: 'Returns a list of registered radar provider plugins',
        responses: {
          '200': {
            description: 'List of providers',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      isDefault: { type: 'boolean' }
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
        tags: ['provider'],
        summary: 'Get default provider',
        responses: {
          '200': {
            description: 'Default provider ID',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/_providers/_default/{id}': {
      post: {
        tags: ['provider'],
        summary: 'Set default provider',
        parameters: [
          {
            name: 'id',
            in: 'path' as const,
            required: true,
            description: 'Provider ID',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Default provider updated' },
          '403': { description: 'Unauthorized' },
          '400': { description: 'Provider not found' }
        }
      }
    },
    '/{id}': {
      get: {
        tags: ['radar'],
        summary: 'Get radar info',
        parameters: [radarIdParam],
        responses: {
          '200': {
            description: 'Radar information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RadarInfo' }
              }
            }
          },
          '404': { description: 'Radar not found' }
        }
      },
      put: {
        tags: ['radar'],
        summary: 'Update radar controls',
        parameters: [radarIdParam],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RadarControls' }
            }
          }
        },
        responses: {
          '200': { description: 'Controls updated' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/{id}/power': controlEndpoint(
      'Set radar power state',
      {
        type: 'object',
        properties: {
          value: toOpenApiSchema(RadarStatusSchema)
        },
        required: ['value']
      },
      'Power state updated'
    ),
    '/{id}/range': controlEndpoint(
      'Set radar range',
      {
        type: 'object',
        properties: {
          value: { type: 'number', description: 'Range in meters' }
        },
        required: ['value']
      },
      'Range updated'
    ),
    '/{id}/gain': controlEndpoint(
      'Set radar gain',
      {
        type: 'object',
        properties: {
          auto: { type: 'boolean' },
          value: { type: 'number' }
        },
        required: ['auto']
      },
      'Gain updated'
    )
  }
}
