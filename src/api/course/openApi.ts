import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  IsoTimeSchema,
  PositionSchema,
  SignalKHrefRouteSchema,
  ArrivalCircleSchema,
  HrefDestinationSchema,
  PositionDestinationSchema,
  ActiveRouteSchema,
  NextPreviousPointSchema,
  CourseCalculationsSchema,
  CoursePointTypeSchema
} from '@signalk/server-api/typebox'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const courseApiDoc: any = {
  openapi: '3.0.0',
  info: {
    version: '2.0.0',
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
  servers: [{ url: '/signalk/v2/api/vessels/self/navigation' }],
  tags: [
    { name: 'course', description: 'Course operations' },
    { name: 'destination', description: 'Destination operations' },
    { name: 'activeRoute', description: 'Route operations' },
    { name: 'calculations', description: 'Calculated course data' },
    { name: 'configuration', description: 'Course API settings.' }
  ],
  components: {
    schemas: {
      ...typeboxToOpenApiSchemas([
        IsoTimeSchema,
        SignalKHrefRouteSchema,
        PositionSchema,
        ArrivalCircleSchema,
        HrefDestinationSchema,
        PositionDestinationSchema,
        ActiveRouteSchema,
        NextPreviousPointSchema,
        CoursePointTypeSchema,
        CourseCalculationsSchema
      ]),
      ArrivalCircleAttribute: {
        type: 'object',
        properties: {
          arrivalCircle: { $ref: '#/components/schemas/ArrivalCircle' }
        }
      }
    },
    responses: {
      '200Ok': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
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
      },
      CourseResponse: {
        description: 'Course details',
        content: {
          'application/json': {
            schema: {
              description: 'Course response',
              type: 'object',
              required: ['activeRoute', 'nextPoint', 'previousPoint'],
              properties: {
                activeRoute: {
                  anyOf: [{ $ref: '#/components/schemas/ActiveRoute' }]
                },
                nextPoint: {
                  anyOf: [{ $ref: '#/components/schemas/NextPreviousPoint' }]
                },
                previousPoint: {
                  anyOf: [{ $ref: '#/components/schemas/NextPreviousPoint' }]
                },
                startTime: {
                  $ref: '#/components/schemas/IsoTime',
                  example: '2022-04-22T05:02:56.484Z',
                  description:
                    'Time at which navigation to destination commenced.'
                },
                targetArrivalTime: {
                  $ref: '#/components/schemas/IsoTime',
                  example: '2022-04-22T05:02:56.484Z',
                  description:
                    'The desired time at which to arrive at the destination.'
                },
                arrivalCircle: {
                  $ref: '#/components/schemas/ArrivalCircle'
                }
              }
            }
          }
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
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { $ref: '#/components/schemas/ArrivalCircle' }
                }
              }
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
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { $ref: '#/components/schemas/IsoTime' }
                }
              }
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
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/HrefDestination' },
                  { $ref: '#/components/schemas/PositionDestination' }
                ],
                allOf: [{ $ref: '#/components/schemas/ArrivalCircleAttribute' }]
              }
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
              schema: {
                type: 'object',
                required: ['href'],
                properties: {
                  href: { $ref: '#/components/schemas/SignalKHrefRoute' },
                  pointIndex: {
                    type: 'number',
                    default: 0,
                    minimum: 0,
                    description:
                      '0 based index of the point in the route to set as the destination'
                  },
                  reverse: {
                    type: 'boolean',
                    default: false,
                    description:
                      'Set to true to navigate the route points in reverse order.'
                  },
                  arrivalCircle: {
                    $ref: '#/components/schemas/ArrivalCircle'
                  }
                }
              }
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
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: {
                    type: 'number',
                    description: 'Index of point in route (-ive = previous)',
                    default: 1
                  }
                }
              }
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
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: {
                    type: 'number',
                    minimum: 0,
                    description:
                      'Index of point in route to set as destination.',
                    example: 2
                  }
                }
              }
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
              schema: {
                type: 'object',
                properties: {
                  pointIndex: {
                    type: 'number',
                    minimum: 0,
                    description:
                      'Index of point in route to set as destination.',
                    example: 2
                  }
                }
              }
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
                schema: {
                  $ref: '#/components/schemas/CourseCalculations'
                }
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
                schema: {
                  type: 'object',
                  properties: { apiOnly: { type: 'boolean' } },
                  required: ['apiOnly']
                }
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

export const courseApiRecord = {
  name: 'course',
  path: '/signalk/v2/api/vessels/self/navigation',
  apiDoc: courseApiDoc as unknown as OpenApiDescription
}
