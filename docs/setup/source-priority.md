---
title: Source Priority
---

# Source Priority

When multiple data sources provide the same Signal K path (e.g. two GPS devices both providing `navigation.position`), Signal K Server needs to decide which source to use. The Source Priority system lets you control this.

These features are available in the Admin UI under _Data -> Source Priority_.

## Understanding Multi-Source Paths

A **multi-source path** is any Signal K path that receives data from two or more sources. This is common on boats with:

- Multiple GPS receivers (e.g. a chartplotter GPS and a standalone GPS antenna)
- NMEA 0183 and NMEA 2000 devices providing the same data (e.g. depth from both buses)
- Plugins that derive or calculate values also provided by hardware (e.g. true wind)

Multi-source paths are not errors — they are a normal part of a multi-device installation. The Source Priority system helps you choose which source should be preferred for each path.

### Sidebar Badge

The sidebar shows a yellow warning badge on the _Data_ menu item when there are multi-source paths that have no priority configuration. The number indicates how many such paths exist. As you configure priorities, this count decreases. The badge updates in real time as sources come and go.

## Source Ranking

Source Ranking is a **global** priority list that applies to all paths where the listed sources overlap. This is the simplest way to configure priorities and covers the most common case: "always prefer GPS A over GPS B for everything they both provide".

### How It Works

Sources are ordered by priority — source #1 is preferred over source #2, and so on. Each non-preferred source has a **timeout** (in milliseconds) that controls how long the server waits before falling back to it when a higher-ranked source stops sending data. Default is 60000ms (60 seconds).

A source can be **disabled** to block its data entirely for all paths, without removing it from the ranking.

Sources not listed in the ranking are unranked and treated as lowest priority with a 120 second timeout.

### Example

A boat has three GPS devices: Furuno SCX-20 (CAN), Furuno GP-330B (CAN), and an NMEA 0183 GPS on serial0. All three provide `navigation.position`, `navigation.speedOverGround`, and `navigation.courseOverGroundTrue`.

Ranking them as:

1. `can0.SCX-20` (preferred)
2. `can0.GP-330B` (timeout: 60000ms)
3. `serial0.GP` (timeout: 60000ms)

means the server always uses SCX-20 data when available. If SCX-20 stops sending data for 60 seconds, the server falls back to GP-330B. If GP-330B also stops, it falls back to serial0.GP.

## Path-Level Overrides

For individual paths where you need different priority than the global ranking, use **Path-Level Overrides**. These take precedence over the Source Ranking for the specified path only.

### When to Use Path-Level Overrides

- You want a different GPS for position than for speed over ground
- A specific sensor is more accurate for one measurement but not others
- You want to use a plugin's calculated true wind instead of the hardware sensor's

## How Priority Resolution Works

When a new data value arrives, the server decides whether to accept or reject it based on:

1. **Path-level override** — if configured for this path, it controls which sources are accepted and in what order
2. **Source Ranking** — if no path-level override exists, the global ranking applies
3. **No configuration** — if neither exists, all sources are accepted equally (no filtering)

The priority engine uses a timeout-based fallback mechanism:

- The preferred source (rank #1) always wins when it is actively sending data
- If the preferred source stops sending, lower-ranked sources are accepted after their timeout expires
- When the preferred source resumes, it immediately takes over again

All source data is preserved in the server's data model regardless of priority configuration. Priority filtering only affects which source's values are delivered to subscribers by default. See [Source Priority in the Data Browser](#source-priority-in-the-data-browser) for how to view all sources.

## Source Priority in the Data Browser

The Data Browser (_Data -> Data Browser_) includes a **Source Priority** toggle that controls which source's data is displayed:

- **On** (default): Shows only the preferred source's data for each path, respecting your priority configuration
- **Off**: Shows data from all sources, regardless of priority

This is useful for:

- Verifying that priority configuration is working correctly
- Comparing values from different sources
- Debugging sensor issues by seeing all incoming data

## Source Identification

Signal K Server identifies sources differently depending on the connection type:

### NMEA 2000 Sources

N2K sources are identified by their **CAN Name** — a globally unique 64-bit identifier derived from the ISO Address Claim (PGN 60928). This is more reliable than the source address (which can change when devices are added or removed from the bus). The `$source` field for N2K devices looks like `can0.Furuno_SCX-20` rather than `can0.22`. See [NMEA 2000 Device Management](./n2k-device-management.md) for details.

### NMEA 0183 Sources

NMEA 0183 sources are identified by the connection name and talker ID, e.g. `serial0.GP`.

### Plugin Sources

Plugin sources use the plugin ID as their `$source`, e.g. `derived-data` or `signalk-venus-plugin`.

## REST API

The Source Priority configuration is managed through the following REST endpoints:

### GET /skServer/sourcePriorities

Returns the current path-level priority configuration.

**Response:**

```json
{
  "navigation.position": [
    { "sourceRef": "can0.SCX-20", "timeout": 0 },
    { "sourceRef": "can0.GP-330B", "timeout": 60000 }
  ]
}
```

### PUT /skServer/sourcePriorities

Saves a new path-level priority configuration. Requires admin access.

**Request body:** Same format as the GET response.

### GET /skServer/sourceRanking

Returns the current global source ranking.

**Response:**

```json
[
  { "sourceRef": "can0.SCX-20", "timeout": 0 },
  { "sourceRef": "can0.GP-330B", "timeout": 60000 },
  { "sourceRef": "serial0.GP", "timeout": 60000 }
]
```

A timeout of `-1` means the source is disabled (blocked).

### PUT /skServer/sourceRanking

Saves a new global source ranking. Requires admin access.

**Request body:** Same format as the GET response.
