import {
  BLEAdvertisementSchema,
  BLEGatewayAdvertisementBatchSchema,
  BLEGatewayDeviceSchema
} from '@signalk/server-api/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const bleAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K BLE API - WebSocket Streams',
    version: serverVersion,
    description: `
WebSocket streams for the Signal K BLE API.

## Advertisement Stream
Real-time BLE advertisements from all registered providers, deduplicated and
fanned out to subscribed clients. Each frame is a JSON \`BLEAdvertisement\`.

## Gateway GATT Channel
Bidirectional control channel for remote BLE gateways. The server sends
\`gatt_subscribe\` / \`gatt_write\` / \`gatt_close\` commands; the gateway
streams \`gatt_data\` / \`gatt_connected\` / \`gatt_disconnected\` / \`status\`
frames back. Used by ESP32 gateways with enough RAM for a persistent WS
connection.

## REST API
For the REST API documentation, see OpenAPI at \`/doc/openapi\`.
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
      description: 'Signal K server WebSocket endpoint'
    }
  },
  channels: {
    advertisements: {
      address: '/signalk/v2/api/vessels/self/ble/advertisements',
      description:
        'Real-time stream of BLE advertisements from all providers, ' +
        'deduplicated server-side and fanned out to all subscribers.',
      messages: {
        advertisement: {
          name: 'advertisement',
          title: 'BLE Advertisement',
          summary: 'A single BLE advertisement frame',
          contentType: 'application/json',
          payload: BLEAdvertisementSchema
        }
      }
    },
    gatewayGatt: {
      address: '/signalk/v2/api/ble/gateway/ws',
      description:
        'Bidirectional control channel for remote BLE gateways. The gateway ' +
        'opens this connection and sends a hello frame; the server replies ' +
        'with GATT subscribe/write/close commands and the gateway streams ' +
        'data/status frames back.',
      messages: {
        gatewayHello: {
          name: 'hello',
          title: 'Gateway Hello',
          summary: 'Initial frame from the gateway after WS upgrade',
          contentType: 'application/json'
        },
        gattCommand: {
          name: 'gatt_command',
          title: 'GATT Command',
          summary:
            'Server → gateway: gatt_subscribe, gatt_write, or gatt_close',
          contentType: 'application/json'
        },
        gattData: {
          name: 'gatt_data',
          title: 'GATT Data',
          summary: 'Gateway → server: notification or read result',
          contentType: 'application/json'
        },
        gatewayStatus: {
          name: 'status',
          title: 'Gateway Status',
          summary: 'Periodic uptime and slot status from the gateway',
          contentType: 'application/json'
        }
      }
    }
  },
  operations: {
    receiveAdvertisement: {
      action: 'receive',
      channel: { $ref: '#/channels/advertisements' },
      summary: 'Receive BLE advertisements'
    },
    gatewayControl: {
      action: 'send',
      channel: { $ref: '#/channels/gatewayGatt' },
      summary: 'Send GATT commands to a remote gateway'
    },
    gatewayEvents: {
      action: 'receive',
      channel: { $ref: '#/channels/gatewayGatt' },
      summary: 'Receive GATT data and status from a remote gateway'
    }
  },
  components: {
    schemas: {
      BLEAdvertisement: BLEAdvertisementSchema,
      BLEGatewayDevice: BLEGatewayDeviceSchema,
      BLEGatewayAdvertisementBatch: BLEGatewayAdvertisementBatchSchema
    }
  }
}
