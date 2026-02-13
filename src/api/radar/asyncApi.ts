/**
 * AsyncAPI 3.0 Document for Signal K Radar API WebSocket Streams
 *
 * Documents the binary WebSocket streams used by the Radar API.
 * Unlike other APIs that use JSON deltas, radar data is transmitted as
 * high-frequency binary spoke frames over dedicated WebSocket connections.
 */

import { RadarInfoSchema, RadarStatusSchema } from '@signalk/server-api'
import { Type } from '@sinclair/typebox'
import { serverVersion } from '../openapi-utils'

export const radarAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Radar API - WebSocket Streams',
    version: serverVersion,
    description: `
WebSocket streams for the Signal K Radar API.

## Overview
The Radar API uses **binary WebSocket streams** for high-frequency spoke data,
not JSON deltas. Each radar has its own dedicated WebSocket endpoint for
receiving raw spoke data in real time.

## Stream Endpoints
- \`ws://server/signalk/v2/api/streams/radars/{radarId}\` — generic stream endpoint
- \`ws://server/signalk/v2/api/vessels/self/radars/{radarId}/stream\` — convenience alias

## Binary Spoke Data
Spoke data is transmitted as raw binary frames. Each frame contains radar
return data for a single spoke (radial sweep line). The number of spokes per
revolution and maximum spoke length are available from the radar info endpoint.

## Authentication
WebSocket connections require authentication via the standard Signal K
security mechanism (\`JAUTHENTICATION\` cookie or \`Authorization\` header).

## REST API
For radar configuration, control, and ARPA target management,
see the OpenAPI documentation at \`/admin/openapi/\`.
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
      description: 'Signal K server WebSocket endpoint for radar streams',
      pathname: '/signalk/v2/api/streams'
    }
  },
  channels: {
    radarStream: {
      address: 'radars/{radarId}',
      description:
        'Binary radar spoke stream. High-frequency binary frames containing radar return data for each spoke (radial sweep line).',
      parameters: {
        radarId: {
          description: 'Unique radar identifier'
        }
      },
      messages: {
        spokeData: {
          name: 'spokeData',
          title: 'Radar Spoke Data',
          summary:
            'Binary frame containing radar return data for a single spoke',
          contentType: 'application/octet-stream',
          payload: Type.Object({
            description: Type.Literal('Binary radar spoke data frame')
          })
        }
      }
    }
  },
  operations: {
    receiveSpokeData: {
      action: 'receive',
      channel: { $ref: '#/channels/radarStream' },
      summary: 'Receive binary radar spoke data',
      description:
        'High-frequency binary frames streamed for each radar spoke. Connect to the stream endpoint to receive real-time radar data.'
    }
  },
  components: {
    schemas: {
      RadarInfo: RadarInfoSchema,
      RadarStatus: RadarStatusSchema
    }
  }
}
