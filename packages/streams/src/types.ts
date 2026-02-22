import { EventEmitter } from 'events'
import { Duplex } from 'stream'

export type DebugLogger = ((...args: unknown[]) => void) & {
  enabled: boolean
}

export type CreateDebug = (namespace: string) => DebugLogger

export interface DeltaCache {
  setSourceDelta(key: string, delta: object): void
}

export interface StreamsApp extends EventEmitter {
  selfContext: string
  config: {
    configPath: string
    settings: {
      loggingDirectory?: string
      keepMostRecentLogsOnly?: boolean
      logCountToKeep?: number
    }
    getExternalHostname(): string
    getExternalPort(): number
  }
  isNmea2000OutAvailable: boolean
  deltaCache: DeltaCache
  setProviderStatus(providerId: string, message: string): void
  setProviderError(providerId: string, message: string): void
  handleMessage(id: string, delta: object): void
  emitPropertyValue(name: string, value: unknown): void
  signalk: EventEmitter
}

export interface BaseProviderOptions {
  app: StreamsApp
  providerId: string
  createDebug?: CreateDebug
  debug?: DebugLogger
}

export interface PipeableProvider {
  pipe(pipeTo: Duplex): Duplex
  end(): void
}
