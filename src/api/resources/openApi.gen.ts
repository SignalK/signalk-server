/**
 * OpenAPI 3.1.0 Document for the Signal K Resources API
 */

import {
  RouteSchema,
  WaypointSchema,
  RegionSchema,
  NoteSchema,
  ChartSchema,
  RoutePointMetaSchema,
  NoteBaseModelSchema,
  TileLayerSourceSchema,
  MapServerSourceSchema,
  BaseResponseModelSchema,
  ResourceActionOkResponseSchema,
  ResourceActionCreatedResponseSchema,
  SignalKUuidPattern
} from '@signalk/server-api'
import {
  toOpenApiSchema,
  errorResponse,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Reusable parameters
// ---------------------------------------------------------------------------

const uuidParam = {
  name: 'id',
  in: 'path' as const,
  description: 'Resource UUID',
  required: true,
  schema: {
    type: 'string',
    pattern: `${SignalKUuidPattern}$`
  }
}

const providerParam = {
  name: 'provider',
  in: 'query' as const,
  description: 'Plugin id of the resource provider',
  required: false,
  schema: { type: 'string' }
}

const limitParam = {
  name: 'limit',
  in: 'query' as const,
  description: 'Maximum number of records to return',
  required: false,
  schema: { type: 'integer', minimum: 1 }
}

const distanceParam = {
  name: 'distance',
  in: 'query' as const,
  description: 'Distance in meters for square area filtering',
  required: false,
  schema: { type: 'integer', minimum: 100 }
}

const bboxParam = {
  name: 'bbox',
  in: 'query' as const,
  description: 'Bounding box [lon1, lat1, lon2, lat2]',
  required: false,
  explode: false,
  schema: {
    type: 'array',
    items: { type: 'number' },
    minItems: 4,
    maxItems: 4
  }
}

const positionParam = {
  name: 'position',
  in: 'query' as const,
  description: 'Position [longitude, latitude]',
  required: false,
  explode: false,
  schema: {
    type: 'array',
    items: { type: 'number' },
    minItems: 2,
    maxItems: 2
  }
}

const zoomParam = {
  name: 'zoom',
  in: 'query' as const,
  description: 'Zoom level of the map',
  required: false,
  schema: { type: 'integer', minimum: 1 }
}

const listParams = [
  providerParam,
  limitParam,
  distanceParam,
  bboxParam,
  positionParam,
  zoomParam
]

// ---------------------------------------------------------------------------
// Reusable responses
// ---------------------------------------------------------------------------

const actionOkResponse = {
  description: 'Successful operation',
  content: {
    'application/json': {
      schema: toOpenApiSchema(ResourceActionOkResponseSchema)
    }
  }
}

const actionCreatedResponse = {
  description: 'Resource created',
  content: {
    'application/json': {
      schema: toOpenApiSchema(ResourceActionCreatedResponseSchema)
    }
  }
}

// ---------------------------------------------------------------------------
// CRUD path builders
// ---------------------------------------------------------------------------

function resourceCrudPaths(
  tag: string,
  basePath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceSchema: any,
  responseName: string,
  useStringId = false
) {
  const idParam = useStringId
    ? {
        name: 'id',
        in: 'path' as const,
        description: 'Resource identifier',
        required: true,
        schema: { type: 'string' }
      }
    : uuidParam

  return {
    [basePath]: {
      get: {
        tags: [tag],
        parameters: listParams,
        summary: `Retrieve list of ${tag}.`,
        description: `Returns a collection of ${tag}.`,
        responses: {
          '200': {
            description: `Collection of ${tag}`,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: toOpenApiSchema(resourceSchema)
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      post: {
        tags: [tag],
        summary: `Create a new ${tag.slice(0, -1)}.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(resourceSchema)
            }
          }
        },
        responses: {
          '201': { $ref: '#/components/responses/201ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    [`${basePath}/{id}`]: {
      get: {
        tags: [tag],
        parameters: [idParam, providerParam],
        summary: `Retrieve a ${tag.slice(0, -1)}.`,
        responses: {
          '200': { $ref: `#/components/responses/${responseName}` },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: [tag],
        parameters: [idParam, providerParam],
        summary: `Update a ${tag.slice(0, -1)}.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(resourceSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: [tag],
        parameters: [idParam, providerParam],
        summary: `Delete a ${tag.slice(0, -1)}.`,
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const resourcesOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Resources API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [
    {
      url: '/signalk/v2/api'
    }
  ],
  tags: [
    { name: 'resources', description: 'Resource types' },
    { name: 'routes', description: 'Route resources' },
    { name: 'waypoints', description: 'Waypoint resources' },
    { name: 'regions', description: 'Region resources' },
    { name: 'notes', description: 'Note resources' },
    { name: 'charts', description: 'Chart resources' },
    { name: 'providers', description: 'Resource providers' }
  ],
  components: {
    schemas: {
      Route: toOpenApiSchema(RouteSchema),
      Waypoint: toOpenApiSchema(WaypointSchema),
      Region: toOpenApiSchema(RegionSchema),
      Note: toOpenApiSchema(NoteSchema),
      Chart: toOpenApiSchema(ChartSchema),
      RoutePointMeta: toOpenApiSchema(RoutePointMetaSchema),
      NoteBaseModel: toOpenApiSchema(NoteBaseModelSchema),
      TileLayerSource: toOpenApiSchema(TileLayerSourceSchema),
      MapServerSource: toOpenApiSchema(MapServerSourceSchema),
      BaseResponseModel: toOpenApiSchema(BaseResponseModelSchema)
    },
    responses: {
      '200ActionResponse': actionOkResponse,
      '201ActionResponse': actionCreatedResponse,
      ErrorResponse: errorResponse,
      RouteResponse: {
        description: 'Route resource',
        content: {
          'application/json': {
            schema: toOpenApiSchema(RouteSchema)
          }
        }
      },
      WaypointResponse: {
        description: 'Waypoint resource',
        content: {
          'application/json': {
            schema: toOpenApiSchema(WaypointSchema)
          }
        }
      },
      RegionResponse: {
        description: 'Region resource',
        content: {
          'application/json': {
            schema: toOpenApiSchema(RegionSchema)
          }
        }
      },
      NoteResponse: {
        description: 'Note resource',
        content: {
          'application/json': {
            schema: toOpenApiSchema(NoteSchema)
          }
        }
      },
      ChartResponse: {
        description: 'Chart resource',
        content: {
          'application/json': {
            schema: toOpenApiSchema(ChartSchema)
          }
        }
      }
    }
  },
  paths: {
    '/resources': {
      get: {
        tags: ['resources'],
        summary: 'Retrieve list of available resource types.',
        description: 'Returns list of available resource types.',
        responses: {
          '200': {
            description: 'Available resource types',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      $source: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    ...resourceCrudPaths(
      'routes',
      '/resources/routes',
      RouteSchema,
      'RouteResponse'
    ),
    ...resourceCrudPaths(
      'waypoints',
      '/resources/waypoints',
      WaypointSchema,
      'WaypointResponse'
    ),
    ...resourceCrudPaths(
      'regions',
      '/resources/regions',
      RegionSchema,
      'RegionResponse'
    ),
    ...resourceCrudPaths(
      'notes',
      '/resources/notes',
      NoteSchema,
      'NoteResponse'
    ),
    ...resourceCrudPaths(
      'charts',
      '/resources/charts',
      ChartSchema,
      'ChartResponse',
      true
    ),
    '/resources/{resourceType}/_providers': {
      get: {
        tags: ['providers'],
        parameters: [
          {
            name: 'resourceType',
            in: 'path',
            description: 'Resource type',
            required: true,
            schema: { type: 'string' }
          }
        ],
        summary: 'Retrieve list of resource providers.',
        responses: {
          '200': {
            description: 'List of provider plugin ids',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    },
    '/resources/{resourceType}/_providers/_default': {
      get: {
        tags: ['providers'],
        parameters: [
          {
            name: 'resourceType',
            in: 'path',
            description: 'Resource type',
            required: true,
            schema: { type: 'string' }
          }
        ],
        summary: 'Retrieve default resource provider.',
        responses: {
          '200': {
            description: 'Default provider plugin id',
            content: {
              'application/json': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    },
    '/resources/{resourceType}/_providers/_default/{pluginId}': {
      post: {
        tags: ['providers'],
        parameters: [
          {
            name: 'resourceType',
            in: 'path',
            description: 'Resource type',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'pluginId',
            in: 'path',
            description: 'Plugin identifier',
            required: true,
            schema: { type: 'string' }
          }
        ],
        summary: 'Set default resource provider.',
        responses: {
          '200': {
            description: 'Default provider set',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: { type: 'string', enum: ['COMPLETED'] },
                    statusCode: { type: 'number', enum: [200] },
                    message: { type: 'string' }
                  },
                  required: ['state', 'statusCode', 'message']
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}
