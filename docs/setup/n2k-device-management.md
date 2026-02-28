---
title: NMEA 2000 Device Management
---

# NMEA 2000 Device Management

Signal K Server can discover and configure NMEA 2000 devices directly from the Admin UI. This includes identifying all devices on the bus, viewing their product information, detecting instance conflicts, and remotely changing device and data instances — all without additional hardware like an Actisense NGT-1.

These features are available in the Admin UI under _Data -> Source Discovery_.

## Source Discovery

The Source Discovery page shows all data sources connected to Signal K Server. For NMEA 2000 connections, it provides a detailed table of every device on the bus.

### Discovering Devices

When you first open Source Discovery, Signal K displays the devices it has seen so far based on incoming traffic. To request detailed product information (model name, software version, serial number) from all devices, click the **Discover N2K Devices** button.

Discovery works by sending an ISO Request (PGN 59904) to each device individually, asking for its Product Information (PGN 126996). Requests are spaced 500ms apart to avoid overwhelming the gateway's TCP buffer. A progress indicator shows while discovery is in progress.

_Note: Discovery requires a bidirectional connection to the NMEA 2000 bus (e.g. Yacht Devices YDWG-02 via TCP, or a CAN adapter). UDP connections are receive-only and cannot send discovery requests._

### Device Identification: CAN Name

Signal K Server identifies NMEA 2000 devices by their **CAN Name** — a globally unique 64-bit identifier from the ISO Address Claim (PGN 60928). The CAN Name is derived from the device's manufacturer code, unique ID, and device class, producing a stable identifier like `Furuno_SCX-20` or `Garmin_GPS_19x_HVS`.

This is more reliable than the N2K source address (e.g. `22`), which can change when devices are added or removed from the bus. Using CAN Name means your source priority configuration and other source-specific settings remain valid even if source addresses shift.

The `$source` field for N2K devices uses the format `connectionName.canName`, e.g. `can0.Furuno_SCX-20`.

### Device Table

The device table displays one row per NMEA 2000 device with the following columns:

| Column              | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| **Source**          | The connection name and CAN Name (e.g. `can0.Furuno_SCX-20`)          |
| **Manufacturer**    | Manufacturer name from ISO Address Claim (PGN 60928)                  |
| **Model**           | Model identifier from Product Information (PGN 126996)                |
| **Serial**          | Serial number from Product Information                                |
| **Firmware**        | Software version from Product Information                             |
| **Device Class**    | NMEA 2000 device class and function                                   |
| **Device Instance** | The device's instance number from ISO Address Claim                   |
| **Data Instance**   | The lower 3 bits of the device instance (used by some device classes) |
| **Label**           | Installation Description 1 — a free-text label stored on the device   |

All columns are sortable by clicking the column header. Click again to reverse the sort direction.

### Expanded Device Detail

Click a row to expand it and see the full detail for that device, including:

- All identifying information (manufacturer, model, serial, firmware, device class)
- Device Instance and Data Instance with inline editing
- Installation Description (free-text label) with inline editing
- Battery Instance (PGN 127508) and DC Instance (PGN 127506) editing
- Complete list of PGNs observed from this device

## Instance Concepts

NMEA 2000 uses instance numbers to distinguish between multiple sensors of the same type. Understanding the different types of instances is key to managing a multi-device network.

### Device Instance

The **Device Instance** (0–253) is part of a device's ISO Address Claim (PGN 60928). It identifies a specific physical device. The 8-bit value is split into two fields:

- **Device Instance Lower** (bits 0–2, range 0–7): Also called the "Data Instance", this is used by some protocols to distinguish data sources. For example, on a boat with two identical depth transducers, setting different Data Instance values allows the system to tell them apart.

- **Device Instance Upper** (bits 3–7, range 0–31): Also called the "System Instance", this groups devices into subsystems.

Together they form the full Device Instance: `(upper << 3) | lower`.

### Battery Instance (PGN 127508)

The **Battery Instance** (0–252) is a field within Battery Status messages (PGN 127508). It identifies which battery bank a measurement belongs to. This is separate from the Device Instance — a single device can report data for multiple battery banks using different Battery Instance values.

**Common problem:** When multiple Victron MPPTs or similar charge controllers are connected via a gateway (e.g. Victron GX device with NMEA 2000 output), they all default to Battery Instance 0. This makes it impossible for MFDs or Signal K to distinguish which battery data comes from which charger. The solution is to assign unique Battery Instance values to each device.

### DC Instance (PGN 127506)

The **DC Instance** (0–252) is a field within DC Detailed Status messages (PGN 127506). Similar to Battery Instance, it identifies which DC source the measurements belong to.

## Editing Instances

Signal K Server can remotely change device and data instances by sending PGN 126208 (NMEA Command Group Function) messages to devices on the bus.

### Changing Device Instance

In the expanded device detail view, click the Device Instance value to edit it. Enter a new value (0–253) and press Enter to send the change command. The device should respond by updating its ISO Address Claim with the new instance value.

Changing the Device Instance changes both the lower and upper parts together.

### Changing Data Instance Only

To change only the Data Instance (Device Instance Lower, 0–7) without affecting the System Instance (Device Instance Upper), click the Data Instance value in the expanded detail view.

### Changing Battery Instance

In the expanded device detail view, the **Battery Instance (PGN 127508)** field allows you to send a command to change a device's battery instance number (0–252). This is the same operation that previously required an Actisense NGT-1 and NMEA Reader software.

The current value shows "–" because the server does not track per-PGN instance values in real time. Enter the desired new value and press Enter to send the command. After the device accepts the change, its battery status messages will use the new instance number and Signal K will map them to a separate path (e.g. `electrical.batteries.1.*` instead of `electrical.batteries.0.*`).

### Changing DC Instance

Similarly, the **DC Instance (PGN 127506)** field lets you change the DC instance number (0–252) for DC Detailed Status messages.

### Editing Installation Descriptions

PGN 126998 (Configuration Information) contains two free-text fields stored on the device itself:

- **Installation Description 1**: Typically used for device location or notes (e.g. "Port Engine Room", "Bow Thruster"). Click to edit in the expanded detail view.

- **Installation Description 2**: Some manufacturers use this field for device configuration commands. For example, Yacht Devices products accept special strings starting with `YD:` to configure device instance, system instance, Maretron compatibility mode, and other settings. After a command is accepted, the device appends "DONE" to the text (e.g. `YD:DEV 1 DONE`). See your device manufacturer's documentation for supported commands.

_Note: Not all devices support changing instances or installation descriptions via PGN 126208. If a device does not support these commands, it will simply ignore them. No error is returned because NMEA 2000 PGN 126208 commands do not have a standardised acknowledgement mechanism._

## Instance Conflict Detection

When multiple devices on the same NMEA 2000 bus share the same Device Instance and transmit overlapping data PGNs, it can cause confusion — Signal K may not be able to distinguish which device is providing which data.

Signal K Server automatically detects these conflicts and alerts you:

1. **Sidebar badge**: A yellow warning badge appears on the _Data_ menu item (and on _Source Discovery_ when the menu is expanded) showing the number of conflicting device pairs.

2. **Conflict alerts**: At the top of the Source Discovery page, each conflict is described showing the two devices involved, their shared instance number, and the number of overlapping data PGNs.

3. **Conflict filtering**: Click on a conflict alert to filter the device table to show only the two conflicting devices, making it easy to compare them and change one device's instance.

4. **PGN-level highlighting**: When viewing the expanded detail of a device involved in a conflict, the specific PGNs that overlap with another device at the same instance are marked with a warning icon.

Protocol and management PGNs (such as ISO Address Claim, Product Information, and NMEA Command Group Function) are excluded from conflict detection since every device on the bus transmits these.

## Typical Workflow: Resolving Instance Conflicts

1. Open _Data -> Source Discovery_ in the Admin UI
2. If the sidebar shows a yellow warning badge, click _Source Discovery_ to see the conflicts
3. Click on a conflict alert to filter to the two conflicting devices
4. Expand both devices to see their details and which PGNs overlap
5. Change the Device Instance (or Battery/DC Instance) on one of the devices to a unique value
6. Click **Discover N2K Devices** to refresh the device information
7. Verify the conflict is resolved (the warning badge count should decrease)

## REST API

The Source Discovery features are backed by two REST endpoints.

### POST /skServer/n2kDiscoverDevices

Triggers discovery of all NMEA 2000 devices on the bus. Sends ISO Request (PGN 59904) to each known device address, requesting Product Information (PGN 126996).

**Request:** No body required.

**Response:**

```json
{
  "state": "COMPLETED",
  "statusCode": 200,
  "message": "Discovery request sent to 12 devices (~6s)"
}
```

Returns `503` if N2K output is not available (e.g. no bidirectional connection to the bus).

### POST /skServer/n2kConfigDevice

Sends a PGN 126208 command to change a device's configuration.

**Request body:**

```json
{
  "dst": 22,
  "field": "deviceInstance",
  "value": 1
}
```

| Parameter | Type   | Description                                   |
| --------- | ------ | --------------------------------------------- |
| `dst`     | number | The N2K source address of the target device   |
| `field`   | string | The configuration field to change (see below) |
| `value`   | varies | The new value to set                          |

**Supported fields:**

| Field                      | Target PGN | Value Range | Description                                              |
| -------------------------- | ---------- | ----------- | -------------------------------------------------------- |
| `deviceInstance`           | 60928      | 0–253       | Full device instance (sets both lower and upper parts)   |
| `deviceInstanceLower`      | 60928      | 0–7         | Data Instance only (lower 3 bits)                        |
| `installationDescription1` | 126998     | string      | Free-text device label                                   |
| `installationDescription2` | 126998     | string      | Free-text field (used for device config on some devices) |
| `batteryInstance`          | 127508     | 0–252       | Battery bank instance number                             |
| `dcInstance`               | 127506     | 0–252       | DC source instance number                                |

**Response:**

```json
{
  "state": "COMPLETED",
  "statusCode": 200,
  "message": "Configuration command sent to device 22"
}
```

Returns `400` for invalid parameters or unknown fields, `503` if N2K output is not available.
