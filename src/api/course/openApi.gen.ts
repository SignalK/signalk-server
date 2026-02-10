/**
 * Generated OpenAPI 3.0.0 Document for the Signal K Course API
 *
 * Built programmatically from TypeBox schemas defined in @signalk/server-api.
 * This replaces the hand-maintained openApi.json — schema changes in
 * course-schemas.ts automatically propagate to the OpenAPI document.
 *
 * Pattern adapted from signalk-universal-installer/keeper/src/api/openapi-registry.ts
 */

import {
  PositionSchema,
  ArrivalCircleSchema,
  IsoTimeSchema,
  SignalKHrefRouteSchema,
  ActiveRouteSchema,
  NextPreviousPointSchema,
  CourseInfoSchema,
  CourseCalculationsSchema,
  SetDestinationBodySchema,
  RouteDestinationSchema,
  ArrivalCircleBodySchema,
  TargetArrivalTimeBodySchema,
  NextPointBodySchema,
  PointIndexBodySchema,
  ReverseBodySchema,
  HrefDestinationSchema,
  PositionDestinationSchema,
  OkResponseSchema,
  ErrorResponseSchema,
  CourseConfigSchema
} from '@signalk/server-api'
import { type TSchema } from '@sinclair/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

/**
 * Recursively strip TypeBox internal metadata ($id, [Symbol.for('TypeBox.Kind')],
 * etc.) so nested schemas render fully expanded in Swagger UI instead of as
 * collapsed $id references.
 */
function stripTypebox(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTypebox)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      if (key === '$id') continue
      out[key] = stripTypebox((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function toOpenApiSchema(schema: TSchema): Record<string, unknown> {
  return stripTypebox(schema) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Standard response definitions
// ---------------------------------------------------------------------------

const okResponse = {
  description: 'OK',
  content: {
    'application/json': {
      schema: toOpenApiSchema(OkResponseSchema)
    }
  }
}

const errorResponse = {
  description: 'Failed operation',
  content: {
    'application/json': {
      schema: toOpenApiSchema(ErrorResponseSchema)
    }
  }
}

const courseResponse = {
  description: 'Course details',
  content: {
    'application/json': {
      schema: toOpenApiSchema(CourseInfoSchema)
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const courseOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Course API',
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
      url: '/signalk/v2/api/vessels/self/navigation'
    }
  ],
  tags: [
    { name: 'course', description: 'Course operations' },
    { name: 'destination', description: 'Destination operations' },
    { name: 'activeRoute', description: 'Route operations' },
    { name: 'calculations', description: 'Calculated course data' },
    { name: 'configuration', description: 'Course API settings.' }
  ],
  components: {
    schemas: {
      IsoTime: toOpenApiSchema(IsoTimeSchema),
      SignalKHrefRoute: toOpenApiSchema(SignalKHrefRouteSchema),
      SignalKPosition: toOpenApiSchema(PositionSchema),
      ArrivalCircle: toOpenApiSchema(ArrivalCircleSchema),
      HrefWaypointAttribute: toOpenApiSchema(HrefDestinationSchema),
      PositionAttribute: toOpenApiSchema(PositionDestinationSchema),
      ActiveRouteModel: toOpenApiSchema(ActiveRouteSchema),
      PointModel: toOpenApiSchema(NextPreviousPointSchema),
      CourseCalculationsModel: toOpenApiSchema(CourseCalculationsSchema)
    },
    responses: {
      '200Ok': okResponse,
      ErrorResponse: errorResponse,
      CourseResponse: courseResponse
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
    '/course': {
      get: {
        tags: ['course'],
        summary: 'Retrieve current course details.',
        description: 'Returns the current course status.',
        responses: {
          '200': { $ref: '#/components/responses/CourseResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: ['course'],
        summary: 'Cancel / clear course.',
        description: 'Clear all course information.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/arrivalCircle': {
      put: {
        tags: ['course'],
        summary: 'Set arrival zone size.',
        description:
          'Sets the radius of a circle in meters centered at the current destination.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(ArrivalCircleBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/restart': {
      put: {
        tags: ['course'],
        summary: 'Restart course calculations.',
        description:
          'Sets previousPoint value to current vessel position and bases calculations on update.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/targetArrivalTime': {
      put: {
        tags: ['course'],
        summary: 'Set target arrival time.',
        description:
          'Sets the desired time to arrive at the destination. Used to calculate targetSpeed.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(TargetArrivalTimeBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/destination': {
      put: {
        tags: ['destination'],
        summary: 'Set destination.',
        description: 'Sets nextPoint path with supplied details.',
        requestBody: {
          description: 'Destination details.',
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(SetDestinationBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/activeRoute': {
      put: {
        tags: ['activeRoute'],
        summary: 'Set active route.',
        description:
          'Sets activeRoute path and sets nextPoint to first point in the route.',
        requestBody: {
          description: 'Route to activate.',
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(RouteDestinationSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/activeRoute/nextPoint': {
      put: {
        tags: ['activeRoute'],
        summary: 'Set next point in route.',
        description: 'Sets nextPoint / previousPoint.',
        requestBody: {
          description: 'Destination details.',
          required: false,
          content: {
            'application/json': {
              schema: toOpenApiSchema(NextPointBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/activeRoute/pointIndex': {
      put: {
        tags: ['activeRoute'],
        summary: 'Set point in route as destination.',
        description: 'Sets destination to the point with the provided index.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(PointIndexBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/activeRoute/reverse': {
      put: {
        tags: ['activeRoute'],
        summary: 'Reverse route direction.',
        description: 'Reverse the direction the active route is navigated.',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: toOpenApiSchema(ReverseBodySchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/activeRoute/refresh': {
      put: {
        tags: ['activeRoute'],
        summary: 'Refresh course information.',
        description: 'Refresh course values after a change has been made.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/calcValues': {
      get: {
        tags: ['calculations'],
        summary: 'Course calculated values.',
        description: 'Returns the current course status.',
        responses: {
          '200': {
            description: 'Course data.',
            content: {
              'application/json': {
                schema: toOpenApiSchema(CourseCalculationsSchema)
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/_config': {
      get: {
        tags: ['configuration'],
        summary: 'Retrieve Course API configuration.',
        description: 'Returns the current Course API configuration settings.',
        responses: {
          '200': {
            description: 'Course data.',
            content: {
              'application/json': {
                schema: toOpenApiSchema(CourseConfigSchema)
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/course/_config/apiOnly': {
      post: {
        tags: ['configuration'],
        summary: 'Set API Only mode.',
        description: 'Accept REST API requests only. Ignores NMEA sources.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: ['configuration'],
        summary: 'Clear API Only mode.',
        description: 'Accept both REST API requests and NMEA source data.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}
