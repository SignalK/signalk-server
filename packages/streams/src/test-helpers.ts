import { EventEmitter } from 'events'
import type { CreateDebug, DebugLogger, DeltaCache } from './types'

interface MockAppOptions {
  selfContext?: string
  configPath?: string
  loggingDirectory?: string
  keepMostRecentLogsOnly?: boolean
  logCountToKeep?: number
  isNmea2000OutAvailable?: boolean
}

interface MockApp extends EventEmitter {
  selfContext: string
  isNmea2000OutAvailable: boolean
  deltaCache: DeltaCache
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
  setProviderStatus(id: string, msg: string): void
  setProviderError(id: string, msg: string): void
  handleMessage(id: string, delta: object): void
  emitPropertyValue(name: string, value: unknown): void
  signalk: EventEmitter
  providerStatuses: Array<{ id: string; msg: string }>
  providerErrors: Array<{ id: string; msg: string }>
  handledMessages: Array<{ id: string; delta: object }>
  propertyValues: Array<{ name: string; value: unknown }>
}

export function createMockApp(options: MockAppOptions = {}): MockApp {
  const emitter = new EventEmitter()
  const signalk = new EventEmitter()

  const providerStatuses: Array<{ id: string; msg: string }> = []
  const providerErrors: Array<{ id: string; msg: string }> = []
  const handledMessages: Array<{ id: string; delta: object }> = []
  const propertyValues: Array<{ name: string; value: unknown }> = []
  const sourceDeltaStore: Record<string, object> = {}

  const app = Object.assign(emitter, {
    selfContext: options.selfContext ?? 'vessels.urn:mrn:imo:mmsi:000000000',
    isNmea2000OutAvailable: options.isNmea2000OutAvailable ?? false,
    deltaCache: {
      setSourceDelta(key: string, delta: object): void {
        sourceDeltaStore[key] = delta
      }
    },
    config: {
      configPath: options.configPath ?? '/tmp/test-config',
      settings: {
        loggingDirectory: options.loggingDirectory,
        keepMostRecentLogsOnly: options.keepMostRecentLogsOnly,
        logCountToKeep: options.logCountToKeep
      },
      getExternalHostname(): string {
        return 'localhost'
      },
      getExternalPort(): number {
        return 3000
      }
    },
    setProviderStatus(id: string, msg: string): void {
      providerStatuses.push({ id, msg })
    },
    setProviderError(id: string, msg: string): void {
      providerErrors.push({ id, msg })
    },
    handleMessage(id: string, delta: object): void {
      handledMessages.push({ id, delta })
    },
    emitPropertyValue(name: string, value: unknown): void {
      propertyValues.push({ name, value })
    },
    signalk,
    providerStatuses,
    providerErrors,
    handledMessages,
    propertyValues
  }) as MockApp

  return app
}

export function collectStreamOutput<T = unknown>(
  stream: NodeJS.ReadableStream
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = []
    stream.on('data', (chunk: T) => results.push(chunk))
    stream.on('end', () => resolve(results))
    stream.on('error', reject)
  })
}

export function noopDebug(): DebugLogger {
  const fn = ((..._args: unknown[]): void => {}) as DebugLogger
  fn.enabled = false
  return fn
}

export function createDebugStub(): CreateDebug {
  return () => noopDebug()
}
