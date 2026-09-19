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

When two devices on the bus share the same Device Instance and transmit overlapping data PGNs, nothing in NMEA 2000 guarantees that a downstream instrument can tell their readings apart. Source Discovery detects these overlaps and surfaces them via:

- A warning badge on the sidebar's _Data_ entry.
- A conflict alert panel at the top of the Source Discovery page.
- Per-PGN highlighting inside an expanded device row, marking the PGNs that overlap.

### This check is deliberately failsafe

The standard does not require globally unique Device Instances, and many instruments do not need them. Signal K Server cannot see which chartplotter, MFD or PC application finally consumes the data — some consumers are not even on the bus — so it cannot know whether a given overlap matters on your boat. It therefore flags every overlap the standard permits a consumer to resolve ambiguously, and leaves the judgement to you.

**A flagged conflict is not automatically a fault.** It means two devices are relying on the consumer to disambiguate them by something other than the Device Instance.

Whether that is safe depends on the consumer:

- **Instruments that select sources by device name** are generally unaffected. Most Navico and Furuno displays let you pick a preferred source (and often a backup) per data point, regardless of instance numbers. Two devices both reporting heel on the same instance will not confuse them.
- **Instruments that select sources by instance number** are affected, and the symptoms look like a data problem rather than a configuration one. Maretron equipment depends on instance numbers for source selection and expects them to be unique across the bus. TimeZero Pro picks the lowest available instance per sensor type and per consumed PGN, so several GPS units sharing one instance make the boat jump around on the chart.

If you are sure your instruments cope, use **Ignore** on the pair (see below). If you are unsure, giving the devices distinct instances is harmless and removes the ambiguity permanently.

### Assigning distinct instances anyway

Even when your current display does not care, distinct instance numbers cost nothing and make the bus self-describing. A practical scheme is to number sensors of the same kind in order of preference, for example a primary GPS at instance 1, a secondary GPS at 2 and an AIS-internal GPS at 3. Consumers that fall back to the lowest instance then pick your preferred source by default, and future equipment behaves predictably.

Changing an instance is not always the right answer, though. Victron equipment uses Device Instance for internal coordination between chargers — see the manufacturer caveats above before editing.

### Ignoring a conflict

Each conflict pair carries an **Ignore** button. Use it once you have checked the pair and confirmed that your instruments handle it — it records a decision, it does not silence a pending problem.

Ignored pairs move to an _Ignored Conflicts_ card below the device list, stop counting towards the warning badge, and are stored on the server, so the decision survives a browser change and a server restart. Each pair can be brought back individually with **Restore**. Ignoring is per device pair, so a genuine new conflict elsewhere on the bus still raises a warning.

### What is excluded from counting

Some overlaps are never reported, because they carry no ambiguity:

- **Protocol and management PGNs** that carry bus housekeeping rather than sensor data — ISO Address Claim, Product Information, Heartbeat, and similar.
- **Manufacturer-proprietary PGNs**, where the same PGN number carries different payloads for different manufacturers, so an overlap says nothing.
- **Temperature and humidity PGNs**, whose unique key is instance plus source type rather than instance alone. Two sensors on the same instance reporting different source types are not in conflict.
- **PGNs whose data instances do not overlap**, where Signal K has observed the actual data instances in use.
