import Bacon from 'baconjs'
import { Bus } from './types'

/**
 * The _PropertyValues_ mechanism provides a means for passing configuration type values between different components running in the server process such as plugins and input connections.
 *
 * A plugin can both *emit* values and *listen* for values emitted by others.
 *
 * The difference between the _PropertyValues_ mechanism and _Event Emitters_ in NodeJs is that when  `onPropertyValues` is called, the `callback()` function will be invoked and passed an array containing all of the previous values for that _property name_, starting with the initial value of `undefined`. If no values have been emitted for that _property name_ the callback will be invoked with a value of `undefined`.
 * *
 * **PropertyValue** has the following structure:
 * ```typescript
 * interface PropertyValue {
 *   timestamp: number // millis
 *   setter: string // plugin id, server, provider id
 *   name: string
 *   value: any
 * }
 * ```
 *
 * _Note that the value can be also a function._
 *
 * This mechanism allows plugins to _offer_ extensions via _"Well Known Properties"_, for example
 * - additional [NMEA0183 sentence parsers for custom sentences](https://github.com/SignalK/nmea0183-signalk/pull/193) via `nmea0183sentenceParser`
 * - additional PGN definitions for propietary or custom PGNs
 *
 * Code handling incoming _PropertyValues_ should be fully reactive due to:
 * - Plugins being able to emit _PropertyValues_ when they activated and / or started
 * - There being no defined load / startup order for plugins / connections.
 *
 * So even if all plugins / connections emit during their startup, you cannot depend on a specific _PropertyValue_ being available. It may be present when your code starts or it may arrive after your code has started.
 *
 *
 * **Note: The _PropertyValues_ mechanism is not intended to be used for data passing on a regular basis, as the total history makes it a potential memory leak.**
 *
 * To safeguard against a component accidentally emitting regularly, via a fixed upper bound is enforced for the value array per _property name_. New values will be ignored if the upper bound is reached and are logged as errors.
 */
export interface PropertyValuesEmitter {
  /**
   * @category Property Values
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitPropertyValue(name: string, value: any): void

  /**
   * @category Property Values
   */
  onPropertyValues(name: string, cb: PropertyValuesCallback): Unsubscribe
}

export interface PropertyValue {
  timestamp: number // millis
  setter: string // plugin id, server
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
}

export type PropertyValuesCallback = (
  propValuesHistory: PropertyValue[]
) => void

interface StreamTuple {
  bus: Bus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: any
}

export class PropertyValues {
  private streams: {
    [key: string]: StreamTuple
  } = {}
  private count = 0

  static readonly MAX_VALUES_COUNT = 1000

  onPropertyValues(propName: string, cb: PropertyValuesCallback): () => void {
    return this.getStreamTuple(propName).stream.onValue(cb)
  }

  emitPropertyValue(pv: PropertyValue) {
    if (this.count >= PropertyValues.MAX_VALUES_COUNT) {
      throw new Error(
        `Max PropertyValues count ${
          PropertyValues.MAX_VALUES_COUNT
        } exceeded trying to emit ${JSON.stringify(pv)}`
      )
    }
    this.getStreamTuple(pv.name).bus.push(pv)
  }

  private getStreamTuple(propName: string) {
    let streamTuple = this.streams[propName]
    if (!streamTuple) {
      const bus = new Bacon.Bus()
      const stream = bus
        .scan([], (acc: PropertyValue[], v: PropertyValue) => {
          acc.push(v)
          this.count++
          return acc
        })
        .toProperty()
      streamTuple = {
        bus,
        stream
      }
      streamTuple.stream.subscribe(() => ({})) // start the stream eagerly
      streamTuple.bus.push(undefined)
      this.streams[propName] = streamTuple
    }
    return streamTuple
  }
}

/**
 * @inline
 */
type Unsubscribe = () => void
