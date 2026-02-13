/**
 * AsyncAPI 3.0 Document for Signal K Autopilot API WebSocket Deltas
 *
 * Documents the WebSocket delta channels emitted by the Autopilot API.
 * The autopilot emits deltas under `steering.autopilot.*` when state changes
 * (mode, target, engaged, etc.) and under `notifications.steering.autopilot.*`
 * for autopilot-specific alarms.
 */

import { AutopilotInfoSchema } from '@signalk/server-api'
import { Type } from '@sinclair/typebox'
import { serverVersion } from '../openapi-utils'

export const autopilotAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Autopilot API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for the Signal K Autopilot API.

## Overview
The Autopilot API emits delta messages over the Signal K WebSocket connection
whenever autopilot state changes — mode, heading target, engaged state, available
actions, or autopilot alarms.

## Signal K Paths
- \`steering.autopilot.mode\` — current autopilot mode (compass, gps, wind, etc.)
- \`steering.autopilot.state\` — current state (auto, standby, etc.)
- \`steering.autopilot.target\` — heading/wind target in radians
- \`steering.autopilot.engaged\` — whether autopilot is actively steering
- \`steering.autopilot.availableActions\` — list of available action IDs
- \`steering.autopilot.defaultPilot\` — default autopilot device ID
- \`notifications.steering.autopilot.*\` — autopilot-specific alarms

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "steering.autopilot.*", "period": 1000 }
  ]
}
\`\`\`

## Delta Format
\`\`\`json
{
  "updates": [{
    "$source": "autopilotApi.deviceId",
    "values": [
      { "path": "steering.autopilot.mode", "value": "compass" },
      { "path": "steering.autopilot.target", "value": 1.5708 },
      { "path": "steering.autopilot.engaged", "value": true }
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
    'steering.autopilot': {
      address: 'steering.autopilot',
      description:
        'Autopilot state delta channel. Emits when autopilot mode, target, state, or engagement changes.',
      messages: {
        mode: {
          name: 'steering.autopilot.mode',
          title: 'Autopilot Mode',
          summary:
            'Current autopilot mode (e.g. compass, gps, wind, route, standby)',
          contentType: 'application/json',
          payload: Type.String({
            description:
              'Autopilot mode identifier. Provider-defined — common values include compass, gps, wind, route, standby.',
            examples: ['compass', 'gps', 'wind']
          })
        },
        state: {
          name: 'steering.autopilot.state',
          title: 'Autopilot State',
          summary: 'Current autopilot state (e.g. auto, standby)',
          contentType: 'application/json',
          payload: Type.String({
            description:
              'Autopilot state identifier. Provider-defined — common values include auto, standby.',
            examples: ['auto', 'standby']
          })
        },
        target: {
          name: 'steering.autopilot.target',
          title: 'Autopilot Target',
          summary: 'Heading or wind angle target in radians',
          contentType: 'application/json',
          payload: Type.Number({
            description:
              'Target angle in radians. Interpretation depends on the current mode (heading for compass, wind angle for wind mode).',
            units: 'rad',
            examples: [1.5708]
          })
        },
        engaged: {
          name: 'steering.autopilot.engaged',
          title: 'Autopilot Engaged',
          summary: 'Whether the autopilot is actively steering',
          contentType: 'application/json',
          payload: Type.Boolean({
            description:
              'True when the autopilot is actively steering the vessel'
          })
        },
        availableActions: {
          name: 'steering.autopilot.availableActions',
          title: 'Available Actions',
          summary: 'List of currently available autopilot action IDs',
          contentType: 'application/json',
          payload: Type.Array(
            Type.String({
              description: 'Action identifier',
              examples: ['dodge', 'tack', 'gybe']
            }),
            {
              description:
                'Action IDs available in the current state. Known actions: dodge, tack, gybe, courseCurrentPoint, courseNextPoint.'
            }
          )
        },
        defaultPilot: {
          name: 'steering.autopilot.defaultPilot',
          title: 'Default Pilot',
          summary: 'The default autopilot device identifier',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()], {
            description:
              'Device identifier of the default autopilot, or null if none is set'
          })
        }
      }
    },
    'notifications.steering.autopilot': {
      address: 'notifications.steering.autopilot',
      description:
        'Autopilot alarm delta channel. Emits for autopilot-specific alarms such as waypoint arrival, route completion, and cross-track error.',
      messages: {
        alarm: {
          name: 'notifications.steering.autopilot.{alarmType}',
          title: 'Autopilot Alarm',
          summary:
            'Autopilot alarm notification (waypointAdvance, waypointArrival, routeComplete, xte, heading, wind)',
          contentType: 'application/json',
          payload: Type.Object({
            path: Type.String({
              description:
                'Notification path, e.g. notifications.steering.autopilot.waypointArrival'
            }),
            value: Type.Unknown({
              description:
                'Notification value object (state, method[], message) or null when cleared'
            })
          })
        }
      }
    }
  },
  operations: {
    receiveAutopilotState: {
      action: 'receive',
      channel: { $ref: '#/channels/steering.autopilot' },
      summary: 'Receive autopilot state delta updates',
      description:
        'Emitted when autopilot state changes: mode, target heading, engaged, available actions, or default pilot.'
    },
    receiveAutopilotAlarm: {
      action: 'receive',
      channel: { $ref: '#/channels/notifications.steering.autopilot' },
      summary: 'Receive autopilot alarm notifications',
      description:
        'Emitted for autopilot-specific alarms: waypointAdvance, waypointArrival, routeComplete, xte, heading, wind.'
    }
  },
  components: {
    schemas: {
      AutopilotInfo: AutopilotInfoSchema
    }
  }
}
