import { RadarInfoSchema, RadarStatusSchema } from '@signalk/server-api/typebox'
import { Type } from '@sinclair/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const radarAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Radar API - WebSocket Streams',
    version: serverVersion,
    description: `
WebSocket streams for the Signal K Radar API.

## Spoke Stream
Radar providers stream spoke data over a dedicated WebSocket endpoint.
Clients connect to receive raw radar returns for rendering.

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
      pathname: '/signalk/v2/api/vessels/self/radars/{radarId}/spokes'
    }
  },
  channels: {
    'radars.spokes': {
      address: 'radars/{radarId}/spokes',
      description: 'Radar spoke data stream. Binary spoke data for rendering.',
      parameters: {
        radarId: {
          description: 'The radar identifier'
        }
      },
      messages: {
        spokeData: {
          name: 'spokeData',
          title: 'Spoke Data',
          summary: 'Raw radar spoke data for display rendering',
          contentType: 'application/octet-stream',
          // The spoke stream is raw binary: signalk-server relays each provider
          // frame verbatim as one WebSocket binary message (mayara-server emits
          // protobuf-encoded spokes). It is not JSON, so the payload is opaque
          // octet data rather than an { angle, data } object.
          payload: Type.String({
            format: 'binary',
            description:
              'Raw binary spoke frame — one WebSocket binary message per spoke, in the provider-defined encoding (mayara-server: protobuf). Not JSON.'
          })
        }
      }
    }
  },
  operations: {
    receiveSpokeData: {
      action: 'receive',
      channel: { $ref: '#/channels/radars.spokes' },
      summary: 'Receive radar spoke data'
    }
  },
  components: {
    schemas: {
      RadarInfo: RadarInfoSchema,
      RadarStatus: RadarStatusSchema
    }
  }
}
