import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  RadarInfoSchema,
  RadarControlsSchema,
  RadarControlValueSchema
} from '@signalk/server-api/typebox'

const radarApiDoc = {
  openapi: '3.0.0',
  info: {
    title: 'Signal K Radar API',
    version: '2.0.0',
    description: 'API for managing marine radar devices'
  },
  components: {
    schemas: {
      ...typeboxToOpenApiSchemas([
        RadarControlValueSchema,
        RadarControlsSchema,
        RadarInfoSchema
      ]),
      ArpaTarget: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'Target ID (unique within radar)'
          },
          status: {
            type: 'string',
            enum: ['tracking', 'acquiring', 'lost'],
            description: 'Current tracking status'
          },
          position: {
            type: 'object',
            properties: {
              bearing: {
                type: 'number',
                description: 'Bearing from radar in radians [0, 2π)'
              },
              distance: {
                type: 'integer',
                description: 'Distance from radar in meters'
              },
              latitude: {
                type: 'number',
                description: 'Latitude if available'
              },
              longitude: {
                type: 'number',
                description: 'Longitude if available'
              }
            },
            required: ['bearing', 'distance']
          },
          motion: {
            type: 'object',
            description:
              'Target motion. Omitted if not yet known; present with speed=0 for stationary targets.',
            properties: {
              course: {
                type: 'number',
                description: 'Course over ground in radians [0, 2π)'
              },
              speed: { type: 'number', description: 'Speed in m/s' }
            },
            required: ['course', 'speed']
          },
          danger: {
            type: 'object',
            description:
              'Collision danger assessment. Omitted when vessels are diverging.',
            properties: {
              cpa: {
                type: 'number',
                description: 'Closest Point of Approach in meters'
              },
              tcpa: {
                type: 'number',
                description: 'Time to CPA in seconds'
              }
            },
            required: ['cpa', 'tcpa']
          },
          acquisition: {
            type: 'string',
            enum: ['auto', 'manual'],
            description: 'How target was acquired'
          },
          sourceZone: {
            type: 'integer',
            description:
              'Guard zone that acquired this target (1 or 2). Omitted for manual acquisition.'
          },
          firstSeen: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when target was first seen'
          },
          lastSeen: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when target was last updated'
          }
        },
        required: [
          'id',
          'status',
          'position',
          'acquisition',
          'firstSeen',
          'lastSeen'
        ]
      }
    }
  },
  paths: {
    '/signalk/v2/api/vessels/self/radars': {
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
                  items: { $ref: '#/components/schemas/RadarInfoModel' }
                }
              }
            }
          }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/_providers': {
      get: {
        tags: ['radar'],
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
    '/signalk/v2/api/vessels/self/radars/_providers/_default': {
      get: {
        tags: ['radar'],
        summary: 'Get default provider',
        responses: {
          '200': {
            description: 'Default provider ID',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/_providers/_default/{id}': {
      post: {
        tags: ['radar'],
        summary: 'Set default provider',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Default provider updated' },
          '403': { description: 'Unauthorized' },
          '400': { description: 'Provider not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{id}': {
      get: {
        tags: ['radar'],
        summary: 'Get radar info',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Radar information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RadarInfoModel' }
              }
            }
          },
          '404': { description: 'Radar not found' }
        }
      },
      put: {
        tags: ['radar'],
        summary: 'Update radar controls',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RadarControlsModel' }
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
    '/signalk/v2/api/vessels/self/radars/{id}/power': {
      put: {
        tags: ['radar'],
        summary: 'Set radar power state',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  value: {
                    type: 'string',
                    enum: ['off', 'standby', 'transmit', 'warming']
                  }
                },
                required: ['value']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Power state updated' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{id}/range': {
      put: {
        tags: ['radar'],
        summary: 'Set radar range',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  value: { type: 'number', description: 'Range in meters' }
                },
                required: ['value']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Range updated' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{id}/gain': {
      put: {
        tags: ['radar'],
        summary: 'Set radar gain',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  auto: { type: 'boolean' },
                  value: { type: 'number' }
                },
                required: ['auto']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Gain updated' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{id}/targets': {
      get: {
        tags: ['radar', 'targets'],
        summary: 'Get tracked targets',
        description:
          'Returns all currently tracked ARPA/MARPA targets for this radar',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'List of tracked targets',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ArpaTarget' }
                }
              }
            }
          },
          '404': { description: 'Radar not found' },
          '501': { description: 'Target tracking not supported by this radar' }
        }
      },
      post: {
        tags: ['radar', 'targets'],
        summary: 'Acquire target manually',
        description:
          'Manually acquire a target at the specified bearing and distance',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bearing: {
                    type: 'number',
                    description: 'Bearing in radians [0, 2π)'
                  },
                  distance: {
                    type: 'number',
                    description: 'Distance in meters'
                  }
                },
                required: ['bearing', 'distance']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Target acquired',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    targetId: { type: 'integer' }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid bearing or distance' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar not found' },
          '501': { description: 'Target acquisition not supported' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{id}/targets/{targetId}': {
      delete: {
        tags: ['radar', 'targets'],
        summary: 'Cancel target tracking',
        description: 'Stop tracking the specified target',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'targetId',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          '200': {
            description: 'Target cancelled',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid target ID' },
          '403': { description: 'Unauthorized' },
          '404': { description: 'Radar or target not found' },
          '501': { description: 'Target cancellation not supported' }
        }
      }
    }
  }
}

export const radarApiRecord = {
  name: 'radar',
  path: '/signalk/v2/api/vessels/self/radars',
  apiDoc: radarApiDoc as unknown as OpenApiDescription
}
