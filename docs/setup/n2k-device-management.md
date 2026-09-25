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

## Instance Path Mapping

When NMEA 2000 data is converted to Signal K, each data instance is written under a fixed path. Signal K defines no standard names for engines, batteries or tanks, so these paths are generic:

- Engine instance 0 becomes `propulsion.port` and instance 1 `propulsion.starboard`. On a single-engine boat, or with a genset that also reports engine 0, these names are wrong.
- Batteries, tanks, chargers and inverters get their bare instance number, for example `electrical.batteries.3` or `tanks.fuel.1`.
- Some temperature, humidity and pressure sources have a fixed path that ignores the instance. Two Engine Room temperature sensors with instances 0 and 1 both write `environment.inside.engineRoom.temperature` and overwrite each other.

Instance path mapping lets you choose the path for a device's data instance. The NMEA 2000 converter (n2k-signalk) writes the data at the chosen path directly, so it never appears at the path it would have without a rule. The raw instance number in `$source` data is unchanged.

### Choosing Paths

Paths are edited in the device's detail on the _Data → NMEA Discovery_ page, in the **Signal K paths** section. The section lists each instance the device sends, with its N2K data instance and its Signal K path. Every row has exactly one path: the one you chose, or else the one n2k-signalk writes. Engine instance 255 ("no data") is shown as _absent_; it is written at the same path as instance 1.

Each row offers only the paths its group allows (see below): a name to type, a branch or location to pick, or both. When the row's path fits those choices, the editor shows it. When it does not, such as `electrical.dc.50.0` for a DC connection, the row shows it as its current path and the editor starts empty; the row changes only once you pick something. A **Reset** link, shown when a row's path differs from the one n2k-signalk writes, returns the row to that path, whether or not it fits the choices. Changed rows are highlighted until you save or discard them. Changes take effect on save, without restarting the connection. A path saved for an instance the device is not currently sending keeps its row and can be deleted there.

Only paths that differ from the one n2k-signalk writes are stored; a row reset to it stores nothing, so it follows n2k-signalk if that path ever changes.

For example:

| Device sends                                | Written without a rule                      | Mapped to                                      |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Engine instance 0 (PGN 127488, 127489, ...) | `propulsion.port`                           | `propulsion.main`                              |
| Engine Room temperature, instance 1         | `environment.inside.engineRoom.temperature` | `environment.inside.engineRoomAft.temperature` |

With the first rule the engine writes `propulsion.main.revolutions`, and an engine alarm is raised at `notifications.propulsion.main.overTemperature`. With the second, the instance 0 sensor keeps its path and the instance 1 sensor gets its own.

A rule is keyed on the instance number. When you change a device's Battery Instance or DC Instance on the NMEA Discovery page, the device's battery rule for the old number moves to the new number, keeping its path. The rule moves once the device sends data with the new instance; if the device does not do so within 30 seconds, the rule stays on the old number. The battery group covers PGNs 127506, 127508 and 127513, so renumbering either of the two instances moves the one rule for the group, and the page warns when the device still sends another of these PGNs with the old number, whose data then goes to the path it has without a rule until that instance is changed too. If the new number already has a rule, or the device already sends it, the rule is left as it is and the page shows a warning.

Instances changed anywhere else, such as a data instance or temperature instance on the NMEA Discovery page, or any instance changed with the device's own configuration tool, do not move the rule: it stays on the old number and stops applying.

### What Can Be Mapped

| Group                            | PGNs                           | Without a rule                                              | You choose                                                                                            |
| -------------------------------- | ------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Engine                           | 127488, 127489, 127493, 127497 | `propulsion.<port, starboard or instance>`                  | `propulsion` or `generator`, and a name                                                               |
| Battery                          | 127506, 127508, 127513         | `electrical.batteries.<instance>`                           | a name under `electrical.batteries`                                                                   |
| Charger                          | 127507, 127510                 | `electrical.chargers.<instance>`                            | a name under `electrical.chargers`                                                                    |
| Inverter                         | 127504, 127509, 127511         | `electrical.inverters.<instance>`                           | a name under `electrical.inverters`                                                                   |
| AC input                         | 127503                         | `electrical.ac.<instance>`                                  | a name under `electrical.ac`                                                                          |
| AC connection                    | 127744, 127745, 127746         | `electrical.ac.<address>.<connection>`                      | a name under `electrical.ac`                                                                          |
| Tank                             | 127505                         | `tanks.<type>.<instance>`                                   | a tank type from the specification, and a name                                                        |
| DC connection                    | 127751                         | `electrical.dc.<address>.<connection>`                      | `electrical.solar`, `electrical.alternators` or `electrical.batteries`, and a name; or any path       |
| Converter                        | 127750                         | `electrical.converter.<address>.<connection>`               | as DC connection                                                                                      |
| Temperature                      | 130312, 130316                 | depends on the source, e.g. `environment.water.temperature` | a temperature location from the specification; for Shaft Seal and user-defined sources, also any path |
| Humidity                         | 130313                         | depends on the source, e.g. `environment.outside.humidity`  | a humidity location from the specification; for sources other than Inside and Outside, also any path  |
| Pressure: atmospheric, oil, fuel | 130314                         | depends on the source, e.g. `environment.outside.pressure`  | a pressure location from the specification                                                            |
| Pressure: other sources          | 130314                         | depends on the source                                       | any path                                                                                              |

A name is letters and digits only. Locations come from the Signal K specification's path metadata: temperature offers the leaves measured in kelvin, such as `environment.inside.<zone>.temperature` or `propulsion.<id>.exhaustTemperature`, and pressure the leaves measured in pascals. Derived temperatures are not offered: dew point, wind chill and heat index are computed from other readings, so no measured sensor belongs there. A dew point, wind chill or heat index source (codes 9 to 12) is still written at its own path, which the row shows as its current path and which Reset returns it to. A location with a `<zone>` or `<id>` segment takes a name there. The tank type can be changed because senders often report the wrong one.

Where the specification has no place for the data, the row's choices end with **Other path…**, which takes any path the pressure sources would accept. This covers wind generators, hydro-generators and fuel cells on a DC connection or converter, and temperature and humidity sources n2k-signalk writes under `generic.temperatures` or `environment.userDefined…`, such as a wet exhaust sensor that reports a user-defined source code. A saved other path shows with Other path… selected; the path n2k-signalk writes is shown as the current path instead.

For the groups up to Converter the path is a prefix: everything the device writes for that instance moves under it, including notifications under `notifications.<prefix>`. Temperature, humidity and pressure write a single value per instance, so their path is the full path of that value.

A few consequences to be aware of:

- **Generators follow an unmerged proposal.** `generator.<name>` follows the generator group proposed in [SignalK/specification PR 584](https://github.com/SignalK/specification/pull/584), which was never merged. An engine mapped there keeps the engine PGNs' leaf names, and the server has no path metadata for them.
- **An engine rule does not move the exhaust temperature.** PGN 130312 reports exhaust gas temperature at `propulsion.<instance>.exhaustTemperature` whatever the engine rule says. Map that sensor separately, for example to `propulsion.main.exhaustTemperature`.
- **A sensor can land on a leaf of a mapped group.** A temperature or pressure location under a mapped engine or battery is accepted, and it may be a leaf that group also writes, such as `propulsion.main.temperature`. The two then overwrite each other.

Two groups cannot be mapped. Switch banks (PGN 127501) are switched through PUT requests and NMEA 2000 output on their paths, so a renamed bank could no longer be controlled. The rudder (PGN 127245) has only one path in the specification, `steering.rudderAngle`, so there is nowhere to put a second one.

A device's rules must also satisfy:

- Engine, battery, tank and the other prefix targets must not be equal to or contain one another. Two temperature, humidity or pressure targets must not be equal. A sensor target may sit under a prefix target.
- A target has at most 8 segments and 128 characters and does not start with `notifications`.
- A device has at most 64 rules.

The server does not check a target against the paths the device's other instances are written at without a rule, because it cannot know which instances a device actually has. Mapping a mislabelled Inside sensor to `environment.inside.mainCabin.temperature` is accepted even though that is where a Main Cabin sensor would be written. The editor warns on every row whose path equals or overlaps the path of another row listed for the device, whether or not either row was changed; two Engine Room sensors that both write `environment.inside.engineRoom.temperature` are flagged as soon as the device is scanned. The warning names the other row and does not block the save. If two instances of one device do end up on the same path, their values alternate there.

Two different devices may be mapped to the same path, since two devices can legitimately report the same battery; source priorities then choose between them.

### How Devices Are Identified

Rules belong to a device, not to a connection or a bus address. The device is identified by the manufacturer code and unique number from its CAN Name, so rules survive Device Instance and System Instance edits and address changes, and apply on every connection the device is seen on. The _Use Can NAME_ setting of the connection does not matter. A replacement device has a different unique number, so its rules must be set up again.

The rules are stored in `settings.json` under `n2kInstanceMappings`, keyed by `<manufacturer code>:<unique number>`.

**The device's ISO Address Claim (PGN 60928) must be received.** Without it the server cannot tell which device a frame comes from, and the rules for that device are not applied. Connections that can transmit request the address claim from every device. On a receive-only connection, such as a UDP gateway, or when playing back a recording, rules apply only once the device sends its address claim by itself; a recording that does not contain it cannot be mapped.

While any rules are configured, data from mappable PGNs is held back for up to 10 seconds after a device first appears at an address, until its address claim is received. Data from other PGNs is not affected. If the address claim arrives later than that, the data already written at the paths without a rule is removed and later data goes to the mapped paths.

### Limitations

- **Only incoming data is mapped.** PUT handlers and NMEA 2000 output keep using the paths without a rule, and nothing maps a Signal K path back to an NMEA 2000 instance.
- **History is split.** History providers keep the recorded values under the old path; the new path's history starts when the rule is saved.
- **Path-keyed settings do not follow.** [Path-level overrides](./source-priority.md#path-level-overrides) in Source Priority and edits under _Data → Metadata_ that were made for the old path are not moved to the new one.
- **Plain WebSocket clients keep the old value.** When a rule changes, the server removes the values at the old path from its data model, but a Signal K WebSocket stream has no way to tell a connected client that a path is gone. Such clients keep showing the last value at the old path until they reconnect.
- **Consumers must be pointed at the new paths.** Apps, dashboards and plugins that expect `propulsion.port` or `electrical.batteries.<n>` for a mapped device need to be reconfigured.

## Instance Conflict Detection

When two devices on the bus share the same Device Instance and transmit overlapping data PGNs, instruments downstream may not be able to tell their readings apart. Source Discovery detects these conflicts and surfaces them via:

- A warning badge on the sidebar's _Data_ entry.
- A conflict alert panel at the top of the Source Discovery page.
- Per-PGN highlighting inside an expanded device row, marking the PGNs that overlap.

Protocol PGNs that every device sends (Address Claim, Product Information, etc.) and temperature/humidity PGNs where the data source field already distinguishes readings are excluded from conflict counting.
