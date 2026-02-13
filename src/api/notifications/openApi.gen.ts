/**
 * OpenAPI 3.1.0 Document for the Signal K Notifications API
 */

import {
  AlarmStateSchema,
  AlarmMethodArraySchema,
  AlarmStatusSchema,
  AlarmSchema,
  NotificationResponseSchema,
  NotificationIdParamSchema
} from '@signalk/server-api'
import {
  toOpenApiSchema,
  okResponse,
  errorResponse,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Notifications-specific responses
// ---------------------------------------------------------------------------

const notificationValueResponse = {
  description: 'OK',
  content: {
    'application/json': {
      schema: toOpenApiSchema(NotificationResponseSchema)
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const notificationsOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Notifications API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [
    {
      url: '/signalk/v2/api/notifications'
    }
  ],
  tags: [{ name: 'Alerts', description: 'Alerts & Alarms' }],
  components: {
    schemas: {
      AlarmState: toOpenApiSchema(AlarmStateSchema),
      AlarmMethod: toOpenApiSchema(AlarmMethodArraySchema),
      AlarmStatus: toOpenApiSchema(AlarmStatusSchema),
      Alarm: toOpenApiSchema(AlarmSchema),
      Notification: toOpenApiSchema(NotificationResponseSchema)
    },
    responses: {
      Notification: notificationValueResponse,
      '200Ok': okResponse,
      ErrorResponse: errorResponse
    },
    parameters: {
      id: {
        name: 'id',
        in: 'path',
        description: 'Notification identifier',
        required: true,
        schema: toOpenApiSchema(NotificationIdParamSchema)
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
