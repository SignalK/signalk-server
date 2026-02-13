/**
 * OpenAPI 3.1.0 Document for the Signal K Course API
 *
 * Built from TypeBox schemas defined in @signalk/server-api.
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
  CourseConfigSchema
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
// Course-specific response definitions
// ---------------------------------------------------------------------------

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
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
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
    securitySchemes
  },
  security: defaultSecurity,
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
