import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  AlarmStateSchema,
  AlarmMethodArraySchema,
  AlarmStatusSchema,
  AlarmSchema,
  NotificationResponseSchema,
  NotificationIdParamSchema
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
  tags: [{ name: 'Alerts', description: 'Alerts & Alarms' }],
  components: {
    schemas: typeboxToOpenApiSchemas([
      NotificationIdParamSchema,
      AlarmStateSchema,
      AlarmMethodArraySchema,
      AlarmStatusSchema,
      AlarmSchema,
      NotificationResponseSchema
    ]),
    responses: {
      Notification: {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NotificationResponse' }
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
                state: { type: 'string', enum: ['COMPLETE'] },
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
    '/{id}/silence': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      post: {
        tags: ['Alerts'],
        summary: 'Silence alert notification.',
        description:
          'Removes `sound` from the ALARM METHOD of the notification and sets `status.silenced = true`.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/acknowledge': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      post: {
        tags: ['Alerts'],
        summary: 'Acknowledge alert notification.',
        description:
          'Removes both `visual` and `sound` from the ALARM METHOD of the notification and sets `status.acknowledged = true`.',
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
