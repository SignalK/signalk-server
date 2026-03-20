import { AlarmSchema } from '@signalk/server-api/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const notificationsAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Notifications API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for Signal K notifications.

## Overview
Notifications are emitted as deltas under \`notifications.*\` paths when
alarms are raised, updated, or cleared by the server or plugins.

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "notifications.*", "period": 1000 }
  ]
}
\`\`\`

## REST API
For the REST API documentation, see OpenAPI at \`/admin/openapi/\`.
    `.trim(),
    license: {
      name: 'Apache 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  servers: {
    signalk: {
      host: 'localhost:3000',
      protocol: 'ws',
      description: 'Signal K server WebSocket endpoint',
      pathname: '/signalk/v2/stream'
    }
  },
  channels: {
    notifications: {
      address: 'notifications.*',
      description:
        'Notification delta channel. Emits when alarms are raised, updated, or cleared.',
      messages: {
        notification: {
          name: 'notifications.*',
          title: 'Notification',
          summary: 'An alarm or notification state change',
          contentType: 'application/json',
          payload: AlarmSchema
        }
      }
    }
  },
  operations: {
    receiveNotification: {
      action: 'receive',
      channel: { $ref: '#/channels/notifications' },
      summary: 'Receive notification deltas'
    }
  }
}
