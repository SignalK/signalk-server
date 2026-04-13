/**
 * TypeBox Schema Definitions for the Signal K BLE Gateway API
 *
 * Defines the shape of the advertisement batch POST body sent by
 * ESP32 BLE gateways.
 */

import { Type, type Static } from '@sinclair/typebox'

/** A single BLE device in a gateway advertisement batch. */
export const BLEGatewayDeviceSchema = Type.Object(
  {
    mac: Type.String({ description: 'Device MAC address (AA:BB:CC:DD:EE:FF)' }),
    rssi: Type.Number({ description: 'Received signal strength (dBm)' }),
    name: Type.Optional(Type.String({ description: 'Advertised local name' })),
    adv_data: Type.Optional(
      Type.String({
        description:
          'Raw advertisement payload as hex string (AD structures). ' +
          'The server parses this into manufacturerData, serviceData, etc.'
      })
    ),
    manufacturer_data: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description:
          'Pre-parsed manufacturer data: company ID (decimal string) → hex payload'
      })
    ),
    service_data: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: 'Pre-parsed service data: service UUID → hex payload'
      })
    ),
    service_uuids: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Advertised service UUIDs'
      })
    ),
    connectable: Type.Optional(
      Type.Boolean({
        description: 'Whether the device accepts GATT connections'
      })
    ),
    tx_power: Type.Optional(
      Type.Number({ description: 'TX power level (dBm)' })
    )
  },
  { $id: 'BLEGatewayDevice' }
)

/** Advertisement batch POST body from an ESP32 BLE gateway. */
export const BLEGatewayAdvertisementBatchSchema = Type.Object(
  {
    gateway_id: Type.String({
      description: 'Unique identifier for this gateway (typically the hostname)'
    }),
    devices: Type.Array(BLEGatewayDeviceSchema, {
      description: 'BLE devices discovered since the last batch'
    }),
    firmware: Type.Optional(
      Type.String({
        description:
          'Gateway firmware version. Used for HTTP-only gateways ' +
          'that cannot send metadata via WebSocket hello.'
      })
    ),
    mac: Type.Optional(
      Type.String({
        description: "Gateway's own MAC address (AA:BB:CC:DD:EE:FF)"
      })
    ),
    hostname: Type.Optional(Type.String({ description: 'Gateway hostname' })),
    uptime: Type.Optional(
      Type.Number({ description: 'Gateway uptime in seconds' })
    ),
    free_heap: Type.Optional(
      Type.Number({ description: 'Free heap memory in bytes' })
    )
  },
  {
    $id: 'BLEGatewayAdvertisementBatch',
    description:
      'Advertisement batch posted by an ESP32 BLE gateway. ' +
      'Each device entry can include raw AD bytes (adv_data) and/or ' +
      'pre-parsed fields. The server will parse adv_data if present.'
  }
)

export type BLEGatewayDevice = Static<typeof BLEGatewayDeviceSchema>
export type BLEGatewayAdvertisementBatch = Static<
  typeof BLEGatewayAdvertisementBatchSchema
>
