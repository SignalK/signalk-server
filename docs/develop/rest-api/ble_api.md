---
title: BLE API
---

# BLE API

The BLE API provides a unified interface to Bluetooth Low Energy (BLE) devices visible to the Signal K server. It is accessible under `/signalk/v2/api/vessels/self/ble`.

BLE hardware access is provided by **provider plugins** (or built-in adapters). Consumer plugins — such as sensor plugins — subscribe to the merged advertisement stream and request GATT connections through the server, without needing to manage Bluetooth hardware directly.

## Architecture

```text
  Local Adapter (hci0, hci1, …)  ──┐
  ESP32 BLE Gateway (Wi-Fi WS)   ──┤──► BLE API (server) ──► Consumer Plugin
  Custom provider plugin          ──┘         │
                                              └──► BLE Manager UI
```

- **Providers** supply hardware access and fire BLE advertisements into the server.
- The **BLE API** deduplicates devices by MAC address, manages GATT connection claims, and exposes REST and WebSocket endpoints.
- **Consumers** call `app.bleApi.onAdvertisement()` and `app.bleApi.subscribeGATT()`.

## Built-in Providers

### Local Bluetooth Adapter

Enable in **Server Settings → Bluetooth** (`localBluetoothManaged: true`). The server enumerates all available BlueZ adapters and registers each as a separate provider (`_localBLE:hci0`, `_localBLE:hci1`, …). An explicit list can be configured via `localAdapters`.

> **Platform support:** Local Bluetooth adapter management uses BlueZ and is only available on Linux. It is not supported on macOS or Windows. ESP32 gateways and consumer plugins work on all platforms.

### ESP32 BLE Gateway

A WebSocket-based provider that accepts connections from ESP32 devices running the Signal K BLE gateway firmware. Each gateway is registered as `ble:gateway:<hostname>`. Gateways are visible in the BLE Manager UI and remain listed for 60 seconds after disconnect.

## REST Endpoints

All endpoints are under `/signalk/v2/api/vessels/self/ble`.

### `GET /devices`

Returns all BLE devices currently visible across all providers, deduplicated by MAC address. Devices not seen for more than 2 minutes are removed unless they have an active GATT connection.

```json
[
  {
    "mac": "AA:BB:CC:DD:EE:FF",
    "name": "RuuviTag",
    "rssi": -65,
    "lastSeen": 1710000000000,
    "connectable": true,
    "seenBy": [
      {
        "providerId": "ble:gateway:esp32-gw1",
        "rssi": -65,
        "lastSeen": 1710000000000
      }
    ],
    "gattClaimedBy": "bt-sensors-plugin-sk"
  }
]
```

### `GET /devices/{mac}`

Returns a single device by MAC address (case-insensitive). Returns 404 if not found.

### `GET /devices/{mac}/gatt`

Returns the current GATT claim status for a device.

```json
{ "claimedBy": "bt-sensors-plugin-sk" }
```

`claimedBy` is `null` if no plugin holds a GATT connection to this device.

### `GET /consumers`

Returns all registered consumer plugins.

```json
[
  {
    "pluginId": "bt-sensors-plugin-sk",
    "advertisementSubscriber": true,
    "gattClaims": ["AA:BB:CC:DD:EE:FF"]
  }
]
```

### `GET /_providers`

Returns all registered BLE providers (local adapters + gateways + plugin-registered providers).

### `GET /settings`

Returns BLE configuration and runtime adapter status.

```json
{
  "localBluetoothManaged": true,
  "localAdapters": [],
  "localMaxGATTSlots": 3,
  "activeAdapters": ["_localBLE:hci0"],
  "adapterErrors": {}
}
```

- `localAdapters`: explicit list of adapters to use; `[]` means auto-enumerate all available adapters.
- `activeAdapters`: provider IDs of successfully started local adapters.
- `adapterErrors`: adapter name → error message for adapters that failed to start.

### `PUT /settings`

Update BLE settings. Accepted fields:

| Field                   | Type     | Description                                       |
| ----------------------- | -------- | ------------------------------------------------- |
| `localBluetoothManaged` | boolean  | Enable/disable local Bluetooth management         |
| `localAdapters`         | string[] | Explicit adapter list; `[]` = auto                |
| `localMaxGATTSlots`     | number   | Max concurrent GATT connections per local adapter |

Changes take effect immediately — running providers are restarted.

## WebSocket Advertisement Stream

Connect to `ws://<host>/signalk/v2/api/vessels/self/ble/advertisements` to receive a real-time stream of BLE advertisements as JSON objects. Each message is a [`BLEAdvertisement`](#bleadvertisement) object.

## Gateway REST Endpoints

Gateway management endpoints are under `/signalk/v2/api/ble` (not under `vessels/self`).

### `GET /ble/gateways`

Returns all known gateways (online and offline) with status, firmware, uptime, heap, and GATT slot info.

### `POST /ble/gateway/advertisements`

ESP32 gateways POST advertisement batches to this endpoint. See the [gateway POST body documentation](../plugins/ble_provider_plugins.md#esp32-gateway-post-body) for the full schema.

## BLE Manager UI

The BLE Manager is available at **Server → BLE Manager** in the admin UI. It shows:

- **Status row**: gateway count, consumer count, device count, live advertisement rate.
- **BLE Gateways**: per-gateway table with status, firmware, uptime, free heap, GATT usage.
- **Local Bluetooth Adapters**: per-adapter status (Active / Not available) when local management is enabled.
- **Consumer Plugins**: registered consumer plugins and their GATT claims.
- **BLE Devices**: all visible devices with RSSI, last seen time, which providers see them, and GATT claim status.

## Data Types

### BLEAdvertisement

| Field              | Type      | Description                                 |
| ------------------ | --------- | ------------------------------------------- |
| `mac`              | string    | Device MAC address (`AA:BB:CC:DD:EE:FF`)    |
| `name`             | string?   | Advertised local name                       |
| `rssi`             | number    | Signal strength (dBm)                       |
| `manufacturerData` | object?   | Company ID (decimal) → hex payload          |
| `serviceData`      | object?   | Service UUID → hex payload                  |
| `serviceUuids`     | string[]? | Advertised service UUIDs                    |
| `providerId`       | string    | Provider that received this advertisement   |
| `timestamp`        | number    | Unix timestamp (ms)                         |
| `connectable`      | boolean?  | Whether the device accepts GATT connections |
| `txPower`          | number?   | TX power level (dBm)                        |
| `addressType`      | string?   | `public` or `random`                        |
