/* eslint-disable @typescript-eslint/no-explicit-any */
import { FeatureInfo, SKVersion } from '@signalk/server-api'
import { FullSignalK } from '@signalk/signalk-schema'
import { EventEmitter } from 'node:events'

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

export interface SignalKMessageHub extends EventEmitter {
  signalk: FullSignalK
  handleMessage: (id: string, Delta: any, skVersion?: SKVersion) => void
}

export interface WithConfig {
  config: Config
}

export interface SelfIdentity {
  selfType: string
  selfId: string
  selfContext: string
}

export interface WithFeatures {
  getFeatures: (enabledOnly?: boolean) => FeatureInfo
}
