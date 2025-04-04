/* eslint-disable @typescript-eslint/no-explicit-any */
import { WithContext } from '@signalk/server-api'
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
export type Unsubscribes = Array<() => void>

export type ContextMatcher = (_: WithContext) => boolean
