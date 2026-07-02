---
title: NMEA 2000 Device Management
---

# NMEA 2000 Device Management

Signal K Server can discover and configure NMEA 2000 devices directly from the Admin UI under _Data → Source Discovery_. This includes identifying devices on the bus, viewing their product information, detecting instance conflicts, and remotely changing device, battery and DC instances — without additional hardware like an Actisense NGT-1.

## Source Discovery

Source Discovery lists every data source the server has seen. For an NMEA 2000 connection it shows one row per device with manufacturer, model, software version, instance numbers and installation labels.

The server identifies devices by **CAN Name**, the 64-bit unique identifier from the ISO Address Claim (PGN 60928). The CAN Name is stable across address changes — when a device drops off and rejoins the bus it can take a different N2K address, but its CAN Name does not change. Two devices of the same model still get different CAN Names because the ISO Address Claim includes a per-device unique number.

If you connect over a bidirectional gateway (e.g. Yacht Devices YDWG-02 over TCP, or a CAN adapter), pressing **Discover N2K Devices** asks each device for its Product Information so manufacturer/model fields are populated. UDP-only gateways are receive-only and cannot be used for discovery.

### Known limitation: source attribution over Yacht Devices UDP

When the bus is fed via a Yacht Devices YDEN-02 (or similar) over UDP, observed bus frames can occasionally be attributed to the gateway's own N2K address instead of the originating device. The same setup over TCP, or a directly attached CAN adapter, does not show this — both the canhat / Actisense direct path and the YDWG-02 TCP path produce a clean source list.

The effect: a device like an IPG100 that physically does not transmit, say, PGN 127258 may nonetheless appear as a source for `navigation.magneticVariation` in Source Discovery and inside priority groups. Trash the row from the group when it goes Offline (see Source Priorities), or — preferably — switch the connection to TCP so the wrong attribution does not happen in the first place.

You can give any device a custom alias via the pencil icon next to its label — useful when two identical devices need to be told apart (e.g. "Bow GPS" vs "Stern GPS").

## Instance Concepts

NMEA 2000 uses several different instance numbers to distinguish between sensors of the same kind. Knowing which one to change matters: editing the wrong one usually has no effect, and on Victron equipment editing the wrong one can break parallel-charging coordination.

### Device Instance (in PGN 60928, ISO Address Claim)

The **Device Instance** identifies a physical device on the bus. It comprises two parts that can be edited together or independently:

- **Data Instance** ("Device Instance Lower") — used by some classes of device to distinguish sensor readings from the same device.
- **System Instance** ("Device Instance Upper") — groups devices into subsystems.

### Battery Instance (in PGN 127508, Battery Status)

The **Battery Instance** identifies which battery bank a measurement belongs to. It is independent of the Device Instance — a single charger can report multiple banks.

The common multi-MPPT problem: when several Victron solar chargers report through one Victron GX gateway they all default to Battery Instance 0, so MFDs and Signal K cannot tell their readings apart. Assigning unique Battery Instance values to each charger is the fix.

### DC Instance (in PGN 127506, DC Detailed Status)

The **DC Instance** plays the same role for `127506` (DC voltage/current measurements) that Battery Instance plays for `127508`.

## Editing Instances

Signal K Server can change instance numbers and installation descriptions remotely by sending PGN 126208 (NMEA Command Group Function). Open a device row, edit the field, and submit — the new value is broadcast to the device. The Admin UI exposes only the fields that have a defined PGN 126208 mapping.

Not every device implements PGN 126208. The protocol does not define an acknowledgement, so a non-supporting device silently ignores the command. If the value does not change after a few seconds, the device probably does not accept that field over the bus.

PGN 126998 (Configuration Information) carries two free-text fields. The first is normally used for a location label ("Port Engine Room", "Bow Thruster"). The second is used by some manufacturers — Yacht Devices in particular — for `YD:`-prefixed configuration commands; consult the manufacturer documentation before writing to it.

**Manufacturer caveats.** Victron equipment uses Device Instance for internal synchronization between chargers; changing it on a live system can break parallel charging or ESS coordination. The Admin UI surfaces a Victron-specific warning at the edit point. For other manufacturers a generic "check your device documentation first" reminder is shown.

## Instance Conflict Detection

When two devices on the bus share the same Device Instance and transmit overlapping data PGNs, instruments downstream may not be able to tell their readings apart. Source Discovery detects these conflicts and surfaces them via:

- A warning badge on the sidebar's _Data_ entry.
- A conflict alert panel at the top of the Source Discovery page.
- Per-PGN highlighting inside an expanded device row, marking the PGNs that overlap.

Protocol PGNs that every device sends (Address Claim, Product Information, etc.) and temperature/humidity PGNs where the data source field already distinguishes readings are excluded from conflict counting.
