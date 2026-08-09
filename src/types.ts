/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerAPI, WithContext, FullSignalK } from '@signalk/server-api'
import { SecurityStrategy } from './security'
import type { StalenessEnforcer } from './staleness'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
  /**
   * Unique identifier for this server-process start. A fresh value each
   * time the server starts lets reconnecting clients detect that
   * server-side state (delta cache, source registry) has been wiped and
   * drop their own mirrors of paths the new instance may never re-publish.
   */
  serverStartId: string
}

export type ICallback<T> = (error?: Error | null, result?: T) => void

export interface SignalKServer extends ServerAPI {
  config: { defaults: any }
  getHello: () => HelloMessage
  signalk: FullSignalK
  selfId: string
  selfType: string
  securityStrategy: SecurityStrategy
  stalenessEnforcer?: StalenessEnforcer
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
