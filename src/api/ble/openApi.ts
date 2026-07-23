import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  BLEAdvertisementSchema,
  BLEConsumerInfoSchema,
  BLEDefaultProviderSchema,
  BLEDeviceInfoSchema,
  BLEGattClaimStatusSchema,
  BLEGattSlotsSchema,
  BLEGatewayAdvertisementBatchSchema,
  BLEGatewayDeviceSchema,
  BLEGatewayInfoSchema,
  BLEMacParamSchema,
  BLEProviderInfoSchema,
  BLEProvidersSchema,
  BLESeenBySchema,
  BLESettingsRequestSchema,
  BLESettingsResponseSchema
} from '@signalk/server-api/typebox'

const GATEWAY_BASE = '/signalk/v2/api/ble'

const bleApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '0.1.0',
    title: 'BLE API',
    description:
      'Signal K BLE Provider API endpoints. Provides a unified view of BLE ' +
      'devices across multiple providers (local adapters, remote gateways) ' +
      'with advertisement streaming and GATT subscription management.',
    termsOfService: 'http://signalk.org/terms/',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  externalDocs: {
    url: 'http://signalk.org/specification/',
    description: 'Signal K specification.'
  },
  servers: [{ url: '/signalk/v2/api/vessels/self/ble' }],
  tags: [
    { name: 'BLE', description: 'BLE device and advertisement operations.' },
    {
      name: 'Provider',
      description: 'Operations to view registered BLE providers.'
    },
    { name: 'Gateway', description: 'Remote BLE gateway management.' }
  ],
  components: {
    schemas: typeboxToOpenApiSchemas([
      BLESeenBySchema,
      BLEDeviceInfoSchema,
      BLEAdvertisementSchema,
      BLEGatewayDeviceSchema,
      BLEGatewayAdvertisementBatchSchema,
      BLEGattSlotsSchema,
      BLEGatewayInfoSchema,
      BLEProviderInfoSchema,
      BLEProvidersSchema,
      BLEConsumerInfoSchema,
      BLESettingsResponseSchema,
      BLESettingsRequestSchema,
      BLEDefaultProviderSchema,
      BLEGattClaimStatusSchema,
      BLEMacParamSchema
    ]),
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'JAUTHENTICATION' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  paths: {
    '/': {
      get: {
        tags: ['BLE'],
        summary: 'BLE API overview',
        responses: {
          '200': { description: 'API endpoint descriptions' }
        }
      }
    },
    '/_providers': {
      get: {
        tags: ['Provider'],
        summary: 'List registered BLE providers',
        responses: {
          '200': {
            description: 'Map of provider IDs to provider info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BLEProviders' }
              }
            }
          }
        }
      }
    },
    '/_providers/_default': {
      get: {
        tags: ['Provider'],
        summary: 'Get default BLE provider',
        description:
          'Returns the current default provider ID. The default provider is ' +
          'preferred for GATT connections when it has available slots and can ' +
          'see the target device.',
        responses: {
          '200': {
            description: 'Default provider',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BLEDefaultProvider' }
              }
            }
          }
        }
      }
    },
    '/_providers/_default/{id}': {
      post: {
        tags: ['Provider'],
        summary: 'Set default BLE provider',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Provider ID to set as default'
          }
        ],
        responses: {
          '200': { description: 'Default provider updated' },
          '404': { description: 'Provider not found' }
        }
      }
    },
    '/devices': {
      get: {
        tags: ['BLE'],
        summary: 'List all visible BLE devices',
        description:
          'Returns all visible devices across all providers, deduplicated by ' +
          'MAC address. Devices not seen for 120 seconds are pruned.',
        responses: {
          '200': {
            description: 'Array of BLE device info',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BLEDeviceInfo' }
                }
              }
            }
          }
        }
      }
    },
    '/devices/{mac}': {
      get: {
        tags: ['BLE'],
        summary: 'Get a single BLE device',
        parameters: [
          {
            name: 'mac',
            in: 'path',
            required: true,
            schema: { $ref: '#/components/schemas/BLEMacParam' },
            description: 'Device MAC address (AA:BB:CC:DD:EE:FF)'
          }
        ],
        responses: {
          '200': {
            description: 'BLE device info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BLEDeviceInfo' }
              }
            }
          },
          '404': { description: 'Device not found' }
        }
      }
    },
    '/devices/{mac}/gatt': {
      get: {
        tags: ['BLE'],
        summary: 'Get GATT claim status for a device',
        parameters: [
          {
            name: 'mac',
            in: 'path',
            required: true,
            schema: { $ref: '#/components/schemas/BLEMacParam' }
          }
        ],
        responses: {
          '200': {
            description: 'GATT claim info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BLEGattClaimStatus' }
              }
            }
          }
        }
      }
    },
    '/consumers': {
      get: {
        tags: ['BLE'],
        summary: 'List consumer plugins',
        description:
          'Returns all plugins subscribed to BLE advertisements or holding ' +
          'GATT claims.',
        responses: {
          '200': {
            description: 'Consumer plugin list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BLEConsumerInfo' }
                }
              }
            }
          }
        }
      }
    },
    '/settings': {
      get: {
        tags: ['BLE'],
        summary: 'Get BLE settings',
        responses: {
          '200': {
            description: 'BLE configuration and adapter status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BLESettingsResponse' }
              }
            }
          }
        }
      },
      put: {
        tags: ['BLE'],
        summary: 'Update BLE settings',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BLESettingsRequest' }
            }
          }
        },
        responses: {
          '200': { description: 'Settings updated' },
          '400': { description: 'Invalid settings' }
        }
      }
    },
    '/advertisements': {
      get: {
        tags: ['BLE'],
        summary: 'WebSocket stream of BLE advertisements',
        description:
          'Upgrade to WebSocket to receive a real-time stream of ' +
          'BLEAdvertisement JSON objects from all registered providers.',
        responses: {
          '101': { description: 'Switching Protocols (WebSocket upgrade)' }
        }
      }
    },
    '/gateway/advertisements': {
      servers: [{ url: GATEWAY_BASE }],
      post: {
        tags: ['Gateway'],
        summary: 'Receive BLE advertisement batch from a remote BLE gateway',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/BLEGatewayAdvertisementBatch'
              }
            }
          }
        },
        responses: {
          '200': { description: 'Accepted' },
          '400': { description: 'Invalid body' }
        }
      }
    },
    '/gateway/ws': {
      servers: [{ url: GATEWAY_BASE }],
      get: {
        tags: ['Gateway'],
        summary: 'WebSocket GATT command channel for remote BLE gateways',
        description:
          'Upgrade to WebSocket for GATT subscribe/data/disconnect messaging.',
        responses: {
          '101': { description: 'Switching Protocols (WebSocket upgrade)' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/gateways': {
      servers: [{ url: GATEWAY_BASE }],
      get: {
        tags: ['Gateway'],
        summary: 'List all registered BLE gateways',
        description:
          'Returns online gateways and recently-disconnected gateways ' +
          '(up to 60s after disconnect). Public, read-only.',
        security: [],
        responses: {
          '200': {
            description: 'Array of gateway info',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BLEGatewayInfo' }
                }
              }
            }
          }
        }
      }
    }
  }
}

export const bleApiRecord = {
  name: 'ble',
  path: '/signalk/v2/api/vessels/self/ble',
  apiDoc: bleApiDoc as unknown as OpenApiDescription
}
