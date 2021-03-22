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

export class PropertyValues {
  private streams: {
    [key: string]: {
      bus: Bus
      stream: any
    }
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
      streamTuple = {
        bus: new Bacon.Bus(),
        stream: null
      }
      streamTuple.stream = streamTuple.bus
        .scan([], (acc: PropertyValue[], v: PropertyValue) => {
          acc.push(v)
          this.count++
          return acc
        })
        .toProperty()
      streamTuple.stream.subscribe(() => ({})) // start the stream eagerly
      streamTuple.bus.push(undefined)
      this.streams[propName] = streamTuple
    }
    return streamTuple
  }
}
