/* eslint-disable @typescript-eslint/no-explicit-any */
import { FullSignalK } from '@signalk/signalk-schema'
import { SecurityStrategy } from './security'
import SubscriptionManager from './subscriptionmanager'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

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
  getAvailablePaths: () => string[]
}

export type ICallback<T> = (error?: Error | null, result?: T) => void

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
// eslint-disable-next-line @typescript-eslint/no-empty-interface
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

export type Brand<K, T> = K & { __brand: T }

export type SourceRef = Brand<string, 'sourceRef'>
export type Source = Brand<string, 'source'>
export type Delta = any
export type Path = Brand<string, 'path'>
export type Context = Brand<string, 'context'>
export type Value = object | number | string | null

export enum SKVersion {
  v1 = 'v1',
  v2 = 'v2'
}
