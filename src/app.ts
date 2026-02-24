/* eslint-disable @typescript-eslint/no-explicit-any */
import { Delta, ServerAPI, SKVersion } from '@signalk/server-api'
import { FullSignalK } from '@signalk/signalk-schema'
import { EventEmitter } from 'node:events'

import { Config } from './config/config'
import DeltaCache from './deltacache'

export interface ServerApp extends ServerAPI {
  started: boolean
  interfaces: { [key: string]: any }
  intervals: NodeJS.Timeout[]
  providers: any[]
  pipedProviders: {
    start: () => any[]
    createPipedProvider: (config: any) => any
    stopProvider: (id: string) => void
    restartProvider: (id: string) => void
  }
  server: any
  redirectServer?: any
  deltaCache: DeltaCache
  getProviderStatus: () => any
  lastServerEvents: { [key: string]: any }
  clients: number
}

export interface SignalKMessageHub extends EventEmitter {
  signalk: FullSignalK
  handleMessage: (
    id: string,
    delta: Partial<Delta>,
    skVersion?: SKVersion
  ) => void
}

export interface WithConfig {
  config: Config
}
