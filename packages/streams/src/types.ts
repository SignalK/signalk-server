export type DebugLogger = ((...args: unknown[]) => void) & {
  enabled: boolean
}

export type CreateDebug = (namespace: string) => DebugLogger

export interface DeltaCache {
  setSourceDelta(key: string, delta: object): void
  removeSource?(sourceRef: string, prefixes?: readonly string[]): void
}
