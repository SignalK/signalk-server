/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerAPI, WithContext } from '@signalk/server-api'
import { FullSignalK } from '@signalk/signalk-schema'
import { SecurityStrategy } from './security'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

export type ICallback<T> = (error?: Error | null, result?: T) => void

export interface SignalKServer extends ServerAPI {
  config: { defaults: any }
  getHello: () => HelloMessage
  signalk: FullSignalK
  selfId: string
  selfType: string
  securityStrategy: SecurityStrategy
}

export class Interface {
  start?: () => void
  stop?: () => void | Promise<void>
  mdns?: MdnsAdvertisement
}

export interface MdnsAdvertisement {
  name: string
  type: string
  port: number
}

export type ContextMatcher = (_: WithContext) => boolean
