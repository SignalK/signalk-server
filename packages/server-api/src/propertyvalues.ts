import Bacon from 'baconjs'
import { Bus } from './types'

export interface PropertyValue {
  timestamp: number // millis
  setter: string // plugin id, server
  name: string
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
