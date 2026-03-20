import { AutopilotInfoSchema } from '@signalk/server-api/typebox'
import { Type } from '@sinclair/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const autopilotAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Autopilot API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for the Signal K Autopilot API.

## Overview
The Autopilot API emits deltas under \`steering.autopilot.*\` when autopilot
state changes (mode, target, engaged, actions) and under
\`notifications.steering.autopilot.*\` for alarms.

## Delta Paths
- \`steering.autopilot.mode\` — current autopilot mode
- \`steering.autopilot.state\` — current autopilot state
- \`steering.autopilot.target\` — current target heading (radians)
- \`steering.autopilot.engaged\` — whether the autopilot is engaged
- \`steering.autopilot.availableActions\` — list of available action IDs
- \`steering.autopilot.defaultPilot\` — default device ID
- \`notifications.steering.autopilot.*\` — autopilot alarms

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
    'steering.autopilot': {
      address: 'steering.autopilot',
      description:
        'Autopilot delta channel. Emits when autopilot state changes via provider updates.',
      messages: {
        mode: {
          name: 'steering.autopilot.mode',
          title: 'Autopilot Mode',
          summary: 'Current autopilot mode (e.g. standby, auto, wind, route)',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        state: {
          name: 'steering.autopilot.state',
          title: 'Autopilot State',
          summary: 'Current autopilot operational state',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        target: {
          name: 'steering.autopilot.target',
          title: 'Autopilot Target',
          summary: 'Current target heading in radians',
          contentType: 'application/json',
          payload: Type.Union([Type.Number(), Type.Null()])
        },
        engaged: {
          name: 'steering.autopilot.engaged',
          title: 'Autopilot Engaged',
          summary: 'Whether the autopilot is currently engaged',
          contentType: 'application/json',
          payload: Type.Boolean()
        },
        availableActions: {
          name: 'steering.autopilot.availableActions',
          title: 'Available Actions',
          summary: 'List of currently available autopilot action IDs',
          contentType: 'application/json',
          payload: Type.Array(Type.String())
        },
        defaultPilot: {
          name: 'steering.autopilot.defaultPilot',
          title: 'Default Pilot',
          summary: 'Device ID of the default autopilot',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        }
      }
    },
    'notifications.steering.autopilot': {
      address: 'notifications.steering.autopilot',
      description:
        'Autopilot alarm notifications. Emitted for waypoint advance/arrival, route complete, cross-track error, heading, and wind alarms.',
      messages: {
        alarm: {
          name: 'notifications.steering.autopilot.*',
          title: 'Autopilot Alarm',
          summary:
            'Alarm notification (waypointAdvance, waypointArrival, routeComplete, xte, heading, wind)',
          contentType: 'application/json',
          payload: Type.Object({
            state: Type.String({ description: 'Alarm state' }),
            method: Type.Array(Type.String()),
            message: Type.String()
          })
        }
      }
    }
  },
  operations: {
    receiveAutopilot: {
      action: 'receive',
      channel: { $ref: '#/channels/steering.autopilot' },
      summary: 'Receive autopilot state updates'
    },
    receiveAutopilotAlarms: {
      action: 'receive',
      channel: { $ref: '#/channels/notifications.steering.autopilot' },
      summary: 'Receive autopilot alarm notifications'
    }
  },
  components: {
    schemas: {
      AutopilotInfo: AutopilotInfoSchema
    }
  }
}
