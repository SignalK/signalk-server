---
title: BLE Provider & Consumer Plugins
---

# BLE Provider and Consumer Plugins

The Signal K [BLE API](../rest-api/ble_api.md) decouples BLE hardware access from BLE data consumers. **Provider plugins** supply hardware (local BlueZ adapter, remote gateway, MQTT bridge, etc.). **Consumer plugins** subscribe to the merged advertisement stream and request GATT connections through the server.

## Consumer Plugin

Most BLE plugins are consumers — they process advertisements and optionally connect via GATT to read sensor data. The server handles provider selection, GATT slot management, and failover.

### Subscribing to Advertisements

```javascript
module.exports = function (app) {
  const plugin = { id: 'my-ble-plugin', name: 'My BLE Plugin' }
  let unsubscribe = null

  plugin.start = function () {
    unsubscribe = app.bleApi.onAdvertisement(plugin.id, (adv) => {
      // adv.mac, adv.rssi, adv.manufacturerData, adv.serviceData, …
      if (adv.mac === 'AA:BB:CC:DD:EE:FF') {
        processAdvertisement(adv)
      }
    })
  }

  plugin.stop = function () {
    if (unsubscribe) unsubscribe()
  }

  return plugin
}
```

`onAdvertisement` returns an unsubscribe function. Call it in `plugin.stop()`.

### GATT Subscriptions

For sensors that require a persistent GATT connection, use `subscribeGATT`. Provide a declarative descriptor — the server selects the best provider (strongest RSSI, available slots) and manages connect/reconnect autonomously.

```javascript
plugin.start = async function () {
  const descriptor = {
    mac: 'AA:BB:CC:DD:EE:FF',
    service: '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
    notify: ['00002a19-0000-1000-8000-00805f9b34fb'] // Battery Level
  }

  gattHandle = await app.bleApi.subscribeGATT(
    descriptor,
    plugin.id,
    (charUuid, data) => {
      const level = data.readUInt8(0)
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path: 'electrical.batteries.0.capacity.stateOfCharge',
                value: level / 100
              }
            ]
          }
        ]
      })
    }
  )

  gattHandle.onDisconnect(() => {
    app.debug('GATT disconnected — server will reconnect automatically')
  })
}

plugin.stop = async function () {
  if (gattHandle) await gattHandle.close()
}
```

### GATTSubscriptionDescriptor

| Field                         | Type      | Description                                                             |
| ----------------------------- | --------- | ----------------------------------------------------------------------- |
| `mac`                         | string    | Target device MAC address                                               |
| `service`                     | string    | Primary service UUID                                                    |
| `notify`                      | string[]? | Characteristic UUIDs to subscribe for notifications                     |
| `poll`                        | object[]? | Characteristics to poll: `{ uuid, intervalMs, writeBeforeRead? }`       |
| `init`                        | object[]? | One-time writes after connection: `{ uuid, data, withResponse? }` (hex) |
| `periodicWrite`               | object[]? | Repeated writes: `{ uuid, data, intervalMs, withResponse? }` (hex)      |
| `failover.enabled`            | boolean?  | Enable provider failover on disconnect (default: true)                  |
| `failover.migrationThreshold` | number?   | dBm advantage needed for proactive migration                            |
| `failover.migrationHoldTime`  | number?   | Seconds advantage must hold before migrating (default: 60)              |

`withResponse` on `init` and `periodicWrite` items controls whether the write uses Write With Response (default) or Write Without Response. Set to `false` for sensors that require `writeValueWithoutResponse`.

### GATTSubscriptionHandle

| Member                                 | Type              | Description                                                 |
| -------------------------------------- | ----------------- | ----------------------------------------------------------- |
| `read(charUuid)`                       | `Promise<Buffer>` | Read a characteristic value                                 |
| `write(charUuid, data, withResponse?)` | `Promise<void>`   | Write to a characteristic (`withResponse` defaults to true) |
| `close()`                              | `Promise<void>`   | Release the GATT claim                                      |
| `connected`                            | boolean           | Whether the GATT connection is currently active             |
| `onDisconnect(cb)`                     | void              | Called when the connection drops                            |
| `onConnect(cb)`                        | void              | Called when the connection (re-)establishes                 |

### Raw GATT Connection

For sensors with truly dynamic GATT sequences, use `connectGATT` to get a raw connection handle. Prefer `subscribeGATT` with a descriptor when possible — it handles reconnection automatically.

```javascript
const conn = await app.bleApi.connectGATT('AA:BB:CC:DD:EE:FF', plugin.id)
const services = await conn.discoverServices()
const data = await conn.read(serviceUuid, charUuid)
await conn.disconnect()
```

### BLE API Mode Detection

Consumer plugins that can also operate with a direct BlueZ connection should auto-detect which mode to use:

```javascript
plugin.start = async function () {
  if (app.bleApi) {
    // Server manages BLE — use the BLE API
    await startBleApiMode()
  } else {
    // Fall back to direct BlueZ access
    await startDirectBlueZMode()
  }
}
```

---

## Provider Plugin

A provider plugin gives the server access to a BLE radio. Register a provider by calling `app.bleApi.register()`. The server will call your `onAdvertisement` callback to receive all advertisements, merge them into the device table, and route GATT requests to your `subscribeGATT` method.

```javascript
const plugin = { id: 'my-ble-gateway', name: 'My BLE Gateway' }

plugin.start = function () {
  const provider = {
    name: 'My Gateway',
    methods: {
      startDiscovery: async () => {
        /* start scanning */
      },
      stopDiscovery: async () => {
        /* stop scanning */
      },
      getDevices: async () => [], // return visible MACs

      onAdvertisement(callback) {
        // Store callback and call it whenever an advertisement arrives:
        // callback({ mac, rssi, name, manufacturerData, serviceData, providerId: plugin.id, timestamp: Date.now() })
        return () => {
          /* unsubscribe */
        }
      },

      supportsGATT: () => true,
      availableGATTSlots: () => 3,

      async subscribeGATT(descriptor, callback) {
        // Connect to descriptor.mac, subscribe to descriptor.notify, etc.
        // Call callback(charUuid, buffer) on notifications.
        return {
          read: async (charUuid) => {
            /* read characteristic and return Buffer */
          },
          write: async (charUuid, data) => {
            /* write to characteristic */
          },
          close: async () => {
            /* disconnect and clean up */
          },
          connected: true,
          onDisconnect: (cb) => {
            /* register callback */
          },
          onConnect: (cb) => {
            /* register callback */
          }
        }
      }
    }
  }

  app.bleApi.register(plugin.id, provider)
}

plugin.stop = function () {
  app.bleApi.unRegister(plugin.id)
}
```

### BLEProviderMethods interface

| Method                          | Returns                           | Description                                         |
| ------------------------------- | --------------------------------- | --------------------------------------------------- |
| `startDiscovery()`              | `Promise<void>`                   | Begin scanning for advertisements                   |
| `stopDiscovery()`               | `Promise<void>`                   | Stop scanning                                       |
| `getDevices()`                  | `Promise<string[]>`               | MACs of currently visible devices                   |
| `onAdvertisement(cb)`           | `() => void`                      | Subscribe to advertisements; returns unsubscribe fn |
| `supportsGATT()`                | `boolean`                         | Whether this provider can make GATT connections     |
| `totalGATTSlots?()`             | `number`                          | Total GATT connection slots (optional)              |
| `availableGATTSlots()`          | `number`                          | How many concurrent GATT connections are free       |
| `subscribeGATT(descriptor, cb)` | `Promise<GATTSubscriptionHandle>` | Establish a GATT subscription                       |
| `connectGATT?(mac)`             | `Promise<BLEGattConnection>`      | Raw GATT connection (optional)                      |

### Advertisement format

Each advertisement fired into the server must conform to `BLEAdvertisement`:

```typescript
{
  mac: 'AA:BB:CC:DD:EE:FF',   // uppercase colon-separated
  name?: 'SensorName',
  rssi: -72,
  manufacturerData?: { 1177: 'ff0102...' },  // key = decimal company ID
  serviceData?: { '0000feaa-...': 'deadbeef' },
  serviceUuids?: ['0000180f-...'],
  providerId: 'my-ble-gateway',   // must match the registered plugin ID
  timestamp: Date.now(),
  connectable?: true,
  txPower?: -59,
}
```

`manufacturerData` keys are **decimal** company IDs (matching the Bluetooth SIG assigned numbers list). The values are hex-encoded payloads **without** the 2-byte company ID prefix.

---

## Consumer API Reference

All methods are available on `app.bleApi`:

| Method                                    | Returns                           | Description                                           |
| ----------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `onAdvertisement(pluginId, cb)`           | `() => void`                      | Subscribe to merged advertisement stream              |
| `subscribeGATT(descriptor, pluginId, cb)` | `Promise<GATTSubscriptionHandle>` | Declarative GATT subscription                         |
| `connectGATT(mac, pluginId)`              | `Promise<BLEGattConnection>`      | Raw GATT connection (escape hatch)                    |
| `releaseGATTDevice(mac, pluginId)`        | `Promise<void>`                   | Release a GATT claim without going through the handle |
| `getDevices()`                            | `Promise<BLEDeviceInfo[]>`        | All visible devices, deduplicated by MAC              |
| `getDevice(mac)`                          | `Promise<BLEDeviceInfo\|null>`    | Single device lookup                                  |
| `getGATTClaims()`                         | `Map<string, string>`             | Current GATT claims: MAC → pluginId                   |

---

## ESP32 Gateway POST Body

ESP32 gateways that cannot maintain a WebSocket connection (e.g. due to RAM constraints) send advertisements via HTTP POST to `/signalk/v2/api/ble/gateway/advertisements`. The POST body is JSON:

```json
{
  "gateway_id": "my-ble-gateway",
  "firmware": "1.2.0",
  "mac": "AA:BB:CC:DD:EE:FF",
  "hostname": "my-ble-gateway",
  "uptime": 3600,
  "free_heap": 131072,
  "devices": [
    {
      "mac": "11:22:33:44:55:66",
      "rssi": -65,
      "name": "SensorName",
      "adv_data": "0201061bff..."
    }
  ]
}
```

| Field        | Required | Description                                        |
| ------------ | -------- | -------------------------------------------------- |
| `gateway_id` | yes      | Unique gateway identifier (typically the hostname) |
| `devices`    | yes      | Array of discovered BLE devices                    |
| `firmware`   | no       | Firmware version string                            |
| `mac`        | no       | Gateway's own MAC address                          |
| `hostname`   | no       | Gateway hostname (defaults to `gateway_id`)        |
| `uptime`     | no       | Gateway uptime in seconds                          |
| `free_heap`  | no       | Free heap memory in bytes                          |

Each device in the `devices` array:

| Field               | Required | Description                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mac`               | yes      | Device MAC address                                                                                                                          |
| `rssi`              | yes      | Signal strength (dBm)                                                                                                                       |
| `name`              | no       | Advertised local name                                                                                                                       |
| `adv_data`          | no       | Raw advertisement payload as hex (AD structures). Server parses this into `manufacturerData`, `serviceData`, `serviceUuids`, and `txPower`. |
| `manufacturer_data` | no       | Pre-parsed manufacturer data: company ID (decimal string) → hex payload                                                                     |
| `service_data`      | no       | Pre-parsed service data: service UUID → hex payload                                                                                         |
| `service_uuids`     | no       | Advertised service UUIDs                                                                                                                    |
| `connectable`       | no       | Whether the device accepts GATT connections                                                                                                 |
| `tx_power`          | no       | TX power level (dBm)                                                                                                                        |

The simplest approach is to send `adv_data` with the raw AD bytes — the server will parse all fields automatically. Pre-parsed fields can supplement or override the parsed values.
