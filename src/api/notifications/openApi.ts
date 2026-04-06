import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  AlarmStateSchema,
  AlarmMethodArraySchema,
  AlarmMethodSchema,
  AlarmStatusSchema,
  AlarmSchema,
  NotificationResponseSchema,
  NotificationIdParamSchema,
  AlarmUpdateOptionsSchema,
  AlarmRaiseOptionsSchema,
  PositionSchema,
  IsoTimeSchema
} from '@signalk/server-api/typebox'

const notificationsApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '2.0.0',
    title: 'Signal K Notifications API',
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
  servers: [{ url: '/signalk/v2/api/notifications' }],
  tags: [
    { name: 'Operations', description: 'Notification operations' },
    { name: 'Alarms', description: 'Predefined alarms' },
    { name: 'Actions', description: 'Notification Alarm Actions' }
  ],
  components: {
    schemas: {
      ...typeboxToOpenApiSchemas([
        NotificationIdParamSchema,
        NotificationResponseSchema,
        AlarmUpdateOptionsSchema,
        AlarmRaiseOptionsSchema,
        AlarmStateSchema,
        AlarmMethodSchema,
        AlarmMethodArraySchema,
        AlarmStatusSchema,
        AlarmSchema,
        IsoTimeSchema,
        PositionSchema
      ])
    },
    responses: {
      Notification: {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NotificationResponse' }
          }
        }
      },
      NotificationList: {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: {
                $ref: '#/components/schemas/NotificationResponse'
              }
            }
          }
        }
      },
      '200Ok': {
        description: 'Successful operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: '200 OK response',
              properties: {
                state: { type: 'string', enum: ['COMPLETED'] },
                statusCode: { type: 'number', enum: [200] }
              },
              required: ['state', 'statusCode']
            }
          }
        }
      },
      '200Post': {
        description: 'Successful operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: '200 OK response',
              properties: {
                state: { type: 'string', enum: ['COMPLETED'] },
                statusCode: { type: 'number', enum: [200] },
                id: { type: 'string', description: 'Notification Identifier' }
              },
              required: ['state', 'statusCode', 'id']
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
                statusCode: { type: 'number', enum: [400] },
                message: { type: 'string' }
              },
              required: ['state', 'statusCode', 'message']
            }
          }
        }
      }
    },
    parameters: {
      id: {
        name: 'id',
        in: 'path',
        description: 'Notification identifier',
        required: true,
        schema: { $ref: '#/components/schemas/NotificationIdParam' }
      }
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['Operations'],
        summary: 'List notifications.',
        description: 'Returns a list of notifications.',
        responses: {
          '200': { $ref: '#/components/responses/NotificationList' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      post: {
        tags: ['Operations'],
        summary: 'Raise notification.',
        description:
          'Raises a notification and sets `ALARM_METHOD` based on the supplied `state`.',
        requestBody: {
          description: 'Alarm Options',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AlarmRaiseOptions'
              }
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Post' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: {
        tags: ['Operations'],
        summary: 'Return notification details.',
        description:
          'Returns details of the notification with the supplied identifier.',
        responses: {
          '200': { $ref: '#/components/responses/Notification' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: ['Operations'],
        summary: 'Update notification.',
        description:
          'Update details of the notification with the supplied identifier.',
        requestBody: {
          description: 'Alarm Options',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AlarmUpdateOptions'
              }
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: ['Operations'],
        summary: 'Clear notification.',
        description:
          "Clears the alarm from notification with the supplied identifier by setting `ALARM_STATE = normal`'.",
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/mob': {
      post: {
        tags: ['Alarms'],
        summary: 'Raise person overboard alarm.',
        description:
          'Raises a person overboard notification setting message and ALARM_STATE = `emergency`.',
        requestBody: {
          description: 'Alarm Options',
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: 'Message to display or speak.'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200Post' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/silenceAll': {
      post: {
        tags: ['Actions'],
        summary: 'Silence all notification alarms.',
        description:
          'Removes `sound` from the ALARM METHOD of all notifications and sets `status.silenced = true`.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/acknowledgeAll': {
      post: {
        tags: ['Actions'],
        summary: 'Acknowledge all notification alarms.',
        description:
          'Removes both `visual` and `sound` from the ALARM METHOD of all notifications and sets `status.acknowledged = true`.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/silence': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      post: {
        tags: ['Actions'],
        summary: 'Silence notification alarm.',
        description:
          'Removes `sound` from the notification ALARM METHOD and sets `status.silenced = true`.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/acknowledge': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      post: {
        tags: ['Actions'],
        summary: 'Acknowledge notification alarm.',
        description:
          'Acknowledge alarm by setting `status.acknowledged = true` and removing `sound` from ALARM METHOD.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}

export const notificationsApiRecord = {
  name: 'notifications',
  path: '/signalk/v1/api/vessels/self/notifications',
  apiDoc: notificationsApiDoc as unknown as OpenApiDescription
}
