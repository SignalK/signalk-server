import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  PositionSchema,
  SignalKUuidSchema,
  GeoJsonPointGeometrySchema,
  GeoJsonLinestringGeometrySchema,
  GeoJsonPolygonGeometrySchema,
  GeoJsonMultiPolygonGeometrySchema,
  SignalKHrefSchema,
  HrefAttributeSchema,
  PositionAttributeSchema,
  RouteSchema,
  RoutePointMetaSchema,
  WaypointSchema,
  RegionSchema,
  NoteBaseModelSchema,
  NoteSchema,
  TileLayerSourceSchema,
  MapServerSourceSchema,
  ChartSchema,
  BaseResponseModelSchema
} from '@signalk/server-api/typebox'

/* eslint-disable @typescript-eslint/no-explicit-any */
export const resourcesApiDoc: any = {
  openapi: '3.0.0',
  info: {
    version: '2.0.0',
    title: 'Signal K Resources API',
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
  servers: [
    {
      url: '/signalk/v2/api'
    }
  ],
  tags: [
    {
      name: 'providers',
      description: 'Resource Providers'
    },
    {
      name: 'resources',
      description: 'Signal K resources'
    },
    {
      name: 'routes',
      description: 'Route operations'
    },
    {
      name: 'waypoints',
      description: 'Waypoint operations'
    },
    {
      name: 'regions',
      description: 'Region operations'
    },
    {
      name: 'notes',
      description: 'Note operations'
    },
    {
      name: 'charts',
      description: 'Chart operations'
    }
  ],
  security: [
    {
      cookieAuth: []
    },
    {
      bearerAuth: []
    }
  ],
  components: {
    schemas: {
      ...typeboxToOpenApiSchemas([
        GeoJsonPointGeometrySchema,
        GeoJsonLinestringGeometrySchema,
        GeoJsonPolygonGeometrySchema,
        GeoJsonMultiPolygonGeometrySchema,
        SignalKUuidSchema,
        SignalKHrefSchema,
        PositionSchema,
        HrefAttributeSchema,
        PositionAttributeSchema,
        RouteSchema,
        RoutePointMetaSchema,
        WaypointSchema,
        RegionSchema,
        NoteBaseModelSchema,
        NoteSchema,
        TileLayerSourceSchema,
        MapServerSourceSchema,
        ChartSchema,
        BaseResponseModelSchema
      ]),
      RouteResponseModel: {
        allOf: [
          { $ref: '#/components/schemas/Route' },
          { $ref: '#/components/schemas/BaseResponseModel' }
        ]
      },
      WaypointResponseModel: {
        allOf: [
          { $ref: '#/components/schemas/Waypoint' },
          { $ref: '#/components/schemas/BaseResponseModel' }
        ]
      },
      NoteResponseModel: {
        allOf: [
          { $ref: '#/components/schemas/Note' },
          { $ref: '#/components/schemas/BaseResponseModel' }
        ]
      },
      RegionResponseModel: {
        allOf: [
          { $ref: '#/components/schemas/Region' },
          { $ref: '#/components/schemas/BaseResponseModel' }
        ]
      },
      ChartResponseModel: {
        allOf: [
          { $ref: '#/components/schemas/Chart' },
          { $ref: '#/components/schemas/BaseResponseModel' }
        ]
      }
    },
    responses: {
      '200ActionResponse': {
        description: 'PUT, DELETE OK response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                state: {
                  type: 'string',
                  enum: ['COMPLETED']
                },
                statusCode: {
                  type: 'number',
                  enum: [200]
                },
                id: {
                  $ref: '#/components/schemas/SignalKUuid'
                }
              },
              required: ['id', 'statusCode', 'state']
            }
          }
        }
      },
      '201ActionResponse': {
        description: 'POST OK response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                state: {
                  type: 'string',
                  enum: ['COMPLETED']
                },
                statusCode: {
                  type: 'number',
                  enum: [201]
                },
                id: {
                  $ref: '#/components/schemas/SignalKUuid'
                }
              },
              required: ['id', 'statusCode', 'state']
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
                state: {
                  type: 'string',
                  enum: ['FAILED']
                },
                statusCode: {
                  type: 'number',
                  enum: [404]
                },
                message: {
                  type: 'string'
                }
              },
              required: ['state', 'statusCode', 'message']
            }
          }
        }
      },
      RouteResponse: {
        description: 'Route record response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/RouteResponseModel'
            }
          }
        }
      },
      WaypointResponse: {
        description: 'Waypoint record response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/WaypointResponseModel'
            }
          }
        }
      },
      NoteResponse: {
        description: 'Note record response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/NoteResponseModel'
            }
          }
        }
      },
      RegionResponse: {
        description: 'Region record response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/RegionResponseModel'
            }
          }
        }
      },
      ChartResponse: {
        description: 'Chart record response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ChartResponseModel'
            }
          }
        }
      }
    },
    parameters: {
      ResourceTypeParam: {
        name: 'resourceType',
        in: 'path',
        description: 'Resource type',
        required: true,
        schema: {
          type: 'string'
        }
      },
      LimitParam: {
        in: 'query',
        name: 'limit',
        description: 'Maximum number of records to return',
        schema: {
          type: 'integer',
          format: 'int32',
          minimum: 1,
          example: 100
        }
      },
      DistanceParam: {
        in: 'query',
        name: 'distance',
        description:
          "Limit results to resources that fall within a square area, centered around the vessel's position (or position parameter value if supplied), the edges of which are the sepecified distance in meters from the vessel.",
        schema: {
          type: 'integer',
          format: 'int32',
          minimum: 100,
          example: 2000
        }
      },
      BoundingBoxParam: {
        in: 'query',
        name: 'bbox',
        description:
          'Limit results to resources that fall within the bounded area defined as lower left and upper right longitude, latatitude coordinates [lon1, lat1, lon2, lat2]',
        style: 'form',
        explode: false,
        schema: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: {
            type: 'number',
            format: 'float',
            minimum: -180,
            maximum: 180
          },
          example: [135.5, -25.2, 138.1, -28]
        }
      },
      PositionParam: {
        in: 'query',
        name: 'position',
        description:
          'Location, in format [longitude, latitude], from where the distance parameter is applied.',
        style: 'form',
        explode: false,
        schema: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: {
            type: 'number',
            format: 'float',
            minimum: -180,
            maximum: 180
          },
          example: [135.5, -25.2]
        }
      },
      ZoomParam: {
        in: 'query',
        name: 'zoom',
        description:
          'Zoom level of the map used by the client to display the returned resource entries. Refer: [OSM Zoom Levels](https://wiki.openstreetmap.org/wiki/Zoom_levels)',
        schema: {
          type: 'integer',
          format: 'int32',
          minimum: 1,
          example: 4
        }
      },
      ProviderParam: {
        in: 'query',
        name: 'provider',
        description:
          'Plugin id of the resource provider to direct the request to (When multiple providers are registered for a resource type).',
        style: 'form',
        explode: false,
        schema: {
          type: 'string',
          example: 'my-provider'
        }
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
  paths: {
    '/resources': {
      get: {
        tags: ['resources'],
        summary: 'Retrieve list of available resource types',
        responses: {
          default: {
            description: 'List of available resource types identified by name',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    required: ['$source'],
                    properties: {
                      description: {
                        type: 'string'
                      },
                      $source: {
                        type: 'string'
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
    '/resources/routes': {
      parameters: [
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['routes'],
        summary: 'Retrieve route resources',
        parameters: [
          {
            $ref: '#/components/parameters/LimitParam'
          },
          {
            $ref: '#/components/parameters/DistanceParam'
          },
          {
            $ref: '#/components/parameters/BoundingBoxParam'
          },
          {
            $ref: '#/components/parameters/PositionParam'
          },
          {
            $ref: '#/components/parameters/ZoomParam'
          }
        ],
        responses: {
          default: {
            description:
              'An object containing Route resources, keyed by their UUID.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    allOf: [
                      {
                        $ref: '#/components/schemas/RouteResponseModel'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['routes'],
        summary: 'New Route',
        requestBody: {
          description: 'API request payload',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Route'
              }
            }
          }
        },
        responses: {
          '201': {
            $ref: '#/components/responses/201ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/routes/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'route id',
          required: true,
          schema: {
            $ref: '#/components/schemas/SignalKUuid'
          }
        },
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['routes'],
        summary: 'Retrieve route with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/RouteResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      put: {
        tags: ['routes'],
        summary: 'Add / update a new Route with supplied id',
        requestBody: {
          description: 'Route resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Route'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      delete: {
        tags: ['routes'],
        summary: 'Remove Route with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/waypoints': {
      parameters: [
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['waypoints'],
        summary: 'Retrieve waypoint resources',
        parameters: [
          {
            $ref: '#/components/parameters/LimitParam'
          },
          {
            $ref: '#/components/parameters/DistanceParam'
          },
          {
            $ref: '#/components/parameters/BoundingBoxParam'
          },
          {
            $ref: '#/components/parameters/PositionParam'
          },
          {
            $ref: '#/components/parameters/ZoomParam'
          }
        ],
        responses: {
          default: {
            description:
              'An object containing Waypoint resources, keyed by their UUID.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    allOf: [
                      {
                        $ref: '#/components/schemas/WaypointResponseModel'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['waypoints'],
        summary: 'New Waypoint',
        requestBody: {
          description: 'API request payload',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Waypoint'
              }
            }
          }
        },
        responses: {
          '201': {
            $ref: '#/components/responses/201ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/waypoints/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'waypoint id',
          required: true,
          schema: {
            $ref: '#/components/schemas/SignalKUuid'
          }
        },
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['waypoints'],
        summary: 'Retrieve waypoint with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/WaypointResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      put: {
        tags: ['waypoints'],
        summary: 'Add / update a new Waypoint with supplied id',
        requestBody: {
          description: 'Waypoint resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Waypoint'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      delete: {
        tags: ['waypoints'],
        summary: 'Remove Waypoint with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/regions': {
      parameters: [
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['regions'],
        summary: 'Retrieve region resources',
        parameters: [
          {
            $ref: '#/components/parameters/LimitParam'
          },
          {
            $ref: '#/components/parameters/DistanceParam'
          },
          {
            $ref: '#/components/parameters/BoundingBoxParam'
          },
          {
            $ref: '#/components/parameters/PositionParam'
          },
          {
            $ref: '#/components/parameters/ZoomParam'
          }
        ],
        responses: {
          default: {
            description:
              'An object containing Region resources, keyed by their UUID.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    allOf: [
                      {
                        $ref: '#/components/schemas/RegionResponseModel'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['regions'],
        summary: 'New Region',
        requestBody: {
          description: 'API request payload',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Region'
              }
            }
          }
        },
        responses: {
          '201': {
            $ref: '#/components/responses/201ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/regions/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'region id',
          required: true,
          schema: {
            $ref: '#/components/schemas/SignalKUuid'
          }
        },
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['regions'],
        summary: 'Retrieve region with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/RegionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      put: {
        tags: ['regions'],
        summary: 'Add / update a new Region with supplied id',
        requestBody: {
          description: 'Region resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Region'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      delete: {
        tags: ['regions'],
        summary: 'Remove Region with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/notes': {
      parameters: [
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['notes'],
        summary: 'Retrieve note resources',
        parameters: [
          {
            $ref: '#/components/parameters/LimitParam'
          },
          {
            $ref: '#/components/parameters/DistanceParam'
          },
          {
            $ref: '#/components/parameters/BoundingBoxParam'
          },
          {
            $ref: '#/components/parameters/PositionParam'
          },
          {
            $ref: '#/components/parameters/ZoomParam'
          },
          {
            name: 'href',
            in: 'query',
            description:
              'Limit results to notes with matching resource reference',
            example:
              '/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
            required: false,
            explode: false,
            schema: {
              $ref: '#/components/schemas/SignalKHref'
            }
          }
        ],
        responses: {
          default: {
            description:
              'An object containing Note resources, keyed by their UUID.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    allOf: [
                      {
                        $ref: '#/components/schemas/NoteResponseModel'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['notes'],
        summary: 'New Note',
        requestBody: {
          description: 'Note resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Note'
              }
            }
          }
        },
        responses: {
          '201': {
            $ref: '#/components/responses/201ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/notes/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'note id',
          required: true,
          schema: {
            $ref: '#/components/schemas/SignalKUuid'
          }
        },
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['notes'],
        summary: 'Retrieve note with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/NoteResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      put: {
        tags: ['notes'],
        summary: 'Add / update a new Note with supplied id',
        requestBody: {
          description: 'Note resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Note'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      delete: {
        tags: ['notes'],
        summary: 'Remove Note with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/charts': {
      parameters: [
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['charts'],
        summary: 'Retrieve chart resources',
        responses: {
          default: {
            description:
              'An object containing Chart resources, keyed by their UUID.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    allOf: [
                      {
                        $ref: '#/components/schemas/ChartResponseModel'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['charts'],
        summary: 'Add a new Chart source',
        requestBody: {
          description: 'Chart resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Chart'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/charts/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'chart id',
          required: true,
          schema: {
            type: 'string'
          }
        },
        {
          $ref: '#/components/parameters/ProviderParam'
        }
      ],
      get: {
        tags: ['charts'],
        summary: 'Retrieve chart metadata for the supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/ChartResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      put: {
        tags: ['charts'],
        summary: 'Add / update a new Chart source with supplied id',
        requestBody: {
          description: 'Chart resource entry',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Chart'
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      },
      delete: {
        tags: ['charts'],
        summary: 'Remove Chart source with supplied id',
        responses: {
          '200': {
            $ref: '#/components/responses/200ActionResponse'
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    },
    '/resources/{resourceType}/_providers': {
      parameters: [
        {
          $ref: '#/components/parameters/ResourceTypeParam'
        }
      ],
      get: {
        tags: ['providers'],
        summary: 'List of resource providers for the resource type.',
        responses: {
          default: {
            description:
              'An array of registered resource providers servicing the resource type.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/resources/{resourceType}/_providers/_default': {
      parameters: [
        {
          $ref: '#/components/parameters/ResourceTypeParam'
        }
      ],
      get: {
        tags: ['providers'],
        summary:
          'Returns the plugin id of the current default provider for the resource type.',
        responses: {
          default: {
            description:
              'An string containing the id of the resource provider plugin servicing the resource type.',
            content: {
              'application/json': {
                schema: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    },
    '/resources/{resourceType}/_providers/_default/{pluginId}': {
      parameters: [
        {
          $ref: '#/components/parameters/ResourceTypeParam'
        },
        {
          name: 'pluginId',
          in: 'path',
          description: 'Provider plugin id',
          required: true,
          schema: {
            type: 'string'
          }
        }
      ],
      post: {
        tags: ['providers'],
        summary: 'Set the default provider for the resource type.',
        responses: {
          '200': {
            description: 'OK response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: {
                      type: 'string',
                      enum: ['COMPLETED']
                    },
                    statusCode: {
                      type: 'number',
                      enum: [200]
                    },
                    message: {
                      type: 'string'
                    }
                  },
                  required: ['statusCode', 'state']
                }
              }
            }
          },
          default: {
            $ref: '#/components/responses/ErrorResponse'
          }
        }
      }
    }
  }
}

export const resourcesApiRecord = {
  name: 'resources',
  path: '/signalk/v2/api',
  apiDoc: resourcesApiDoc as unknown as OpenApiDescription
}
