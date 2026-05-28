/**
 * TypeBox schema definitions for the Signal K BLE API.
 *
 * These schemas are the source of truth for both OpenAPI generation
 * and runtime request validation.
 */

import { Type, type Static } from '@sinclair/typebox'

const MAC_PATTERN = '^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$'

/** A MAC address path/query parameter. */
export const BLEMacParamSchema = Type.String({
  pattern: MAC_PATTERN,
  $id: 'BLEMacParam',
  description: 'Device MAC address, six hex byte pairs separated by colons'
})

// ---------------------------------------------------------------------------
// Gateway POST body
// ---------------------------------------------------------------------------

/** A single BLE device in a gateway advertisement batch. */
export const BLEGatewayDeviceSchema = Type.Object(
  {
    mac: Type.String({
      pattern: MAC_PATTERN,
      description: 'Device MAC address, six hex byte pairs separated by colons'
    }),
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

/** Advertisement batch POST body from a remote BLE gateway. */
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
        pattern: MAC_PATTERN,
        description:
          "Gateway's own MAC address, six hex byte pairs separated by colons"
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
      'Advertisement batch posted by a remote BLE gateway. Each device ' +
      'entry can include raw AD bytes (adv_data) and/or pre-parsed fields. ' +
      'The server will parse adv_data if present.'
  }
)

// ---------------------------------------------------------------------------
// Per-provider observation of a device
// ---------------------------------------------------------------------------

/** Per-provider signal-strength record for a single device. */
export const BLESeenBySchema = Type.Object(
  {
    providerId: Type.String(),
    rssi: Type.Number({ description: 'Received signal strength (dBm)' }),
    lastSeen: Type.Number({
      description: 'Unix timestamp (ms) of most recent advertisement'
    })
  },
  { $id: 'BLESeenBy' }
)

// ---------------------------------------------------------------------------
// BLE device info (response from /devices)
// ---------------------------------------------------------------------------

/** Unified view of a BLE device across all providers. */
export const BLEDeviceInfoSchema = Type.Object(
  {
    mac: Type.String({
      pattern: MAC_PATTERN,
      description: 'Device MAC address (uppercase, colon-separated)'
    }),
    name: Type.Optional(Type.String({ description: 'Advertised local name' })),
    rssi: Type.Number({
      description: 'Best (strongest) RSSI across all providers'
    }),
    lastSeen: Type.Number({
      description: 'Unix timestamp (ms) of most recent advertisement'
    }),
    connectable: Type.Boolean({
      description: 'Whether any provider reports the device as connectable'
    }),
    seenBy: Type.Array(BLESeenBySchema, {
      description: 'Per-provider signal info'
    }),
    gattClaimedBy: Type.Optional(
      Type.Union([Type.String(), Type.Null()], {
        description: 'Plugin that currently holds a GATT connection, if any'
      })
    )
  },
  { $id: 'BLEDeviceInfo' }
)

// ---------------------------------------------------------------------------
// BLE advertisement (streamed via WS)
// ---------------------------------------------------------------------------

/** A single BLE advertisement received by a provider. */
export const BLEAdvertisementSchema = Type.Object(
  {
    mac: Type.String({
      pattern: MAC_PATTERN,
      description: 'Device MAC address (uppercase, colon-separated)'
    }),
    name: Type.Optional(Type.String({ description: 'Advertised local name' })),
    rssi: Type.Number({ description: 'Received signal strength (dBm)' }),
    manufacturerData: Type.Optional(
      Type.Record(Type.Number(), Type.String(), {
        description:
          'Company ID (decimal) → hex-encoded payload (without company ID prefix)'
      })
    ),
    serviceData: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: 'Service UUID → hex-encoded payload'
      })
    ),
    serviceUuids: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Advertised service UUIDs'
      })
    ),
    providerId: Type.String({
      description: 'Provider that received this advertisement'
    }),
    timestamp: Type.Number({
      description: 'Unix timestamp (ms) when received'
    }),
    connectable: Type.Optional(Type.Boolean()),
    txPower: Type.Optional(
      Type.Number({ description: 'TX power level (dBm)' })
    ),
    addressType: Type.Optional(
      Type.Union([Type.Literal('public'), Type.Literal('random')], {
        description: 'BLE address type'
      })
    )
  },
  { $id: 'BLEAdvertisement' }
)

// ---------------------------------------------------------------------------
// Consumer info
// ---------------------------------------------------------------------------

export const BLEConsumerInfoSchema = Type.Object(
  {
    pluginId: Type.String(),
    advertisementSubscriber: Type.Boolean(),
    gattClaims: Type.Array(Type.String(), {
      description: 'MAC addresses of devices with active GATT claims'
    })
  },
  { $id: 'BLEConsumerInfo' }
)

// ---------------------------------------------------------------------------
// Gateway info
// ---------------------------------------------------------------------------

export const BLEGattSlotsSchema = Type.Object(
  {
    total: Type.Number(),
    available: Type.Number()
  },
  { $id: 'BLEGattSlots' }
)

export const BLEGatewayInfoSchema = Type.Object(
  {
    gatewayId: Type.String(),
    providerId: Type.String(),
    online: Type.Boolean(),
    ipAddress: Type.Union([Type.String(), Type.Null()]),
    mac: Type.Union([Type.String(), Type.Null()]),
    hostname: Type.Union([Type.String(), Type.Null()]),
    firmware: Type.Union([Type.String(), Type.Null()]),
    connectedAt: Type.Union([Type.Number(), Type.Null()], {
      description: 'Unix timestamp (ms) when gateway connected'
    }),
    disconnectedAt: Type.Optional(
      Type.Number({
        description:
          'Unix timestamp (ms) when gateway disconnected (offline only)'
      })
    ),
    uptime: Type.Optional(
      Type.Number({ description: 'Gateway uptime in seconds' })
    ),
    freeHeap: Type.Optional(
      Type.Number({ description: 'Free heap memory in bytes' })
    ),
    gattSlots: BLEGattSlotsSchema,
    deviceCount: Type.Number({
      description: 'Number of unique BLE devices seen by this gateway'
    })
  },
  { $id: 'BLEGatewayInfo' }
)

// ---------------------------------------------------------------------------
// Provider info
// ---------------------------------------------------------------------------

export const BLEProviderInfoSchema = Type.Object(
  {
    name: Type.String(),
    supportsGATT: Type.Boolean(),
    gattSlots: BLEGattSlotsSchema,
    gateway: Type.Optional(
      Type.Object(
        {
          hardware: Type.Optional(Type.String()),
          board: Type.Optional(Type.String()),
          firmware: Type.Optional(Type.String()),
          uptime: Type.Optional(Type.Number()),
          ip: Type.Optional(Type.String()),
          transport: Type.Optional(Type.String())
        },
        { description: 'Optional provider-supplied metadata' }
      )
    )
  },
  { $id: 'BLEProviderInfo' }
)

export const BLEProvidersSchema = Type.Record(
  Type.String(),
  BLEProviderInfoSchema,
  {
    $id: 'BLEProviders',
    description: 'Map of provider IDs to provider info'
  }
)

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const BLESettingsResponseSchema = Type.Object(
  {
    localBluetoothManaged: Type.Boolean(),
    localAdapters: Type.Array(Type.String()),
    localMaxGATTSlots: Type.Number(),
    localBLESupported: Type.Boolean(),
    activeAdapters: Type.Array(Type.String()),
    adapterErrors: Type.Record(Type.String(), Type.String())
  },
  { $id: 'BLESettingsResponse' }
)

export const BLESettingsRequestSchema = Type.Object(
  {
    localBluetoothManaged: Type.Optional(Type.Boolean()),
    localAdapters: Type.Optional(Type.Array(Type.String())),
    localMaxGATTSlots: Type.Optional(Type.Number({ minimum: 1, maximum: 10 }))
  },
  { $id: 'BLESettingsRequest' }
)

// ---------------------------------------------------------------------------
// Default provider
// ---------------------------------------------------------------------------

export const BLEDefaultProviderSchema = Type.Object(
  {
    id: Type.Union([Type.String(), Type.Null()])
  },
  { $id: 'BLEDefaultProvider' }
)

// ---------------------------------------------------------------------------
// GATT claim status
// ---------------------------------------------------------------------------

export const BLEGattClaimStatusSchema = Type.Object(
  {
    claimedBy: Type.Union([Type.String(), Type.Null()])
  },
  { $id: 'BLEGattClaimStatus' }
)

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type BLEGatewayDevice = Static<typeof BLEGatewayDeviceSchema>
export type BLEGatewayAdvertisementBatch = Static<
  typeof BLEGatewayAdvertisementBatchSchema
>
export type BLEAdvertisement = Static<typeof BLEAdvertisementSchema>
export type BLEDeviceInfo = Static<typeof BLEDeviceInfoSchema>
export type BLEConsumerInfo = Static<typeof BLEConsumerInfoSchema>
export type BLEProviders = Static<typeof BLEProvidersSchema>
