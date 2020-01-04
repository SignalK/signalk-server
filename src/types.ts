import { EventEmitter } from 'events'
import SubscriptionManager from './subscriptionmanager'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

export interface SignalKServer {
  handleMessage: (providerId: string, message: any) => void
  getHello: () => HelloMessage
  signalk: EventEmitter
  subscriptionmanager: SubscriptionManager
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

//move to subscriptionmanage.ts when all SubscriptionManager use is in ts
export interface Unsubscribes extends Array<() => void> {}

