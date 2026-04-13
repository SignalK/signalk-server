/**
 * BLE Provider API type definitions.
 *
 * Follows the v2 provider pattern established by Weather, Autopilot, and
 * Radar APIs.  Provider plugins supply BLE hardware access (local adapter,
 * remote ESP32 gateway, etc.).  Consumer plugins subscribe to a merged
 * advertisement stream and request GATT subscriptions through the server
 * API.
 *
 * @module BLE API
 */

// ---------------------------------------------------------------------------
// Advertisement
// ---------------------------------------------------------------------------

/** A single BLE advertisement received by a provider. @category BLE API */
export interface BLEAdvertisement {
  /** Device MAC address (AA:BB:CC:DD:EE:FF) */
  mac: string
  /** Advertised local name */
  name?: string
  /** Received signal strength (dBm) */
  rssi: number
  /** Company ID → hex-encoded payload (after the 2-byte company ID prefix) */
  manufacturerData?: Record<number, string>
  /** Service UUID → hex-encoded payload */
  serviceData?: Record<string, string>
  /** Advertised service UUIDs */
  serviceUuids?: string[]
  /** Provider that received this advertisement */
  providerId: string
  /** Unix timestamp (ms) when the advertisement was received */
  timestamp: number
  /** Whether the device accepts GATT connections */
  connectable?: boolean
  /** TX power level (dBm) */
  txPower?: number
  /** BLE address type */
  addressType?: 'public' | 'random'
}

// ---------------------------------------------------------------------------
// GATT Subscription Descriptor
// ---------------------------------------------------------------------------

/**
 * Declarative GATT setup.  The provider executes the full lifecycle
 * (connect → discover → subscribe → periodic writes) autonomously
 * and re-executes on disconnect.
 *
 * @category BLE API
 */
export interface GATTSubscriptionDescriptor {
  /** Target device MAC */
  mac: string
  /** Primary service UUID */
  service: string
  /** Characteristic UUIDs to subscribe for notifications */
  notify?: string[]
  /** Characteristics to poll at intervals */
  poll?: { uuid: string; intervalMs: number; writeBeforeRead?: string }[]
  /** One-time writes after connection (hex-encoded data) */
  init?: { uuid: string; data: string; withResponse?: boolean }[]
  /** Periodic writes (hex-encoded data) */
  periodicWrite?: {
    uuid: string
    data: string
    intervalMs: number
    withResponse?: boolean
  }[]
  /** Failover configuration */
  failover?: {
    /** Enable failover to another provider on disconnect (default: true) */
    enabled: boolean
    /** dBm advantage required for proactive migration */
    migrationThreshold?: number
    /** Seconds the better signal must hold before migrating (default: 60) */
    migrationHoldTime?: number
  }
}

/**
 * Handle returned by `subscribeGATT`.  Allows ad-hoc writes and
 * lifecycle monitoring.
 *
 * @category BLE API
 */
export interface GATTSubscriptionHandle {
  /** Read a characteristic on the connected device */
  read(charUuid: string): Promise<Buffer>
  /** Write to a characteristic on the connected device */
  write(charUuid: string, data: Buffer, withResponse?: boolean): Promise<void>
  /** Close the subscription and release the GATT claim */
  close(): Promise<void>
  /** Whether the underlying GATT connection is currently active */
  readonly connected: boolean
  /** Called when the GATT connection drops */
  onDisconnect(callback: () => void): void
  /** Called when the GATT connection (re-)establishes */
  onConnect(callback: () => void): void
}

// ---------------------------------------------------------------------------
// Raw GATT (escape hatch)
// ---------------------------------------------------------------------------

/** @category BLE API */
export interface BLEGattService {
  uuid: string
  characteristics: { uuid: string; properties: string[] }[]
}

/**
 * Raw GATT connection for dynamic interaction.  Use `subscribeGATT`
 * with a descriptor whenever possible — this is the escape hatch for
 * sensors that require truly dynamic GATT sequences.
 *
 * @category BLE API
 */
export interface BLEGattConnection {
  read(serviceUuid: string, charUuid: string): Promise<Buffer>
  write(
    serviceUuid: string,
    charUuid: string,
    data: Buffer,
    withResponse?: boolean
  ): Promise<void>
  startNotifications(
    serviceUuid: string,
    charUuid: string,
    callback: (data: Buffer) => void
  ): Promise<void>
  stopNotifications(serviceUuid: string, charUuid: string): Promise<void>
  discoverServices(): Promise<BLEGattService[]>
  disconnect(): Promise<void>
  readonly connected: boolean
  onDisconnect(callback: () => void): void
}

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

/** Unified view of a BLE device across all providers. @category BLE API */
export interface BLEDeviceInfo {
  mac: string
  name?: string
  /** Best (strongest) RSSI across all providers */
  rssi: number
  /** Unix timestamp (ms) of most recent advertisement from any provider */
  lastSeen: number
  /** Whether any provider reports the device as connectable */
  connectable: boolean
  /** Per-provider signal info */
  seenBy: { providerId: string; rssi: number; lastSeen: number }[]
  /** Plugin that currently holds a GATT connection, if any */
  gattClaimedBy?: string
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * A BLE provider supplies hardware access — a local BlueZ adapter, a
 * remote ESP32 gateway, an MQTT bridge, etc.  Follows the Weather
 * provider pattern: `{ name, methods }`.
 *
 * @category BLE API
 */
export interface BLEProvider {
  name: string
  methods: BLEProviderMethods
}

/** @category BLE API */
export interface BLEProviderMethods {
  pluginId?: string

  /** Start scanning for BLE advertisements */
  startDiscovery(): Promise<void>

  /** Stop scanning */
  stopDiscovery(): Promise<void>

  /** Return MACs of currently visible devices */
  getDevices(): Promise<string[]>

  /**
   * Subscribe to advertisements from this provider.
   * Returns an unsubscribe function.
   */
  onAdvertisement(callback: (adv: BLEAdvertisement) => void): () => void

  /** Whether this provider supports GATT connections */
  supportsGATT(): boolean

  /** Total number of GATT connection slots (optional) */
  totalGATTSlots?(): number

  /** Number of available GATT connection slots */
  availableGATTSlots(): number

  /**
   * Execute a GATT subscription descriptor.  The provider handles
   * connect, discover, subscribe, periodic writes, and reconnection
   * autonomously.
   */
  subscribeGATT(
    descriptor: GATTSubscriptionDescriptor,
    callback: (charUuid: string, data: Buffer) => void
  ): Promise<GATTSubscriptionHandle>

  /** Raw GATT connection (optional — not all providers support this) */
  connectGATT?(mac: string): Promise<BLEGattConnection>
}

// ---------------------------------------------------------------------------
// Provider registry (extends ServerAPI)
// ---------------------------------------------------------------------------

/**
 * Added to the `ServerAPI` extends chain so that plugins can call
 * `app.registerBLEProvider(provider)` and access `app.bleApi`.
 *
 * @category BLE API
 */
export interface BLEProviderRegistry {
  /** Register a BLE provider plugin */
  registerBLEProvider: (provider: BLEProvider) => void
  /** Access the server-managed BLE API */
  bleApi: BLEApi
}

// ---------------------------------------------------------------------------
// Server-managed API (consumed by plugins and REST/WS endpoints)
// ---------------------------------------------------------------------------

/** @category BLE API */
export interface BLEApi {
  /** Whether the server manages the local Bluetooth adapter */
  readonly localBluetoothManaged: boolean

  register(pluginId: string, provider: BLEProvider): void
  unRegister(pluginId: string): void

  /**
   * Subscribe to a merged advertisement stream from all providers.
   * pluginId is used to track consumer plugins in the BLE Manager UI.
   * Returns an unsubscribe function.
   */
  onAdvertisement(
    pluginId: string,
    callback: (adv: BLEAdvertisement) => void
  ): () => void

  /** All visible devices, deduplicated by MAC */
  getDevices(): Promise<BLEDeviceInfo[]>

  /** Single device lookup */
  getDevice(mac: string): Promise<BLEDeviceInfo | null>

  /**
   * Set up a GATT subscription.  The server selects the best provider
   * (strongest RSSI, available slots) and handles failover.
   */
  subscribeGATT(
    descriptor: GATTSubscriptionDescriptor,
    pluginId: string,
    callback: (charUuid: string, data: Buffer) => void
  ): Promise<GATTSubscriptionHandle>

  /** Raw GATT connection (escape hatch) */
  connectGATT(mac: string, pluginId: string): Promise<BLEGattConnection>

  /** Release a GATT claim */
  releaseGATTDevice(mac: string, pluginId: string): Promise<void>

  /** Current GATT claims: MAC → pluginId */
  getGATTClaims(): Map<string, string>
}

// ---------------------------------------------------------------------------
// Provider list for /_providers endpoint
// ---------------------------------------------------------------------------

/** @category BLE API */
export interface BLEProviders {
  [id: string]: {
    name: string
    supportsGATT: boolean
    gattSlots: { total: number; available: number }
    /** Optional provider-supplied metadata */
    gateway?: {
      hardware?: string
      board?: string
      firmware?: string
      uptime?: number
      ip?: string
      transport?: string
    }
  }
}

// ---------------------------------------------------------------------------
// Consumer info for /consumers endpoint
// ---------------------------------------------------------------------------

/** @category BLE API */
export interface BLEConsumerInfo {
  pluginId: string
  advertisementSubscriber: boolean
  /** MAC addresses of devices with active GATT claims held by this consumer */
  gattClaims: string[]
}

// ---------------------------------------------------------------------------
// Gateway POST body
// ---------------------------------------------------------------------------

/** A single device in a gateway advertisement batch POST. @category BLE API */
export interface BLEGatewayDevice {
  mac: string
  rssi: number
  name?: string
  /** Raw advertisement payload as hex (AD structures) */
  adv_data?: string
  /** Pre-parsed manufacturer data: company ID (decimal string) → hex payload */
  manufacturer_data?: Record<string, string>
  /** Pre-parsed service data: service UUID → hex payload */
  service_data?: Record<string, string>
  /** Advertised service UUIDs */
  service_uuids?: string[]
  /** Whether the device accepts GATT connections */
  connectable?: boolean
  /** TX power level (dBm) */
  tx_power?: number
}

/** Advertisement batch POST body from an ESP32 BLE gateway. @category BLE API */
export interface BLEGatewayAdvertisementBatch {
  gateway_id: string
  devices: BLEGatewayDevice[]
  /** Gateway firmware version (for HTTP-only gateways) */
  firmware?: string
  /** Gateway's own MAC address */
  mac?: string
  /** Gateway hostname */
  hostname?: string
  /** Gateway uptime in seconds (for HTTP-only gateways) */
  uptime?: number
  /** Free heap memory in bytes (for HTTP-only gateways) */
  free_heap?: number
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** @category BLE API */
export const isBLEProvider = (obj: unknown): obj is BLEProvider => {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  const typedObj = obj as Record<string, unknown>
  const methods = typedObj['methods']
  return (
    typeof typedObj['name'] === 'string' &&
    typeof methods === 'object' &&
    methods !== null &&
    typeof (methods as Record<string, unknown>)['startDiscovery'] ===
      'function' &&
    typeof (methods as Record<string, unknown>)['stopDiscovery'] ===
      'function' &&
    typeof (methods as Record<string, unknown>)['getDevices'] === 'function' &&
    typeof (methods as Record<string, unknown>)['onAdvertisement'] ===
      'function' &&
    typeof (methods as Record<string, unknown>)['supportsGATT'] ===
      'function' &&
    typeof (methods as Record<string, unknown>)['availableGATTSlots'] ===
      'function' &&
    typeof (methods as Record<string, unknown>)['subscribeGATT'] === 'function'
  )
}
