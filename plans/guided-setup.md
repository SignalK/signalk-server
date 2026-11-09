# Signal K Guided Setup: From Connections to Use Cases

## Original prompt

> design a process for end users to configure their signal k server, starting from connection discovery and configuration to discovering, installing and configuring the relevant plugins and webapps and their recommended plugins. once the user has configured their connections the process should be driven by the existing connections and equipment but on use cases and what the user wants to accomplish on the other hand

## Summary

A new user should go from a freshly installed Signal K server to a working setup without knowing package names: first get data in, then let the server propose plugins and webapps from two directions at once — **what is on the boat** and **what the user wants to do**.

- **Connections first.** The server discovers candidate data sources (USB gateways, CAN interfaces, network gateways, other Signal K servers), the user confirms them, and data starts flowing.
- **Equipment-driven.** Once data flows, the server builds a vessel profile from the devices and data paths it sees, and suggests apps that fit that equipment (an N2K autopilot → autopilot control; AIS targets → collision alarm).
- **Use-case-driven.** The user picks goals ("anchor watch", "log trips", "see instruments on my tablet"). Each goal maps to a bundle of apps, scored against the vessel profile: ready, ready with derived data, or missing a sensor.
- **One plan, one install.** Both sources feed a single plan with dependencies and recommended companions resolved, installed in one go, pre-configured from the profile and verified by checking that the expected data actually appears.

Design principles: data-backed suggestions only (never recommend a depth alarm without depth), explain every suggestion in one line, keep everything reversible, and make it re-runnable when equipment changes. Most of this needs only **declarative metadata in plugin package.json files** plus a wizard in the Admin UI — no change to how plugins run.

## Process overview

**Equipment and goals feed one setup plan**

```text
+----------------------+    +----------------------+    +......................+
| 1 Discover           |    | 2 Vessel profile     |    : User's goals         :
|   connections        |--->| devices, paths,      |    : "What do you want    :
| USB, CAN, network,   |    | capabilities,        |    : to do?" anchor       :
| mDNS; user confirms  |    | issues to fix        |    : watch, logging, ...  :
+----------------------+    +----------------------+    +......................+
                               ^    |         |                         |
                               :    |         +---------------+         |
            +..................+    |                         |         |
            :                       |                         |         |
            :                       v                         v         v
            :               +----------------------+    +----------------------+
            :               | 3 Equipment          |    | 4 Use-case bundles   |
            :               |   suggestions        |    | scored vs profile    |
            :               | matches devices      |    | ready / with help /  |
            :               | "Because you have.." |    | needs gear           |
            : new device or +----------------------+    +----------------------+
            : goal re-runs              |                           |
            : suggestions               |                           |
            :                           |                           |
            :                           v                           v
            :               +--------------------------------------------------+
            :               | 5 SETUP PLAN  (both sources merge here)          |
            :               | deduplicated, required dependencies added,       |
            :               | conflicts flagged; recommended companions        |
            :               | pre-ticked, each with its reason                 |
            :               +--------------------------------------------------+
            :                           |
            :                           |
            :                           |
            :                           v
            :               +----------------------+    +----------------------+
            :               | 6 Install and verify |    | Your boat page       |
            :               | config pre-filled    |--->| apps grouped by      |
            :               | from profile; one    |    | use case; health,    |
            :               | restart, data checks |    | launch buttons       |
            :               +----------------------+    +----------------------+
            :                                                       :
            +.......................................................+
```

_Solid arrows: main flow. Dotted box: user input. Dotted loop: re-entry when equipment or goals change._

Connections come first because everything else is derived from live data. The vessel profile then feeds two suggestion sources side by side — equipment on the left, the user’s goals on the right — which merge into a single plan before anything is installed. New equipment or a new goal later re-enters the flow at the profile.

## Phase 1: Discover and configure connections

The server probes everything it can reach, presents candidates as cards, and the user only confirms or corrects. Nothing is enabled without a click.

| Source | How it is discovered | What the user confirms |
| --- | --- | --- |
| USB gateways (Actisense NGT-1, YDNU-02, iKonvert, NMEA 0183 USB adapters) | `/dev/serial/by-id` + USB vendor/product id lookup table | Detected device type, baud rate if 0183 |
| CAN interfaces (PiCAN-M, MacArthur HAT, USB-CAN) | `can*` network interfaces, link state | Bitrate (250 kbit/s default) |
| Network gateways (YDWG/YDEN, Digital Yacht, MFD Wi-Fi, OpenPlotter) | mDNS/DNS-SD, listen briefly on common UDP ports (e.g. 10110, 2000), optional TCP probe of a user-given IP | Protocol (0183 / raw N2K), port |
| Other Signal K servers (e.g. Venus OS, a second Pi) | mDNS `_signalk-ws._tcp` / `_signalk-http._tcp` | Subscribe scope, self vs. other vessel |
| Unknown serial ports | Sniff 2–3 s at common baud rates, classify by sentence shape | Accept the guess or pick manually |

Steps:

1. **Scan** on first start (and on demand via a “Scan again” button). Each probe is read-only and time-boxed.
2. **Present candidates** with a confidence label (“Identified: Actisense NGT-1” vs. “Looks like NMEA 0183 at 4800 baud”) and a live sample of received sentences/PGNs.
3. **Confirm and name** each connection; the provider id defaults to something readable (`n2k-ngt1`, `ais-0183`).
4. **Verify**: the card turns green when deltas arrive, showing message rate and the first paths seen. Silent for 30 s → inline troubleshooting (wrong baud, cable, gateway mode).
5. **Manual escape hatch**: the existing Data Connections form stays available for anything not detected.

The phase ends when at least one connection delivers data, or the user explicitly skips (e.g. setting up at home with a playback file — offer the sample data file as a connection so the rest of the flow still works).

## Phase 2: Build the vessel profile

After a short observation window (about 60 s, extendable), the server turns raw traffic into a **vessel profile**: the shared input for every recommendation that follows. The user reviews it on one screen and can correct it.

The profile has four parts:

- **Devices** — from NMEA 2000 address claim and product information (manufacturer, model, software version, device class/function), NMEA 0183 talker ids, and Signal K source metadata. Example: “Raymarine EV-1 (autopilot), Garmin GPS 24xd, Victron Cerbo GX”.
- **Data paths** — which Signal K paths are present, from which sources, at what rate (`navigation.position` 1 Hz from 2 sources; `environment.depth.belowTransducer` 1 Hz).
- **Capabilities** — a small fixed vocabulary derived from paths and devices: `position`, `heading`, `speedThroughWater`, `wind`, `depth`, `ais`, `autopilot`, `batteries`, `solar`, `engines`, `tanks`, `environmentSensors`. Capabilities are what use cases and apps match against, so path details stay out of the user’s way.
- **Issues** — things to fix before going further: duplicate sources for the same path (→ offer source priorities), missing vessel basics (name, MMSI, dimensions, depth transducer offset), unknown units or stale data.

Vessel basics are asked here, in context: “You have AIS — enter your MMSI so your own boat is not shown as a target.” The profile is stored server-side so later phases, and later re-runs, read it instead of re-probing.

## Phase 3: Equipment-driven suggestions

The server matches the vessel profile against what each plugin and webapp declares it **works with** (devices) and **consumes** (capabilities/paths). The result is a short “Because you have…” list, each item with a one-line reason.

Matching rules, strongest first:

1. **Device match** — a package declares the hardware it supports (N2K manufacturer code + model pattern, USB id, mDNS service). Strongest signal; shown first.
2. **Capability match** — a package consumes capabilities the boat has, e.g. a depth alarm needs `depth`.
3. **Gap filler** — a package produces a missing capability from ones present, e.g. true wind from apparent wind + speed + heading.

| Detected | Suggestion (illustrative) | Reason shown to user |
| --- | --- | --- |
| N2K autopilot (Raymarine, Simrad, Garmin) | Autopilot plugin + control webapp | “Control your EV-1 from phone or plotter” |
| Apparent wind, STW, heading, no true wind | Derived-data plugin, true wind enabled | “Adds true wind and VMG from your existing sensors” |
| AIS targets | Collision/CPA alarm, AIS on chart plotter | “Warn when a vessel comes within a set CPA” |
| Victron GX on the network | Venus OS integration | “Battery, solar and inverter data from your Cerbo GX” |
| Batteries, tanks, engines | Dashboard webapp with matching gauges | “One screen for your energy and engine data” |
| Navico / Garmin MFD on the network | MFD integration (webapps shown on the plotter) | “Open Signal K apps on your Zeus screen” |
| Position only, nothing else | Charts + chart plotter webapp, track logging | “See your boat on a chart in any browser” |

Suggestions are capped (around 5) and ranked; the rest stays one click away under “More that works with your boat”. Packages already installed are shown as “installed — configure?” instead of being suggested again.

## Phase 4: Use-case-driven suggestions

In parallel with Phase 3, the user answers one question: **“What do you want to do with Signal K?”** They tick goals from a catalog of about a dozen use cases. Each use case is a curated bundle, scored live against the vessel profile.

| Use case | Needs (capabilities) | Core apps | Recommended companions |
| --- | --- | --- | --- |
| See my boat on a chart | `position` (+ `heading`) | Chart plotter webapp, chart provider | Track logging, routes/waypoints storage |
| Instruments on phone/tablet | any instrument data | Dashboard webapp | Derived data, unit preferences |
| Anchor watch | `position`, `depth` helps | Anchor alarm | Notification forwarding to phone |
| Collision awareness | `position`, `ais` | CPA/collision alarm | Chart plotter with AIS layer |
| Energy monitoring | `batteries`, `solar` | Dashboard with energy gauges | Victron integration, history database |
| Log trips and history | `position` | Track/history storage | Time-series DB + graphs, logbook |
| Remote monitoring and alerts | any | Notification forwarding, remote access | Alarms on batteries/bilge/anchor |
| Autopilot from my phone | `autopilot` | Autopilot plugin + webapp | Route following via course API |
| Feed my nav app (OpenCPN, Navionics, iNavX) | `position` | NMEA 0183 output over TCP | Derived data for complete sentences |
| Share my position | `position` | Position-reporting plugin of choice | Track logging |
| Weather and GRIBs | `position` | Weather provider | Chart plotter weather layer |

Each selected use case gets a readiness state:

- **Ready** — all needed capabilities present.
- **Ready with help** — a gap filler can derive what is missing; it is added to the plan automatically.
- **Needs equipment** — explained in plain words (“Anchor watch works with GPS alone, but a depth sounder makes it smarter”). The use case can still be installed; the readiness is shown, not enforced.

The catalog itself is data, not code: a versioned JSON file maintained in the Signal K org (or contributed via the plugin metadata below), so new use cases ship without a server release.

## Phase 5: Plan, install, configure, verify

Phases 3 and 4 both add items to one **setup plan**, shown like a shopping basket before anything is installed.

1. **Resolve the plan.** For every item, pull in hard dependencies (`requires`) automatically and list soft ones (`recommends`) as pre-ticked checkboxes with their reason. Deduplicate: when two use cases need a chart provider, it appears once with both reasons. Flag conflicts (two packages providing the same thing) and ask the user to pick one.
2. **Review.** The user sees: what will be installed, why (equipment or use case), and an estimated download size. Untick anything.
3. **Install in one batch** via the App Store machinery, with a single server restart at the end instead of one per package.
4. **Configure with pre-filled values.** Each plugin’s JSON-schema config form opens pre-filled from the vessel profile using the package’s setup hints: the right source for heading, the AIS connection, the battery instances found, the user’s units. Plugins enabled by default when hints fully cover their config; otherwise the user steps through the forms one per screen.
5. **Verify each item** against what it declared it would do: the derived-data plugin is “OK” when `environment.wind.speedTrue` appears; a webapp is OK when it loads. Failures show the plugin’s status message and a link to its logs.
6. **Finish** on a “Your boat” page: connections, enabled apps grouped by use case, and launch buttons for the webapps (and the MFD, if found).

Everything the wizard does is a normal install/config change, so it can be undone from the usual Admin UI screens. A plan can also be exported as JSON and applied on another server (handy for installers and boat clubs).

## Metadata model

The whole flow runs on declarations in each package’s `package.json` `signalk` section, read from the npm registry the same way the App Store already reads keywords and app icons. All fields are optional; a package without them still installs and works, it just is not suggested.

```json
"signalk": {
  "displayName": "Anchor Alarm",
  "useCases": ["anchor-watch"],
  "consumes": { "capabilities": ["position"], "optional": ["depth", "heading"] },
  "provides": { "paths": ["notifications.navigation.anchor"] },
  "worksWith": [
    { "n2k": { "manufacturerCode": 1851, "deviceClass": 40 } },
    { "usb": { "vendorId": "0403", "productId": "d9aa" } },
    { "mdns": "_signalk-ws._tcp" }
  ],
  "requires": ["@signalk/resources-provider"],
  "recommends": [
    { "package": "signalk-notification-forwarder", "reason": "Get the alarm on your phone" }
  ],
  "setupHints": {
    "radius": { "default": 50 },
    "positionSource": { "fromProfile": "preferredSource:navigation.position" }
  },
  "verify": { "pathsAppear": ["navigation.anchor.position"], "withinSeconds": 30 }
}
```

| Field | Used in | Purpose |
| --- | --- | --- |
| `worksWith` | Phase 3 | Device match against the profile |
| `consumes` / `provides` | Phases 3–4 | Capability match, gap filling, conflict detection |
| `useCases` | Phase 4 | Lets packages join catalog bundles |
| `requires` / `recommends` | Phase 5 | Dependency resolution; recommends always carries a reason |
| `setupHints` | Phase 5 | Pre-fill config schema from the profile |
| `verify` | Phase 5 | Machine-checkable “it works” test |

Package names and field values above are illustrative. To bootstrap before authors adopt the fields, the curated catalog can carry the same metadata on behalf of popular packages, with the package’s own declaration winning when present.

## After setup: keep it current

The wizard is not a one-time event; the same engine runs quietly in the background.

- **New equipment.** When a new device or capability appears in the profile (a new N2K device claims an address, `ais` shows up), a dismissible notice offers matching suggestions: “New: Garmin wind sensor. Add true wind?”
- **Lost data.** When a capability an installed app consumes goes silent for a configurable time, the app’s use case is marked degraded on the “Your boat” page, pointing at the connection that stopped.
- **New goals.** “Add a use case” reopens Phase 4 with the current profile; already-installed parts show as done.
- **Catalog updates.** New use cases or better-rated packages show up as suggestions, never as automatic changes.
- **Health check.** One page answers “is everything working?” by re-running every installed package’s `verify` check.

## Open questions and rollout

Open questions:

- [ ] Who curates the use-case catalog and ranks packages when several fit (download counts, maintainer status, manual curation)?
- [ ] Is passive UDP listening and serial sniffing acceptable by default on all platforms, or opt-in per probe?
- [ ] Capability vocabulary: fixed core list in the server, or extensible by packages?
- [ ] Where does source priority setup belong: Phase 2 issues, or its own step?
- [ ] How does the flow behave on read-only or managed installs (Venus OS, OpenPlotter, Docker)?

Suggested rollout:

1. **Connections wizard** (Phase 1) with USB/CAN/mDNS detection — useful on its own, no plugin changes needed.
2. **Vessel profile** (Phase 2) as a server API and a read-only Admin UI page.
3. **Use-case catalog** (Phase 4) with metadata carried in the catalog for ~20 popular packages, plus batch install (Phase 5).
4. **Package metadata spec** published; author adoption via docs, the plugin template and App Store badges (“Supports guided setup”).
5. **Equipment suggestions and background notices** (Phase 3 and ongoing) once enough packages declare `worksWith`.
