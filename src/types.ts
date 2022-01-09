import { FullSignalK } from '@signalk/signalk-schema'
<<<<<<< HEAD
import { SecurityStrategy } from './security'
=======
import { Request } from 'express'
>>>>>>> fix: SecurityStrategy.shouldAllowPut must have Request
import SubscriptionManager from './subscriptionmanager'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

<<<<<<< HEAD
=======
export interface SecurityStrategy {
  isDummy: () => boolean
  allowReadOnly: () => boolean
  shouldFilterDeltas: () => boolean
  filterReadDelta: (user: any, delta: any) => any
  shouldAllowPut: (
    req: Request,
    context: string,
    source: any,
    path: string
  ) => boolean
}

>>>>>>> refactor: tweak types
export interface Bus {
  onValue: (callback: (value: any) => any) => () => void
  push: (v: any) => void
  scan: (
    a: any,
    f: (a: any, b: any) => any | void
  ) => {
    toProperty: () => () => void
  }
}
// inferred, to be improved
export interface StreamBundle {
  keys: { onValue: (arg0: (key: any) => void) => void }
  getBus: (path: string) => Bus
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

export interface WithContext {
  context: Context
}

export type ContextMatcher = (_: WithContext) => boolean

export interface NormalizedDelta extends WithContext {
  $source: SourceRef
  source: Source
  path: Path
  value: Value
  isMeta: boolean
}

export type SourceRef = string
export type Source = any
export type Delta = any
export type Path = string
export type Context = string
export type Value = object | number | string | null
export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}
