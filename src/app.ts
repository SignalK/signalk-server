import { FullSignalK } from '@signalk/signalk-schema'
import { EventEmitter } from 'events'
import { Config } from './config/config'
import DeltaCache from './deltacache'
import { SecurityStrategy } from './security'

export interface ServerApp {
  started: boolean
  interfaces: { [key: string]: any }
  intervals: NodeJS.Timeout[]
  providers: any[]
  server: any
  redirectServer?: any
  deltaCache: DeltaCache
  getProviderStatus: () => any
  lastServerEvents: { [key: string]: any }
  clients: number
}

export interface WithSignalK {
  signalk: FullSignalK
  handleMessage: (id: string, data: any) => void
}

export interface SignalKMessageHub extends EventEmitter, WithSignalK {}

export interface WithConfig {
  config: Config
}

export interface WithSecurityStrategy {
  securityStrategy: SecurityStrategy
}

export interface SelfIdentity {
  selfType: string
  selfId: string
  selfContext: string
}
