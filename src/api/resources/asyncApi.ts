/**
 * AsyncAPI 3.0 Document for Signal K Resources API WebSocket Deltas
 *
 * Documents the WebSocket delta channels emitted by the Resources API.
 * Deltas are emitted under `resources.{type}.{id}` when resources are
 * created, updated, or deleted.
 */

import {
  RouteSchema,
  WaypointSchema,
  RegionSchema,
  NoteSchema,
  ChartSchema
} from '@signalk/server-api'
import { Type } from '@sinclair/typebox'
import { serverVersion } from '../openapi-utils'

export const resourcesAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Resources API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for the Signal K Resources API.

## Overview
The Resources API emits delta messages over the Signal K WebSocket connection
whenever resources are created, updated, or deleted. Each mutation triggers
a delta with the resource path and its new value (or \`null\` for deletions).

## Signal K Paths
- \`resources.routes.{id}\` — route created/updated/deleted
- \`resources.waypoints.{id}\` — waypoint created/updated/deleted
- \`resources.regions.{id}\` — region created/updated/deleted
- \`resources.notes.{id}\` — note created/updated/deleted
- \`resources.charts.{id}\` — chart created/updated/deleted

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "resources.*", "period": 1000 }
  ]
}
\`\`\`

## Delta Format
\`\`\`json
{
  "updates": [{
    "$source": "resources-provider-plugin-id",
    "values": [
      {
        "path": "resources.waypoints.ac3a3b2d-07e8-4f25-92bc-98e7c92f7f68",
        "value": { "name": "Anchorage", "position": { "latitude": 51.5, "longitude": -0.1 } }
      }
    ]
  }]
}
\`\`\`

For deletions, \`value\` is \`null\`.
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
    'resources.routes': {
      address: 'resources.routes',
      description:
        'Route resource delta channel. Emits when routes are created, updated, or deleted.',
      messages: {
        route: {
          name: 'resources.routes.{id}',
          title: 'Route Resource',
          summary: 'A route resource value, or null when deleted',
          contentType: 'application/json',
          payload: Type.Union([RouteSchema, Type.Null()])
        }
      }
    },
    'resources.waypoints': {
      address: 'resources.waypoints',
      description:
        'Waypoint resource delta channel. Emits when waypoints are created, updated, or deleted.',
      messages: {
        waypoint: {
          name: 'resources.waypoints.{id}',
          title: 'Waypoint Resource',
          summary: 'A waypoint resource value, or null when deleted',
          contentType: 'application/json',
          payload: Type.Union([WaypointSchema, Type.Null()])
        }
      }
    },
    'resources.regions': {
      address: 'resources.regions',
      description:
        'Region resource delta channel. Emits when regions are created, updated, or deleted.',
      messages: {
        region: {
          name: 'resources.regions.{id}',
          title: 'Region Resource',
          summary: 'A region resource value, or null when deleted',
          contentType: 'application/json',
          payload: Type.Union([RegionSchema, Type.Null()])
        }
      }
    },
    'resources.notes': {
      address: 'resources.notes',
      description:
        'Note resource delta channel. Emits when notes are created, updated, or deleted.',
      messages: {
        note: {
          name: 'resources.notes.{id}',
          title: 'Note Resource',
          summary: 'A note resource value, or null when deleted',
          contentType: 'application/json',
          payload: Type.Union([NoteSchema, Type.Null()])
        }
      }
    },
    'resources.charts': {
      address: 'resources.charts',
      description:
        'Chart resource delta channel. Emits when charts are created, updated, or deleted.',
      messages: {
        chart: {
          name: 'resources.charts.{id}',
          title: 'Chart Resource',
          summary: 'A chart resource value, or null when deleted',
          contentType: 'application/json',
          payload: Type.Union([ChartSchema, Type.Null()])
        }
      }
    }
  },
  operations: {
    receiveRouteUpdate: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.routes' },
      summary: 'Receive route resource delta updates'
    },
    receiveWaypointUpdate: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.waypoints' },
      summary: 'Receive waypoint resource delta updates'
    },
    receiveRegionUpdate: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.regions' },
      summary: 'Receive region resource delta updates'
    },
    receiveNoteUpdate: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.notes' },
      summary: 'Receive note resource delta updates'
    },
    receiveChartUpdate: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.charts' },
      summary: 'Receive chart resource delta updates'
    }
  },
  components: {
    schemas: {
      Route: RouteSchema,
      Waypoint: WaypointSchema,
      Region: RegionSchema,
      Note: NoteSchema,
      Chart: ChartSchema
    }
  }
}
