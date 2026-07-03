---
title: Stale Data Detection
---

# Stale Data Detection

When a sensor or bus stops sending data, the last received value would otherwise be displayed forever — and zone-based alerting plugins stay silent because no new delta ever arrives. Signal K Server therefore enforces `meta.timeout` on the self vessel: when a path stops updating beyond its effective timeout, the server marks the value as timed out so displays and plugins can react.

Enforcement is enabled by default and applies to `vessels.self` paths only.

## How It Works

Once per second the server checks every monitored path+source pair against its effective timeout. Staleness is tracked per source: if two GPS units provide `navigation.position` and one goes silent, only that source's value times out.

When a pair exceeds its timeout, the server emits a single delta with `value: null` and a `state` container describing what happened:

```json
{
  "path": "navigation.speedOverGround",
  "value": null,
  "state": {
    "timedOut": true,
    "lastValue": {
      "timestamp": "2026-03-28T10:00:00Z",
      "value": 5.5
    }
  }
}
```

The delta carries the original `$source`. It is emitted once per timeout; when a fresh value arrives the normal delta flow replaces the `null` and the path recovers automatically.

Clients that do not understand `state` simply see `null` — the safe interpretation of missing data. Clients that do can render "stale since" indicators from `state.lastValue`.

A sensor that legitimately reports `value: null` itself (for example an echo sounder with no bottom fix) is a regular update and is never flagged with `state.timedOut`.

## Update Contracts

Not all paths update periodically. Each path has an update contract, declared with `meta.updateContract`:

| Contract             | Meaning                                               | Enforcement                    |
| -------------------- | ----------------------------------------------------- | ------------------------------ |
| `periodic` (default) | Regular updates expected; silence indicates a failure | Timed out when silent too long |
| `event`              | Emits only on change; silence means unchanged         | Never timed out                |

Well-known event-driven paths are pre-classified by the server, among them `notifications.*`, `navigation.anchor.*`, `navigation.course.*`, `navigation.home.*`, `design.*`, `communication.*` and identity fields such as `uuid`, `mmsi` and `name`. Notification lifecycles in particular are managed by plugins and people, never by timeout: an unacknowledged alarm is active, not stale.

To classify a custom path, set `updateContract` in the path's metadata (Data Browser meta editor or the meta API). An explicit `updateContract` always wins over the shipped classification.

## Timeout Resolution

For a `periodic` path, the effective timeout is resolved in this order:

1. **Explicit `meta.timeout`** (seconds) set for the path. `0` means the path is never considered stale.
2. **`meta.timeout: "auto"`** — the server learns the timeout from the observed update rate: five times the median interval of the last 10 updates, clamped between 2 and 300 seconds. During a 30-second warm-up the global default applies. A GPS updating every second times out after ~5 seconds; a tank level every 30 seconds after ~150 seconds.
3. **Signal K specification defaults** for the path, where the specification defines a timeout.
4. **Global default timeout** (60 seconds) when _Use default timeouts_ is enabled.

If none of these produce a timeout, the path is not monitored.

When [Source Priority](./source-priority.md) is active for a path, the effective timeout never undercuts the configured failover window, so staleness does not fire while a lower-priority source is still legitimately waiting to take over.

## Working With Notification Plugins

Timeout enforcement and notifications complement each other: when a sensor path times out, the emitted `null` delta flows to zone-based notification plugins like any other value, allowing them to raise a "sensor lost" alarm. That alarm then follows the normal notification lifecycle and is itself never timed out.

## Configuration

Enforcement is on by default. The following settings keys control it:

| Setting                    | Default | Purpose                                                              |
| -------------------------- | ------- | -------------------------------------------------------------------- |
| `enforceDataTimeouts`      | `true`  | Master switch for the enforcer                                       |
| `useDefaultTimeouts`       | `true`  | Apply the global default to periodic paths without their own timeout |
| `defaultTimeout`           | `60`    | Global fallback timeout in seconds                                   |
| `staleCheckIntervalMs`     | `1000`  | How often the enforcer checks, in milliseconds                       |
| `autoTimeoutSamples`       | `10`    | Update intervals sampled for `timeout: "auto"`                       |
| `autoTimeoutWarmupSeconds` | `30`    | Warm-up before a learned `auto` timeout takes effect                 |

Per-path control is available to every user via the path's metadata: a numeric `timeout` to tighten or relax detection, `0` to exempt the path, `"auto"` to let the server learn, or `updateContract: "event"` to declare the path event-driven.
