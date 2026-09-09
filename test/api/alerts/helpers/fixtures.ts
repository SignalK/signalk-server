/**
 * Shared fixtures for the alerts suites.
 *
 * The Signal K identity types are opaque brands over string, so tests build
 * alerts and raise parameters through these builders and speak in plain
 * strings.
 */

import type { Context, Path, SourceRef } from '@signalk/server-api'
import type { CreateAlertParams } from '../../../../src/api/alerts/alertStateMachine'
import type {
  Alert,
  AlertTransition,
  HistoryEntry,
  HistoryEventType,
  HistoryQuery,
  IAlertStore
} from '../../../../src/api/alerts/types'

export const asPath = (value: string): Path => value as Path
export const asSourceRef = (value: string): SourceRef => value as SourceRef
export const asContext = (value: string): Context => value as Context

export const DEFAULT_PATH = 'test.alert'
export const DEFAULT_SOURCE = 'test-source'
export const DEFAULT_MESSAGE = 'Test alert'

export interface RaiseOverrides extends Partial<
  Omit<CreateAlertParams, 'path' | '$source' | 'context' | 'references'>
> {
  path?: string
  $source?: string
  context?: string
  references?: string[]
}

/**
 * Assert an optional alert is present and hand it back narrowed.
 */
export function presentAlert(alert: Alert | null | undefined): Alert {
  if (!alert) {
    throw new Error('Expected the alert to be present')
  }
  return alert
}

/**
 * Build raise parameters, defaulting every field a test does not care about.
 */
export function raiseParams(overrides: RaiseOverrides = {}): CreateAlertParams {
  const { path, $source, context, references, ...rest } = overrides
  return {
    path: asPath(path ?? DEFAULT_PATH),
    $source: asSourceRef($source ?? DEFAULT_SOURCE),
    priority: 'alarm',
    message: DEFAULT_MESSAGE,
    ...rest,
    ...(context === undefined ? {} : { context: asContext(context) }),
    ...(references === undefined ? {} : { references: references.map(asPath) })
  }
}

export interface StoredAlertOverrides extends Partial<
  Omit<Alert, 'path' | '$source' | 'context' | 'references'>
> {
  path?: string
  $source?: string
  context?: string
  references?: string[]
}

let storedAlertCounter = 0

/**
 * Build a whole Alert as persistence would hand it back after a restart.
 */
export function storedAlert(overrides: StoredAlertOverrides = {}): Alert {
  const { path, $source, context, references, ...rest } = overrides
  const now = new Date().toISOString()
  return {
    id: `stored-${String(++storedAlertCounter)}`,
    path: asPath(path ?? 'stored.alert'),
    $source: asSourceRef($source ?? 'stored-source'),
    priority: 'alarm',
    state: 'unacknowledged',
    condition: true,
    latching: false,
    silenced: false,
    message: 'Stored alert',
    raisedAt: now,
    stateChangedAt: now,
    sourceOnline: true,
    lastSourceUpdate: now,
    stale: false,
    ...rest,
    ...(context === undefined ? {} : { context: asContext(context) }),
    ...(references === undefined ? {} : { references: references.map(asPath) })
  }
}

/**
 * In-memory persistence that records what it was asked to commit.
 */
export class MockAlertStore implements IAlertStore {
  private alerts = new Map<string, Alert>()

  /** Every audit entry committed, in order */
  history: Omit<HistoryEntry, 'id'>[] = []
  /** Retention windows pruneHistory was called with */
  pruneCalledWith: number[] = []
  /** How many transitions were committed */
  commitCount = 0

  initialize(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }

  getAll(): Promise<Alert[]> {
    return Promise.resolve(Array.from(this.alerts.values()))
  }

  commit(transition: AlertTransition): Promise<void> {
    this.commitCount++
    if (transition.alert) {
      this.alerts.set(transition.alertId, { ...transition.alert })
    } else {
      this.alerts.delete(transition.alertId)
    }
    this.history.push(...transition.history)
    return Promise.resolve()
  }

  queryHistory(
    query: HistoryQuery
  ): Promise<{ entries: HistoryEntry[]; total: number }> {
    // Only `alertId` is implemented, because that is all any suite asks for.
    // Anything else is refused rather than quietly ignored: a filter this mock
    // dropped would let an assertion pass against the wrong entries.
    const unsupported = Object.keys(query).filter((key) => key !== 'alertId')
    if (unsupported.length > 0) {
      return Promise.reject(
        new Error(
          `MockAlertStore.queryHistory does not implement ${unsupported.join(', ')}.`
        )
      )
    }

    // Serves what commit recorded, newest first as AlertStore does, so an
    // assertion on audit order written against this holds against the real
    // store. An `alertId` of '' is a filter for an alert that cannot exist,
    // not an absent filter: `historyQuery` passes through any string.
    const matching = this.history
      .filter(
        (entry) =>
          query.alertId === undefined || entry.alertId === query.alertId
      )
      .map((entry, index) => ({
        ...entry,
        id: `mock-history-${String(index)}`
      }))
      .reverse()
    return Promise.resolve({ entries: matching, total: matching.length })
  }

  pruneHistory(olderThanDays: number): Promise<number> {
    this.pruneCalledWith.push(olderThanDays)
    return Promise.resolve(0)
  }

  getStoredAlert(id: string): Alert | undefined {
    return this.alerts.get(id)
  }

  getStoredAlertCount(): number {
    return this.alerts.size
  }

  prePopulate(alerts: Alert[]): void {
    for (const alert of alerts) {
      this.alerts.set(alert.id, { ...alert })
    }
  }

  eventTypes(): HistoryEventType[] {
    return this.history.map((e) => e.eventType)
  }

  entriesOfType(eventType: HistoryEventType): Omit<HistoryEntry, 'id'>[] {
    return this.history.filter((e) => e.eventType === eventType)
  }

  resetHistory(): void {
    this.history = []
  }
}

/**
 * Persistence whose commits reject, for exercising degraded-store behaviour.
 */
export class FailingAlertStore extends MockAlertStore {
  constructor(private readonly message = 'SQLite disk I/O error') {
    super()
  }

  commit(_transition: AlertTransition): Promise<void> {
    return Promise.reject(new Error(this.message))
  }
}

/**
 * Capture console.error / console.warn for the duration of a call.
 */
export async function captureConsole<T>(
  run: () => Promise<T> | T
): Promise<{ result: T; errors: unknown[][]; warnings: unknown[][] }> {
  const errors: unknown[][] = []
  const warnings: unknown[][] = []
  const originalError = console.error
  const originalWarn = console.warn
  console.error = (...args: unknown[]) => errors.push(args)
  console.warn = (...args: unknown[]) => warnings.push(args)
  try {
    const result = await run()
    return { result, errors, warnings }
  } finally {
    console.error = originalError
    console.warn = originalWarn
  }
}
