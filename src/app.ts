import { FullSignalK } from '@signalk/signalk-schema'
import { Config } from './config/config'
import DeltaCache from './deltacache'

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

export interface SignalKMessageHub {
  emit: any
  on: any
  signalk: FullSignalK
  handleMessage: (id: string, data: any) => void
}

export interface WithConfig {
  config: Config
}

export interface SelfIdentity {
  selfType: string
  selfId: string
  selfContext: string
}
