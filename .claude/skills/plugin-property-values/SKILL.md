---
name: plugin-property-values
description: How Signal K plugins coordinate with each other through PropertyValues (app.emitPropertyValue / app.onPropertyValues). Use when one plugin must tell another it is running, offer it a function or setting, or react to such an announcement, and when reviewing code that uses globals or shared app properties for that instead.
---

# Plugin coordination with PropertyValues

## When to use it

PropertyValues are the server's channel for passing configuration-type values between components in the server process: plugins, input connections and the server itself. Use them when a plugin must:

- announce that it is running and what it takes care of, so another plugin can stand down (for example, a collision alarm plugin telling a radar plugin that it evaluates radar targets);
- offer an extension that others pick up, such as a function (`nmea0183sentenceParser` adds parsers for custom NMEA 0183 sentences);
- react to such an announcement from a plugin that may start before or after it.

Do not use them for data that changes regularly. Measurements and state belong in deltas (`app.handleMessage`); PropertyValues keep every value ever emitted.

Do not coordinate through properties added to `app`: each plugin gets its own shallow copy of it, so the other plugin never sees them. A `globalThis` property works but gives the other side nothing to react to, and the server cannot see it.

## How it behaves

- `app.emitPropertyValue(name, value)` appends `{ timestamp, setter, name, value }` to the history of `name`. `setter` is the emitting plugin's id. The value can be any type, functions included.
- `app.onPropertyValues(name, cb)` calls `cb` at once with the whole history of `name`, and again on every later emit. The history always starts with `undefined`, so the first call may be `[undefined]`. The latest value is the last element. It returns an unsubscribe function.
- There is no plugin start order. A value may already be there when a listener subscribes or arrive later, so the listener has to handle both, and every change after that.
- The history is never trimmed. The server allows 1000 values in total across all names, and `emitPropertyValue` throws once that is reached. Emit on changes only, never on a timer or per delta.
- Nothing is withdrawn when a plugin stops. A plugin that announces something in `start()` emits the opposite value in `stop()`.

## Example

Pick a property name that names the plugin or the feature, and give the value a type both sides share.

The plugin that announces itself:

```typescript
import { Plugin, ServerAPI } from '@signalk/server-api'

const PROPERTY = 'collisionAlerts'
interface CollisionAlertsProperty {
  evaluatesTargets: boolean
}

export default function (app: ServerAPI): Plugin {
  let announced = false
  function announce(running: boolean): void {
    if (running === announced) return
    const value: CollisionAlertsProperty = { evaluatesTargets: running }
    try {
      app.emitPropertyValue(PROPERTY, value)
      announced = running
    } catch (error) {
      // The server-wide cap is reached; a throw must not break start() or stop().
      app.error(`Could not announce ${PROPERTY}: ${String(error)}`)
    }
  }

  return {
    id: 'collision-alerts',
    name: 'Collision Alerts',
    schema: () => ({}),
    start: () => announce(true),
    stop: () => announce(false)
  }
}
```

The plugin that listens:

```typescript
let collisionAlertsRunning = false
let unsubscribe: (() => void) | undefined

function start(): void {
  unsubscribe = app.onPropertyValues(PROPERTY, (history) => {
    collisionAlertsRunning = evaluatesTargets(
      history[history.length - 1]?.value
    )
  })
}

function stop(): void {
  unsubscribe?.()
  unsubscribe = undefined
}

// Any plugin can emit under any name, so check the shape instead of casting.
function evaluatesTargets(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<CollisionAlertsProperty>).evaluatesTargets === true
  )
}
```

## Reviewing a plugin

Flag, in order:

1. Values emitted on a timer, per delta or per request: they fill the server-wide history until emitting throws.
2. A listener that reads the value once at start, or only `history[0]`, instead of reacting to the latest value on every call.
3. A plugin that announces something in `start()` but does not emit the opposite in `stop()`.
4. A missing unsubscribe in `stop()`, which leaves a callback from the stopped instance running after a restart.
5. Coordination through properties set on `app`, which other plugins cannot see.

The API reference is the `PropertyValuesEmitter` documentation in `packages/server-api/src/propertyvalues.ts`.
