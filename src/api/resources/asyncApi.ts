import { Type } from '@sinclair/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const resourcesAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Resources API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for Signal K resource changes.

## Overview
The Resources API emits deltas under \`resources.{type}.{id}\` when
resources are created, updated, or deleted. Resource types include
routes, waypoints, notes, regions, and charts.

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "resources.*", "period": 1000 }
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
    'resources.routes': {
      address: 'resources.routes.*',
      description: 'Route resource changes (created, updated, or deleted).',
      messages: {
        route: {
          name: 'resources.routes.*',
          title: 'Route Change',
          summary: 'A route resource was created, updated, or deleted',
          contentType: 'application/json',
          payload: Type.Union([
            Type.Object({
              name: Type.Optional(Type.String()),
              description: Type.Optional(Type.String()),
              feature: Type.Object({
                type: Type.Literal('Feature'),
                geometry: Type.Object({
                  type: Type.Literal('LineString'),
                  coordinates: Type.Array(
                    Type.Array(Type.Number(), { minItems: 2, maxItems: 3 })
                  )
                })
              })
            }),
            Type.Null()
          ])
        }
      }
    },
    'resources.waypoints': {
      address: 'resources.waypoints.*',
      description: 'Waypoint resource changes (created, updated, or deleted).',
      messages: {
        waypoint: {
          name: 'resources.waypoints.*',
          title: 'Waypoint Change',
          summary: 'A waypoint resource was created, updated, or deleted',
          contentType: 'application/json',
          payload: Type.Union([
            Type.Object({
              name: Type.Optional(Type.String()),
              description: Type.Optional(Type.String()),
              feature: Type.Object({
                type: Type.Literal('Feature'),
                geometry: Type.Object({
                  type: Type.Literal('Point'),
                  coordinates: Type.Array(Type.Number(), {
                    minItems: 2,
                    maxItems: 3
                  })
                })
              })
            }),
            Type.Null()
          ])
        }
      }
    },
    'resources.notes': {
      address: 'resources.notes.*',
      description: 'Note resource changes.',
      messages: {
        note: {
          name: 'resources.notes.*',
          title: 'Note Change',
          contentType: 'application/json',
          payload: Type.Union([
            Type.Object({
              title: Type.Optional(Type.String()),
              description: Type.Optional(Type.String()),
              url: Type.Optional(Type.String()),
              mimeType: Type.Optional(Type.String())
            }),
            Type.Null()
          ])
        }
      }
    },
    'resources.regions': {
      address: 'resources.regions.*',
      description: 'Region resource changes.',
      messages: {
        region: {
          name: 'resources.regions.*',
          title: 'Region Change',
          contentType: 'application/json',
          payload: Type.Union([
            Type.Object({
              feature: Type.Object({
                type: Type.Literal('Feature'),
                geometry: Type.Object({
                  type: Type.Union([
                    Type.Literal('Polygon'),
                    Type.Literal('MultiPolygon')
                  ])
                })
              })
            }),
            Type.Null()
          ])
        }
      }
    }
  },
  operations: {
    receiveRouteChange: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.routes' },
      summary: 'Receive route resource changes'
    },
    receiveWaypointChange: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.waypoints' },
      summary: 'Receive waypoint resource changes'
    },
    receiveNoteChange: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.notes' },
      summary: 'Receive note resource changes'
    },
    receiveRegionChange: {
      action: 'receive',
      channel: { $ref: '#/channels/resources.regions' },
      summary: 'Receive region resource changes'
    }
  }
}
