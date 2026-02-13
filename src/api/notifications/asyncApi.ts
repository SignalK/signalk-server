/**
 * AsyncAPI 3.0 Document for Signal K Notifications API WebSocket Deltas
 *
 * Documents the WebSocket delta channels emitted by the Notifications API.
 * Notifications are emitted under `notifications.*` paths whenever alarms
 * are raised, updated, silenced, acknowledged, or cleared.
 */

import {
  NotificationSchema,
  AlarmStateSchema,
  AlarmMethodSchema,
  PositionSchema
} from '@signalk/server-api'
import { serverVersion } from '../openapi-utils'

export const notificationsAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Notifications API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for the Signal K Notifications API.

## Overview
The Notifications API emits delta messages over the Signal K WebSocket connection
whenever notification state changes — alarms raised, silenced, acknowledged, or cleared.

## Signal K Paths
- \`notifications.{notificationId}\` — notification with auto-generated UUID path
- \`notifications.{customPath}\` — notification with custom named path (e.g. \`notifications.mob\`)
- \`notifications.{customPath}.{notificationId}\` — notification under a custom path with appended UUID

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "notifications.*", "period": 1000 }
  ]
}
\`\`\`

## Delta Format
\`\`\`json
{
  "updates": [{
    "$source": "notificationsApi",
    "values": [
      {
        "path": "notifications.mob.a1b2c3d4-...",
        "value": {
          "state": "emergency",
          "method": ["visual", "sound"],
          "message": "Man overboard!",
          "position": { "latitude": 51.5, "longitude": -0.1 },
          "id": "a1b2c3d4-..."
        }
      }
    ]
  }]
}
\`\`\`
    `.trim(),
    contact: {
      name: 'Signal K',
      url: 'https://signalk.org'
    },
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
      address: 'notifications',
      description:
        'Notification delta channel. Emits when notifications are raised, updated, silenced, acknowledged, or cleared.',
      messages: {
        notification: {
          name: 'notifications.{path}',
          title: 'Notification',
          summary:
            'A notification value emitted under notifications.{id} or notifications.{customPath}.{id}',
          contentType: 'application/json',
          payload: NotificationSchema
        }
      }
    }
  },
  operations: {
    receiveNotification: {
      action: 'receive',
      channel: { $ref: '#/channels/notifications' },
      summary: 'Receive notification delta updates',
      description:
        'Emitted when notification state changes: raise, update, silence, acknowledge, clear, or MOB.'
    }
  },
  components: {
    schemas: {
      Notification: NotificationSchema,
      AlarmState: AlarmStateSchema,
      AlarmMethod: AlarmMethodSchema,
      Position: PositionSchema
    }
  }
}
