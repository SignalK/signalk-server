/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerAPI, WithContext, FullSignalK } from '@signalk/server-api'
import { SecurityStrategy } from './security'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
  /**
   * Stable identifier for the server process. Regenerated each boot so
   * clients reconnecting after a restart can detect that server-side
   * state (delta cache, source registry) has been wiped and drop their
   * own mirrors of paths the new boot may never re-publish.
   */
  bootId: string
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
  stop?: () => void
  mdns?: MdnsAdvertisement
}

export interface MdnsAdvertisement {
  name: string
  type: string
  port: number
}

export type ContextMatcher = (_: WithContext) => boolean
