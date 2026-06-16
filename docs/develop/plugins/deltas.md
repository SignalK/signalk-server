---
title: Processing Data
---

# Processing data from the server

A plugin will generally want to:

1. Subscribe to data published by the server _(i.e. received from a NMEA 2000 bus, etc)_
1. Emit data.

In both cases the plugin will use _deltas_ which the server uses to signal changes in the Signal K full data model. Delta messages contain the new value associated with a path (not the amount of change from the previous value.)\_

_See the [Signal K Delta Specification](http://signalk.org/specification/1.7.0/doc/data_model.html#delta-format) for details._

Using the server API, plugins can either:

1. Get the current value of a path in the full model or
1. Subscribe to a path and access a stream of _deltas_ that updates every time the value is updated.

By specifying a context _e.g. 'vessels.self'_ you can limit the number of delta messages received to those of host vesseel.
To receive all deltas you can specify `*` as the context.

You can also limit the deltas received by the path you supply.
If you supply a specific path _e.g. navigation.position_, only updates in the value will be received.
Since paths are hierarchical, paths can contain wildcards _e.g.\_navigation.\*_ which will deliver deltas containing updates to all paths under `navigation`.

The data received is formatted as per the following example:

```javascript
  {
    path: 'navigation.position',
    value: { longitude: 24.7366117, latitude: 59.72493 },
    context: 'vessel.self',
    source: {
        label: 'n2k-sample-data',
        type: 'NMEA2000',
        pgn: 129039,
        src: '43'
    },
    $source: 'n2k-sample-data.43',
    timestamp: '2014-08-15T19:00:02.392Z'
  }
```

## Reading the current path value

The server API provides the following methods for retrieving values from the full data model.

- `getSelfPath(path)` returns the value of the supplied `path` in the `vessels.self` context.

```javascript
const value = app.getSelfPath('uuid')
app.debug(value) // Should output something like urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
```

- `getPath(path)` returns the value of the path (including the context) starting from the _root_ of the full data model.

```javascript
const baseStations = app.getPath('shore.basestations')
```

## Subscribing to Deltas

A can subscribe to a stream of updates (deltas) by creating the subscription.

Subcriptions are generally manged in the plugin `start()` and `stop()` methods to ensure the subscribtions are _unsubscribed_ prior to the plugin stopping to ensure all resources are freed.

The following example illustrates the pattern using the {@link @signalk/server-api!ServerAPI.subscriptionmanager | `subscriptionmanager`} API method.

```javascript
let unsubscribes = []

plugin.start = (options, restartPlugin) => {
  app.debug('Plugin started')
  let localSubscription = {
    context: '*', // Get data for all contexts
    subscribe: [
      {
        path: '*', // Get all paths
        period: 5000 // Every 5000ms
      }
    ]
  }

  app.subscriptionmanager.subscribe(
    localSubscription,
    unsubscribes,
    (subscriptionError) => {
      app.error('Error:' + subscriptionError)
    },
    (delta) => {
      delta.updates.forEach((u) => {
        app.debug(u)
      })
    }
  )
}

plugin.stop = () => {
  unsubscribes.forEach((f) => f())
  unsubscribes = []
}
```

In the `start()` method create a subscription definition `localSubscription` which is then passed to `app.subscriptionmanager.subscribe()` as the first argument, we also pass the `unsubscribes` array in the second argument.

The third argument is a function that will be called when there's an error.

The final argument is a function that will be called every time an update is received.

In the `stop()` method each subcription in the `unsubscribes` array is _unsubscribed_ and the resources released.

### Path Discovery with `announceNewPaths`

When using granular subscriptions (subscribing to specific paths rather than `*`), you may want to discover what paths are available without receiving continuous updates for all of them. The `announceNewPaths` option solves this:

```javascript
let localSubscription = {
  context: '*',
  announceNewPaths: true, // Announce all matching paths once
  subscribe: [
    {
      path: 'navigation.position', // Only get continuous updates for this path
      period: 1000
    }
  ]
}
```

When `announceNewPaths: true` is set:

1. **On subscribe**: The server sends cached values for ALL existing paths matching the context filter (once each)
2. **On new path**: When a new path appears later (e.g., a new sensor comes online), the server announces it once
3. **Continuous updates**: Only the explicitly subscribed paths receive continuous updates

This is useful for:

- **Data browsers** that need to show all available paths but only update visible ones
- **Discovery tools** that want to know what data is available
- **Dashboards** that let users select which data to display

The announced deltas are regular delta messages - there's no special flag. Your client should track which paths it has seen and can then subscribe to specific ones as needed.

### Source Policy: `sourcePolicy`

When the server has [Source Priority](../../setup/source-priority.md) configured, subscriptions receive only the preferred source's data by default. You can override this with the `sourcePolicy` option:

```javascript
let localSubscription = {
  context: '*',
  sourcePolicy: 'all',
  subscribe: [
    {
      path: 'navigation.position',
      period: 1000
    }
  ]
}
```

| Value         | Behaviour                                                            |
| ------------- | -------------------------------------------------------------------- |
| `'preferred'` | Only deliver values from the preferred source (default)              |
| `'all'`       | Deliver values from all sources regardless of priority configuration |

Use `sourcePolicy: 'all'` when your plugin needs to see data from every source — for example, a display that compares readings from multiple sensors, or a data logger that records all sources.

**Note:** `sourcePolicy` is honoured only when subscribing through `app.subscriptionmanager.subscribe()` — the recommended API documented above. Plugins that read directly from `app.streambundle` (`getBus()`, `getSelfStream()`) always receive the preferred-only stream and have no way to opt into all sources; new plugins should prefer `subscriptionmanager.subscribe()`.

#### WebSocket connection query parameter

WebSocket clients can apply the same policy to the entire connection by setting the `sourcePolicy` query parameter on the streaming endpoint:

```
ws://localhost:3000/signalk/v1/stream?subscribe=self&sourcePolicy=all
```

| Query value             | Behaviour                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| _(omitted)_/`preferred` | Connection delivers preferred-only deltas (default)                    |
| `all`                   | Connection delivers deltas from every source, regardless of priorities |

The query-string default applies to the bootstrap cache replay and to per-message subscriptions that don't carry their own `sourcePolicy`. A subscribe message can still override it on a per-call basis by including `sourcePolicy` in the message body.

#### Excluding Sources: `excludeSources` / `excludeSelf`

A plugin may want a priority-resolved view of a path with one or more sources removed from the cascade — for example to see the preferred upstream source while ignoring a known-bad device. `excludeSources` / `excludeSelf` provide that: the subscription still receives a single priority-resolved value per path, but the cascade runs without the excluded refs.

> **Note:** Because the cascade runs on the subscription's feed, this delivers a single priority-resolved value — and if the user ranks the plugin itself above the upstream source, that source is held to the fallback timeout on the plugin's own input. That is the right behaviour for a plugin that wants _the preferred remaining upstream value_, but **not** for a correction/transform plugin that must see every raw sample at full rate — for that case see [Correction and transform plugins](#correction-and-transform-plugins) below, which uses `sourcePolicy: 'all'`.

The same fallback semantics the user configured still apply across the remaining sources:

```javascript
let localSubscription = {
  context: 'vessels.self',
  excludeSelf: true,
  subscribe: [
    {
      path: 'environment.wind.speedTrue'
    }
  ]
}
```

With user ranking `myPlugin > sourceB > sourceA`:

| Bus state                                  | Delivered to plugin |
| ------------------------------------------ | ------------------- |
| `sourceB` publishing                       | `sourceB`           |
| `sourceB` silent past its fallback timeout | `sourceA`           |
| `sourceB` resumes                          | `sourceB`           |
| `myPlugin` (own output)                    | _(never delivered)_ |

| Field                      | Behaviour                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `excludeSources: string[]` | Drop these `$source` refs from the cascade. Explicit form; works in both plugin and WebSocket subscriptions.               |
| `excludeSelf: true`        | Plugin-only shorthand. The server resolves it to `[plugin.id]`. Combine with `excludeSources` to add explicit refs on top. |

Both fields take effect only when `sourcePolicy` is `'preferred'` (the default). Under `sourcePolicy: 'all'` they are ignored — `'all'` already bypasses the priority cascade and partial filtering would be surprising.

`excludeSelf` resolves to the plugin's id only — a single ref, not a prefix match. A plugin that publishes under additional labels (e.g. `myPlugin.windFromPolars`) should use the explicit `excludeSources` form to list every ref it produces.

WebSocket subscriptions can use `excludeSources` directly. `excludeSelf` is meaningless for them (there is no plugin identity to resolve against) and is silently ignored — WebSocket clients should always use the explicit form.

The match is on the `$source` of the deltas your plugin emits, and `excludeSelf` resolves to your bare `plugin.id`. So your emitted deltas must carry `$source === plugin.id` for the exclusion to apply. The simplest way is to emit with **no** `source` object at all — the server then sets `$source` to your `plugin.id`:

```javascript
app.handleMessage(plugin.id, {
  context: 'vessels.self',
  updates: [
    { values: [{ path: 'environment.wind.speedTrue', value: corrected }] }
  ]
})
```

If you do supply a `source` object, also set a top-level `$source: plugin.id` on the update — the server keeps an explicit `$source` and only derives one from the `source` object when it is absent, so this guarantees the match. (See [Sending Deltas](#sending-deltas) below.)

## Sending Deltas

A SignalK plugin can not only read deltas, but can also send them. This is done using the `handleMessage()` API method and supplying:

1. The plugin id
2. A formatted delta update message
3. The Signal K version ['v1' or 'v2'] _(if omitted the default is 'v1')_. See [REST APIs](../rest-api/README.md) for details.

_Example:_

```javascript
app.handleMessage(
  plugin.id,
  {
    updates: [
      {
        values: [
          {
            path: 'environment.outside.temperature',
            value: -253
          }
        ]
      }
    ]
  },
  'v1'
)
```

## Correction and transform plugins

There are essentially two strategies a plugin can employ to change a value for a path:

1. **Correct in place** when the value enters the server
2. **Create a new value** with correction or transform and publish an improved value on the **same** path under its own label

**In place strategy** is used when the new value is meant to replace the original value completely, for example applying a fixed offset to a heading to compensate for a sensor's mount position. This makes the original value unavailable for other consumers.

With **new value strategy** both values are available, but using the source priority system the plugin's output can be prioritised over the original value. The user ranks the plugin's output above the raw source in [source priority](../../setup/source-priority.md), so downstream consumers get the corrected value and a user interface like a dashboard can display both if needed.

A correction plugin needs its **input** at full rate, _independent_ of the priority ranking — you correct every reading from the upstream source, not just whichever one a cascade would currently prefer — while the user's ranking decides what _consumers_ see. Subscribe with **`sourcePolicy: 'all'`** and skip your own output in the callback:

- `sourcePolicy: 'all'` delivers every source at full rate with no cascade on your input. Skip updates whose `$source` is your own `plugin.id` so you don't reprocess your output. The global priority cascade still applies to consumers, so the user's ranking of your output works as expected.

Do **not** use `registerDeltaInputHandler` for **new value strategy**. An input handler is for modifying a delta in place as it passes through, not for republishing a value under your own source — a correction plugin emits its corrected value under its own `$source` and lets source priority choose between that and the raw source, which is a different shape from rewriting the incoming delta. Subscribe-and-emit keeps the raw and corrected values as two distinct sources the user can rank.

`excludeSelf` (see [Excluding Sources](#excluding-sources-excludesources--excludeself)) is a different tool and **not** what you want for a full-rate correction. It runs the priority cascade on your input feed, so it delivers a single ranked-and-throttled upstream value rather than every reading: with the user ranking your plugin rank-0, the real source is held as a lower-ranked fallback and only reaches you after the fallback timeout. `excludeSelf` fits a plugin that wants _the preferred remaining upstream value_ (e.g. "show source B, fall back to A, never my own C"), not one that corrects each raw sample.

A complete heel-correction example:

```javascript
let unsubscribes = []

plugin.start = () => {
  app.subscriptionmanager.subscribe(
    {
      context: 'vessels.self',
      sourcePolicy: 'all',
      subscribe: [{ path: 'navigation.speedThroughWater' }]
    },
    unsubscribes,
    (err) => app.setPluginError(err),
    (delta) => {
      delta.updates.forEach((u) => {
        // $source is a property of the update, not of each value. Skip
        // our own output so we don't reprocess the corrected value.
        if (u.$source === plugin.id) return
        u.values.forEach((pv) => {
          if (pv.path !== 'navigation.speedThroughWater') return
          const corrected = applyHeelCorrection(pv.value)
          // No source object: $source defaults to plugin.id, so the
          // guard above recognises and skips this delta on the way back.
          app.handleMessage(plugin.id, {
            context: 'vessels.self',
            updates: [
              {
                values: [
                  { path: 'navigation.speedThroughWater', value: corrected }
                ]
              }
            ]
          })
        })
      })
    }
  )
}

plugin.stop = () => {
  unsubscribes.forEach((f) => f())
  unsubscribes = []
}
```

## Sending NMEA 2000 data from a plugin

A SignalK plugin can not only emit deltas, but can also send data such as NMEA 2000 data.

This is done using the `emit()` API and specifying the provider as well as the formatted data to send.

_Example: Send NMEA using Actisense serial format:_

```javascript
app.emit(
  'nmea2000out',
  '2017-04-15T14:57:58.468Z,0,262384,0,0,14,01,0e,00,88,b6,02,00,00,00,00,00,a2,08,00'
)
```

_Example: Send NMEA using Canboat JSON format:_

```javascript
app.emit('nmea2000JsonOut', {
  pgn: 130306,
  'Wind Speed': speed,
  'Wind Angle': angle < 0 ? angle + Math.PI * 2 : angle,
  Reference: 'Apparent'
})
```

### Sending a message on NMEA2000 startup

If you need to send an NMEA2000 message out at startup, _e.g get current state from a device_ you will need to wait until the provider is ready before sending your message.

_Example: Send NMEA after the provider is ready:_

```javascript
app.on('nmea2000OutAvailable', () => {
  app.emit(
    'nmea2000out',
    '2017-04-15T14:57:58.468Z,2,6,126720,%s,%s,4,a3,99,01,00'
  )
})
```
