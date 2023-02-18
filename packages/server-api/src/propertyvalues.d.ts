import { Bus } from './types'
export interface PropertyValue {
  timestamp: number
  setter: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
}
export declare type PropertyValuesCallback = (
  propValuesHistory: PropertyValue[]
) => void
export default class PropertyValues {
  streams: {
    [key: string]: {
      bus: Bus
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream: any
    }
  }
  onPropertyValues(propName: string, cb: PropertyValuesCallback): () => void
  emitPropertyValue(pv: PropertyValue): void
  private getStreamTuple
}
