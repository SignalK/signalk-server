---
title: WebSocket Backpressure
---

# WebSocket Backpressure

Signal K Server includes automatic backpressure handling to gracefully manage slow client connections. This document explains how to detect and handle backpressure events in your webapp or plugin.

## Overview

When a client's WebSocket connection can't keep up with the data rate, the server enters "backpressure mode" for that connection:

1. Instead of queuing more data (which would consume server memory), the server keeps only the **latest value** for each path
2. When the client catches up, accumulated values are sent in a single delta with a `$backpressure` indicator
3. Normal operation resumes automatically

## Detecting Backpressure

When the server flushes accumulated values after a backpressure period, it adds a `$backpressure` property to the delta:

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  if (msg.$backpressure) {
    // This delta contains accumulated values from a backpressure period
    console.warn(
      `Backpressure: ${msg.$backpressure.accumulated} paths accumulated over ${msg.$backpressure.duration}ms`
    )

    // Show a user notification
    showNetworkWarning(
      'Network congestion detected - some updates were skipped'
    )
  }

  // Process delta normally - values are still valid (just the latest ones)
  handleDelta(msg)
}
```

## Delta Format

Normal delta:

```json
{
  "context": "vessels.urn:mrn:imo:mmsi:123456789",
  "updates": [
    {
      "$source": "n2k-01.115",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "values": [
        {
          "path": "navigation.position",
          "value": { "latitude": 60.0, "longitude": 25.0 }
        }
      ]
    }
  ]
}
```

Backpressure flush delta:

```json
{
  "context": "vessels.urn:mrn:imo:mmsi:123456789",
  "updates": [...],
  "$backpressure": {
    "accumulated": 42,
    "duration": 1250
  }
}
```

## Properties

| Property                    | Type   | Description                                                              |
| --------------------------- | ------ | ------------------------------------------------------------------------ |
| `$backpressure.accumulated` | number | Number of unique context:path:$source combinations that were accumulated |
| `$backpressure.duration`    | number | Milliseconds the server was in backpressure mode for this client         |

## Important Notes

- **Values are correct** - the delta contains the latest values, only intermediate updates were dropped
- **Per-connection** - backpressure is specific to each WebSocket connection, not server-wide
- **Automatic recovery** - the server exits backpressure mode as soon as the client catches up
- **Consider reducing scope** - if backpressure is frequent, consider using granular subscriptions to reduce data volume

## Best Practices

1. **Show a non-blocking warning** - inform users without interrupting their workflow
2. **Auto-dismiss** - clear the warning after a timeout (10 seconds is reasonable)
3. **Don't panic** - backpressure is graceful degradation, not an error
4. **Log for debugging** - record backpressure events to help diagnose network issues

## Testing

Environment variables for testing (not recommended for production):

```bash
# Lower thresholds for testing
BACKPRESSURE_ENTER=1024      # Enter backpressure at 1KB (default: 512KB)
BACKPRESSURE_EXIT=0          # Exit when buffer is empty (default: 1KB)
```
