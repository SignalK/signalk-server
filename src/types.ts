import { FullSignalK } from '@signalk/signalk-schema'
import SubscriptionManager from './subscriptionmanager'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

export interface SecurityStrategy {
  isDummy: () => boolean
  allowReadOnly: () => boolean
  shouldFilterDeltas: () => boolean
  filterReadDelta: (user: string, delta: any) => any
}

//inferred, to be improved
export interface StreamBundle {
  keys: { onValue: (arg0: (key: any) => void) => void }
  getBus: (
    arg0: any
  ) => { (): any; new (): any; onValue: { (arg0: any): void; new (): any } }
}


export interface SignalKServer {
  config: { defaults: any }
  handleMessage: (providerId: string, message: any) => void
  getHello: () => HelloMessage
  signalk: FullSignalK
  selfId: string
  selfType: string
  subscriptionmanager: SubscriptionManager
  securityStrategy: SecurityStrategy
}

export class Interface {
  start?: () => void
  stop?: () => void
  mdns?: MdnsAdvertisement
}

export interface MdnsAdvertisement {
  name: string
  type: string
  port: number
}

// move to subscriptionmanage.ts when all SubscriptionManager use is in ts
export interface Unsubscribes extends Array<() => void> {}

export interface NormalizedDelta {
  $source: SourceRef
  source: Source
  path: Path
  context: Context
  value: Value
  isMeta: boolean
}

export type SourceRef = string
export type Source = any
export type Delta = any
export type Path = string
export type Context = string
export type Value = object | number | string | null
