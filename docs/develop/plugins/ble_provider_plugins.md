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
const MAC = 'AA:BB:CC:DD:EE:FF'
let gattHandle = null

plugin.start = async function () {
  const descriptor = {
    mac: MAC,
    service: '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
    notify: ['00002a19-0000-1000-8000-00805f9b34fb'] // Battery Level
  }

  try {
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
  } catch (err) {
    // Also rejects when plugin.stop() released the device while connecting
    app.debug(`GATT subscription failed: ${err.message}`)
    return
  }

  gattHandle.onDisconnect(() => {
    app.debug('GATT disconnected — server will reconnect automatically')
  })
}

plugin.stop = async function () {
  // Also cancels a subscription that is still connecting
  await app.bleApi.releaseGATTDevice(MAC, plugin.id)
  gattHandle = null
}
```

The descriptor declares notifications, polled reads (optionally with a write-before-read), one-time init writes, and periodic writes. The provider executes the full lifecycle (connect → discover → subscribe → reads/writes) and re-runs it on disconnect. See `GATTSubscriptionDescriptor` and `GATTSubscriptionHandle` in `@signalk/server-api` for the full type definitions.

Close your handles in `plugin.stop()`, as above. Once `stop()` has completed, the server releases any GATT claims the plugin still holds, and closes connections that come up after that.

### Raw GATT Connection

For sensors with truly dynamic GATT sequences, use `connectGATT` to get a raw connection handle. Prefer `subscribeGATT` with a descriptor when possible — it handles reconnection automatically.

```javascript
const conn = await app.bleApi.connectGATT('AA:BB:CC:DD:EE:FF', plugin.id)
const services = await conn.discoverServices()
const data = await conn.read(serviceUuid, charUuid)
await conn.disconnect()
```

Setting up a connection can take a while. A plugin that stops waiting for one, for instance on a timeout of its own, should release the device with `app.bleApi.releaseGATTDevice(mac, plugin.id)`. The connection is then closed as soon as it comes up and the pending `connectGATT` or `subscribeGATT` call rejects. Otherwise a connection that comes up late stays claimed by the plugin, and its next attempt fails with `already claimed`.

### BLE API Mode Detection

Consumer plugins that can also operate with a direct BlueZ connection should auto-detect which mode to use:

```javascript
plugin.start = async function () {
  if (app.bleApi) {
    await startBleApiMode()
  } else {
    await startDirectBlueZMode()
  }
}
```

---

## Provider Plugin

A provider plugin gives the server access to a BLE radio. Register a provider by calling `app.registerBLEProvider()`. The server will call your `onAdvertisement` callback to receive all advertisements, merge them into the device table, and route GATT requests to your `subscribeGATT` method. The provider is unregistered automatically when the plugin stops.

```javascript
const plugin = { id: 'my-ble-gateway', name: 'My BLE Gateway' }

plugin.start = function () {
  const provider = {
    name: 'My Gateway',
    methods: {
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
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

  app.registerBLEProvider(provider)
}
```

See `BLEProviderMethods` in `@signalk/server-api` for the full method signatures.

### Advertisement format

Each advertisement fired into the server must conform to `BLEAdvertisement` (see `@signalk/server-api` for the full schema). Key semantics that are not obvious from the type alone:

- `mac` is uppercase, colon-separated (`AA:BB:CC:DD:EE:FF`).
- `providerId` is associated with your plugin by `app.registerBLEProvider(provider)`; the server stamps every advertisement with the registering plugin's ID, overriding a mismatched value.
- `manufacturerData` keys are **decimal** Bluetooth SIG company IDs; values are hex-encoded payloads **without** the 2-byte company ID prefix.

---

## Consumer API Reference

All consumer-facing methods (`onAdvertisement`, `subscribeGATT`, `connectGATT`, `getDevices`, etc.) are exposed on `app.bleApi`. See the `BLEApi` interface in `@signalk/server-api` for full signatures.

---

## Remote Gateway Protocol

Remote BLE gateways feed advertisements via HTTP POST and (optionally) participate in GATT subscribe/notify/write over a bidirectional WebSocket. The exact request bodies are defined in the [OpenAPI spec](../rest-api/ble_api.md), and the WebSocket message frames and connection flow in the AsyncAPI spec (admin UI: _Documentation → AsyncAPI_, raw document at `/skServer/asyncapi/ble`) — see them for the canonical wire contract. The reference firmware is [SensESP](https://github.com/dirkwa/SensESP) for ESP32 boards.
