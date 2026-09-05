---
title: Alerts API
---

# Alerts API

The Alerts API manages the lifecycle of alerts: conditions that need an operator to notice, decide and act.

The exact request and response schemas are served by the running server at `/doc/openapi` and are generated from the same TypeBox definitions the API validates with. This page describes the model and the behaviour behind them.

## Overview

An alert names a condition and carries the state of the operator's response to it. The path identifies the alert and describes what is wrong — `propulsion.port.oilPressureLow`, not the sensor path that measured it — and there is one active alert per path and context. Data paths the condition concerns go in the optional `references` array, which is informational and never identity.

The server owns the lifecycle. A source describes a condition; the server decides what state its alert is in, what it takes to leave that state, and when it is over. That ownership is why the subsystem is in server core rather than a plugin: alerts arrive from deltas, from REST clients and from plugins, and a single owner is what keeps them from disagreeing.

Alerts are published as deltas at `alerts.<alert path>` carrying the whole alert as the value, so any Signal K client can mirror the active set without polling. The active set is republished when the server starts, so a client that connects after a restart sees restored alerts without waiting for something to happen.

### Lifecycle

States follow IEC 62682:

| State                | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `unacknowledged`     | The condition is present and nobody has acknowledged it      |
| `acknowledged`       | The condition is present and an operator has acknowledged it |
| `rtn-unacknowledged` | The condition ended before anyone acknowledged it            |
| `normal`             | Terminal. The alert is resolved and has left the active set  |

A `caution` whose condition ends resolves by itself. Anything more urgent waits for acknowledgment, because an alarm that goes away on its own is an alarm nobody saw. An alert marked `latching` waits for acknowledgment whatever its priority.

An unacknowledged `warning` escalates to an `alarm` after a configurable window. Escalation resets acknowledgment; there is no de-escalation.

Silencing is orthogonal to all of it: it quiets the annunciator for a bounded time and never changes state, never reorders the list, and never resolves anything. The bound depends on priority; the escalation window and both silence maxima are in `src/api/alerts/index.ts`.

### Staleness

An alert whose source stops re-emitting it is marked `stale` after the source timeout in `src/api/alerts/alertManager.ts`. It stays visible and stays actionable: a source going quiet is not evidence that the condition resolved. Staleness applies to alerts raised by delta, whose re-emission is the heartbeat. An alert raised through REST or the plugin API is raised once and never goes stale.

## REST endpoints

Under `/signalk/v2/api/alerts`:

| Method | Path                | Purpose                                                |
| ------ | ------------------- | ------------------------------------------------------ |
| GET    | `/`                 | The active set, ordered as an operator reads it        |
| POST   | `/`                 | Raise an alert, or update the one already on that path |
| GET    | `/{id}`             | One alert                                              |
| POST   | `/{id}/acknowledge` | Acknowledge                                            |
| POST   | `/{id}/silence`     | Silence, optionally for a given number of seconds      |
| POST   | `/{id}/escalate`    | Raise to a higher priority                             |
| PUT    | `/{id}/condition`   | Report whether the condition is still present          |
| POST   | `/silence-all`      | Silence every active alert                             |
| GET    | `/history`          | The audit trail, filterable and paged                  |
| GET    | `/status`           | Whether alert state is being persisted                 |

The list is ordered per IMO MSC.302(87) 9.16: emergencies first, then unacknowledged above returned-to-normal above acknowledged, most urgent and most recent first within each group.

Reading requires read access and every mutating call requires write access, inherited from the v2 API path prefix.

## Raising alerts from a delta

A device raises an alert by sending a value at its alert path:

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "n2k-1",
      "values": [
        {
          "path": "alerts.propulsion.port.oilPressureLow",
          "value": { "priority": "alarm", "message": "Oil pressure low" }
        }
      ]
    }
  ]
}
```

Only descriptive fields are read — `priority`, `message`, `group`, `latching`, `references`, `data`. Lifecycle fields in an incoming value are ignored: a device cannot declare its own alert acknowledged.

Sending `null` at the path, or a value with `state: normal`, reports that the condition ended. Any source may do this, not only the one that raised it; the audit trail records who did.

## The plugin API

`app.alerts` gives a plugin the same operations:

```javascript
const alert = await app.alerts.raise({
  path: 'propulsion.port.oilPressureLow',
  priority: 'alarm',
  message: 'Oil pressure low'
})

await app.alerts.acknowledge(alert.id)
await app.alerts.silence(alert.id, 30) // seconds, as over REST
await app.alerts.clearCondition(alert.id)

app.alerts.list({ state: 'unacknowledged' })
```

Alerts raised this way are attributed to the plugin that raised them. `list`, `get` and `getByPath` read the same active set the REST API and the deltas carry.

## Limits

An alert is held in memory, written to the database and republished to every subscriber, so the path, message, group, `references` and `data` fields are each bounded at every ingress surface. The bounds themselves are in `src/api/alerts/description.ts` and `alertPath.ts`. REST rejects an oversized field with 400; a delta carrying one is dropped with a log line.

The active set is capped. When it is full, a more urgent alert displaces the least urgent one — the lowest priority, and among equals the one whose state changed longest ago — which is announced and recorded in the audit trail as a displacement. An alert no more urgent than everything active is refused.

## Persistence

Active alerts and the audit trail are stored in SQLite under `serverState/alerts/`, so alert state survives a restart. The audit trail is pruned against a retention window and the freed pages are returned to the filesystem over subsequent prunes.

A failed write does not stop an alert being raised or announced: annunciation never waits on the disk. `GET /status` reports `degraded` while the store and the active set disagree, which clears by itself once a write succeeds again. A database that cannot be opened at all stops the server with an error naming the file, rather than starting an alarm system that silently persists nothing.

A backup of the database has to include the `-wal` and `-shm` files beside it, or be taken while the server is stopped.
