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
- `app.onPropertyValues(name, cb)` calls `cb` at once with the whole history of `name`, and again on every later emit. The history always starts with `undefined`, so the first call may be `[undefined]`. For a state one plugin owns (like the example below) the last element is the current value. For a name several plugins contribute to, like `nmea0183sentenceParser`, every element counts: walk the whole history, skipping the `undefined`. It returns an unsubscribe function.
- There is no plugin start order. A value may already be there when a listener subscribes or arrive later, so the listener has to handle both, and every change after that.
- The history is never trimmed. One count covers all names: each name's initial `undefined` and every emitted value. The initial `undefined` is added the first time a name is emitted or subscribed to, so `onPropertyValues` on a name nobody has used yet also takes one count, without any cap check. `emitPropertyValue` throws once the count has reached 1000 (it checks before emitting, so the first emit under a new name at 999 still goes through and takes it to 1001). Emit on changes only, never on a timer or per delta.
- Nothing is withdrawn when a plugin stops. A plugin that announces a state it alone owns in `start()` emits the opposite state in `stop()`, as in the example below. That is best effort: once the cap is reached the emit throws and listeners keep the old state, so a listener must cope with a stale announcement (for collision alarms, a duplicate alarm is the safer failure than none). A later value cannot take back a contribution to a name several plugins share, such as a parser under `nmea0183sentenceParser`; a stopped plugin's contribution stays until the server restarts, unless the name defines its own way to retract one.

## Example

Pick a property name that names the plugin or the feature, and put the name, the value type and a shape check in a module both plugins use (or copy them into both):

```typescript
// collision-alerts-property.ts
export const PROPERTY = 'collisionAlerts'

export interface CollisionAlertsProperty {
  evaluatesTargets: boolean
}

// Any plugin can emit under any name, so check the shape instead of casting.
export function evaluatesTargets(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<CollisionAlertsProperty>).evaluatesTargets === true
  )
}
```

The plugin that announces itself:

```typescript
import { Plugin, ServerAPI } from '@signalk/server-api'
import {
  CollisionAlertsProperty,
  PROPERTY
} from './collision-alerts-property.js'

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
      // Listeners keep the previous state, so they must tolerate a stale one.
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
import { Plugin, ServerAPI } from '@signalk/server-api'
import { evaluatesTargets, PROPERTY } from './collision-alerts-property.js'

export default function (app: ServerAPI): Plugin {
  let collisionAlertsRunning = false
  let unsubscribe: (() => void) | undefined

  return {
    id: 'radar-alarms',
    name: 'Radar alarms',
    schema: () => ({}),
    start: () => {
      unsubscribe = app.onPropertyValues(PROPERTY, (history) => {
        collisionAlertsRunning = evaluatesTargets(
          history[history.length - 1]?.value
        )
      })
    },
    stop: () => {
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
}
```

## Reviewing a plugin

Flag, in order:

1. Values emitted on a timer, per delta or per request: they fill the server-wide history until emitting throws.
2. A listener that reads the value once at start, or only `history[0]`, instead of reacting on every call; or one that takes only the last element of a name several plugins contribute to.
3. A plugin that announces a state it owns in `start()` but does not emit the opposite in `stop()`, or lets that emit throw out of `stop()`.
4. A missing unsubscribe in `stop()`, which leaves a callback from the stopped instance running after a restart.
5. Coordination through properties set on `app`, which other plugins cannot see.

The API reference is the `PropertyValuesEmitter` documentation in `packages/server-api/src/propertyvalues.ts`.
