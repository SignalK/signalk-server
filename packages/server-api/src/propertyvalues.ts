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
  streams: {
    [key: string]: {
      bus: Bus
      stream: any
    }
  } = {}

  onPropertyValues(propName: string, cb: PropertyValuesCallback): () => void {
    return this.getStreamTuple(propName).stream.onValue(cb)
  }

  emitPropertyValue(pv: PropertyValue) {
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
