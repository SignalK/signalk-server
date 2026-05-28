---
title: BLE API
---

# BLE API

The BLE API provides a unified interface to Bluetooth Low Energy devices visible to the Signal K server. Consumer endpoints live under `/signalk/v2/api/vessels/self/ble`; remote-gateway endpoints live under `/signalk/v2/api/ble` (see below).

BLE hardware access is provided by **providers** (built-in local adapter, remote gateway, plugin-registered). Consumer plugins subscribe to the merged advertisement stream and request GATT connections through the server, without managing Bluetooth hardware directly.

## Architecture

```text
  Local BlueZ adapter (hci0, …)  ──┐
  Remote BLE gateway (over Wi-Fi)  ─┤──► BLE API (server) ──► Consumer plugin
  Plugin-registered provider       ─┘         │
                                              └──► BLE Manager UI
```

- **Providers** supply hardware access and emit `BLEAdvertisement` frames.
- The **BLE API** deduplicates devices by MAC, manages GATT connection claims, and exposes REST and WebSocket endpoints.
- **Consumers** call `app.bleApi.onAdvertisement()` and `app.bleApi.subscribeGATT()`.

## Built-in Providers

### Local Bluetooth Adapter

Enable under **Data → BLE Manager → Bluetooth Settings** (`localBluetoothManaged: true`). The server enumerates all available BlueZ adapters and registers each as a separate provider (`_localBLE:hci0`, `_localBLE:hci1`, …). An explicit adapter list can be configured via `localAdapters`.

Only available on Linux (BlueZ via DBus). Not supported on macOS or Windows.

### Remote BLE Gateway

A built-in provider that lets devices outside the server host contribute BLE coverage. A gateway either:

- maintains a WebSocket connection to `/signalk/v2/api/ble/gateway/ws` for bidirectional GATT control, **and/or**
- posts advertisement batches to `/signalk/v2/api/ble/gateway/advertisements`.

Each connected gateway is registered as `ble:gateway:<hostname>`. The advertisement-batch path is intended for memory-constrained devices that cannot keep a persistent WebSocket open; richer gateways use the WebSocket for full GATT subscribe/notify/write flows.

The reference implementation is the [SensESP BLE gateway firmware](https://github.com/dirkwa/SensESP) running on ESP32 boards (ESP32-P4 with bundled Bluedroid, ESP32-C5 stand-alone). The protocol is documented in the [AsyncAPI spec](#schemas) so other gateway implementations are straightforward.

## Endpoints

Browse the **OpenAPI spec** for REST endpoints and the **AsyncAPI spec** for the WebSocket protocols (advertisement stream and gateway GATT channel). Both are linked from the admin UI under _Documentation → OpenAPI_ / _AsyncAPI_.

Highlights:

- `GET /devices` — merged device list, deduplicated by MAC. Devices not seen recently are pruned (unless GATT-claimed).
- `GET /devices/{mac}` and `…/gatt` — single device, optionally with GATT claim status.
- `GET /_providers`, `GET /_providers/_default`, `POST /_providers/_default/{id}` — registered providers and preferred-provider override for GATT selection.
- `GET /consumers` — plugins subscribed to advertisements and/or holding GATT claims.
- `GET /settings`, `PUT /settings` — local-adapter configuration. Changes take effect immediately (providers restart in place).
- `WS /advertisements` — real-time `BLEAdvertisement` stream.
- `GET /signalk/v2/api/ble/gateways`, `POST /signalk/v2/api/ble/gateway/advertisements`, `WS /signalk/v2/api/ble/gateway/ws` — remote-gateway management (under `/signalk/v2/api/ble`, not `vessels/self`).

## BLE Manager UI

The **Data → BLE Manager** admin page shows gateway status, local adapters, registered consumer plugins, and the merged device list with per-provider signal info and GATT claims.

## Schemas

The TypeBox schemas under `@signalk/server-api/typebox` (`ble-schemas.ts`) are the single source of truth. They drive three things:

- the OpenAPI `components.schemas` (generated from the schemas in `src/api/ble/openApi.ts`, referenced from each path via `$ref`),
- runtime validation of request input (`Value.Check` on the `PUT /settings` body, the gateway advertisement-batch POST body, and the `{mac}` path parameter), and
- the data-shape TypeScript types of the consumer API (`BLEAdvertisement`, `BLEDeviceInfo`, `BLEConsumerInfo`, `BLEProviders`, …), which are derived from the schemas via `Static<>`.

The method-bearing interfaces that TypeBox cannot express (`BLEApi`, `BLEProvider`, `GATTSubscriptionHandle`, `BLEGattConnection`, …) are hand-written in `bleapi.ts`. All consumer-API types are documented in the TypeDoc output for `@signalk/server-api`.
