/**
 * The `alerts.*` delta surface.
 *
 * Egress mirrors every lifecycle transition into the Signal K model, so a
 * subscriber sees alerts without polling. Ingress takes every `alerts.*` value
 * out of the delta chain: nothing reaches the model unmanaged, whatever it
 * claims about itself, because the manager is the only writer of alert state.
 */

import type {
  Context,
  Delta,
  Path,
  SourceRef,
  Timestamp,
  Update,
  Value
} from '@signalk/server-api'
import { hasValues, SKVersion } from '@signalk/server-api'
import type { AlertEvent, AlertManager } from './alertManager'
import { validateAlertPath } from './alertPath'
import { checkDescriptionBounds } from './description'
import { InvalidAlertDescriptionError, InvalidAlertPathError } from './errors'
import { ALERT_PRIORITIES, type Alert, type AlertPriority } from './types'

/** The provider id alert deltas are published under. */
export const ALERTS_PROVIDER_ID = 'alertsApi'

const ALERTS_PREFIX = 'alerts.'

const ALERTS_NAMESPACE = 'alerts'

/**
 * The most reports one source can have suppressed at once.
 *
 * A key names a source and a path, and a source is free to invent paths, so
 * the set has to forget something to stay bounded. The oldest key goes, which
 * costs one repeated warning for a source that has come back after a long
 * enough silence to be worth hearing from again.
 */
export const MAX_SUPPRESSED_REPORTS = 200

/**
 * Whether a delta value belongs to the alerts namespace.
 *
 * The bare `alerts` counts: it names no alert, so it is refused rather than
 * forwarded, and `src/deltacache.ts` exempts the namespace in both forms.
 */
function isAlertPath(path: string): boolean {
  return path === ALERTS_NAMESPACE || path.startsWith(ALERTS_PREFIX)
}

const KNOWN_PRIORITIES: ReadonlySet<string> = new Set(ALERT_PRIORITIES)

/**
 * Marks a delta this class published.
 *
 * A symbol cannot survive JSON, so no incoming delta can carry one and pass
 * itself off as our own output. Source labels are sender-controlled and would
 * not do.
 */
const OWN_EGRESS = Symbol('alerts.egress')

/** What the delta surface needs from the server. */
export interface DeltaHub {
  /** The context the server rewrites `vessels.self` to. */
  selfContext: string
  handleMessage(id: string, delta: Delta, skVersion?: SKVersion): void
  registerDeltaInputHandler(
    handler: (delta: Delta, next: (delta: Delta) => void) => void
  ): (() => void) | void
}

/** One `alerts.*` value taken out of the chain, with who sent it. */
interface IngressValue {
  alertPath: Path
  value: unknown
  $source: SourceRef
  context?: Context
}

export class AlertDeltas {
  private listener?: (event: AlertEvent) => void
  private unregister?: () => void
  private stopped = false
  private queues = new Map<string, Promise<void>>()
  private warned = new Set<string>()

  constructor(
    private hub: DeltaHub,
    private manager: AlertManager
  ) {}

  /**
   * Publish the active set, then mirror every transition and take over
   * `alerts.*` ingress.
   */
  start(): void {
    this.listener = (event: AlertEvent) => this.publish(event.alert)
    this.manager.on('alert', this.listener)
    this.unregister =
      this.hub.registerDeltaInputHandler((delta, next) => {
        this.onDelta(delta, next)
      }) ?? undefined

    // A restored alert has no transition to announce it, so a subscriber that
    // connects after a restart would otherwise see an empty model.
    for (const alert of this.manager.getAlerts()) {
      this.publish(alert)
    }
  }

  /** Stop mirroring and let the work already handed off finish. */
  async stop(): Promise<void> {
    this.stopped = true
    // A restart builds a new AlertDeltas, so leaving this registered would
    // stack a dead handler on both delta chains for every restart.
    this.unregister?.()
    this.unregister = undefined
    if (this.listener) {
      this.manager.off('alert', this.listener)
      this.listener = undefined
    }
    await this.settled()
  }

  /** Resolves once every value taken out of the chain has been applied. */
  async settled(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.all(Array.from(this.queues.values()))
    }
  }

  /** A context of our own vessel, expressed the way the other surfaces do. */
  private ownContext(context?: Context): Context | undefined {
    if (context === undefined || context === this.hub.selfContext) {
      return undefined
    }
    return context
  }

  private publish(alert: Alert): void {
    const delta = {
      context: alert.context ?? ('vessels.self' as Context),
      updates: [
        {
          $source: ALERTS_PROVIDER_ID as SourceRef,
          timestamp: alert.stateChangedAt as Timestamp,
          values: [
            {
              path: `${ALERTS_PREFIX}${alert.path}` as Path,
              value: alert as unknown as never
            }
          ]
        }
      ]
    } as Delta
    Object.defineProperty(delta, OWN_EGRESS, { value: true })
    this.hub.handleMessage(ALERTS_PROVIDER_ID, delta, SKVersion.v1)
  }

  /**
   * Recognize and extract, nothing more: the manager mutation and its store
   * write are handed off, because this runs inside delta dispatch and taxes
   * every delta in the system.
   */
  private onDelta(delta: Delta, next: (delta: Delta) => void): void {
    if (this.stopped || OWN_EGRESS in delta || !carriesAlerts(delta)) {
      next(delta)
      return
    }

    const taken: IngressValue[] = []
    const updates: Update[] = []
    for (const update of delta.updates ?? []) {
      if (!hasValues(update)) {
        updates.push(update)
        continue
      }
      const kept = update.values.filter((value) => {
        if (!isAlertPath(value.path)) {
          return true
        }
        taken.push({
          alertPath: value.path.slice(ALERTS_PREFIX.length) as Path,
          value: value.value,
          $source: (update.$source ?? 'unknown') as SourceRef,
          // The server rewrites `vessels.self` to the concrete self context
          // before this handler runs, while REST and plugin raises carry no
          // context at all. Dropping our own context here is what keeps one
          // condition on one path a single alert whichever surface reports it.
          context: this.ownContext(delta.context)
        })
        return false
      })
      if (kept.length > 0) {
        updates.push({ ...update, values: kept })
      }
    }

    if (updates.length > 0) {
      next({ ...delta, updates })
    }

    for (const value of taken) {
      this.enqueue(value)
    }
  }

  /**
   * Apply values for one path in the order they arrived, and keep the work
   * awaitable so a stop does not abandon it half-applied.
   *
   * Ordering is not free today only because the manager registers an alert
   * before its first await: a clear queued behind a raise would find the alert
   * either way. The chain keeps that true if the manager ever awaits earlier.
   */
  private enqueue(value: IngressValue): void {
    const key = `${value.context ?? ''}:${value.alertPath}`
    const previous = this.queues.get(key) ?? Promise.resolve()
    const applied = previous
      .then(() => this.apply(value))
      .catch((error: unknown) => {
        console.error('Alert delta ingress failed:', error)
      })
      .finally(() => {
        if (this.queues.get(key) === applied) {
          this.queues.delete(key)
        }
      })
    this.queues.set(key, applied)
  }

  /**
   * Report a rejected value once per source and reason.
   *
   * A device that emits an unusable alert value emits it as often as it emits
   * anything, and one warning per delta would bury every other log line.
   */
  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) {
      return
    }
    if (this.warned.size >= MAX_SUPPRESSED_REPORTS) {
      const oldest = this.warned.values().next().value
      if (oldest !== undefined) {
        this.warned.delete(oldest)
      }
    }
    this.warned.add(key)
    console.warn(`${message} Further reports from this source are suppressed.`)
  }

  private async apply(value: IngressValue): Promise<void> {
    let alertPath: Path
    try {
      alertPath = validateAlertPath(value.alertPath)
    } catch (error) {
      if (!(error instanceof InvalidAlertPathError)) {
        throw error
      }
      this.warnOnce(
        `path:${value.$source}`,
        `Ignoring an alerts delta from ${value.$source}: ${error.message}`
      )
      return
    }

    const existing = this.manager.getAlertByPath(alertPath, value.context)

    if (isClear(value.value)) {
      if (existing) {
        await this.manager.clearCondition(existing.id, value.$source)
        // An alert held for acknowledgment outlives its condition, and its
        // source keeps saying so. That is still a heartbeat.
        if (this.manager.getAlert(existing.id)) {
          this.manager.noteSourceUpdate(existing.id)
        }
      }
      return
    }

    const described = describedAlert(value.value)
    if (described) {
      try {
        checkDescriptionBounds(described)
      } catch (error) {
        if (!(error instanceof InvalidAlertDescriptionError)) {
          throw error
        }
        this.warnOnce(
          `bounds:${value.$source}:${alertPath}`,
          `Ignoring an alerts delta at ${alertPath} from ${value.$source}: ` +
            error.message
        )
        return
      }
    }
    if (!described) {
      this.warnOnce(
        `described:${value.$source}:${alertPath}`,
        `Ignoring an alerts delta at ${alertPath} from ${value.$source}: ` +
          'it carries no priority and message.'
      )
      return
    }

    // A source that re-emits an unchanged alert is saying "still here", not
    // "it happened again". Routing that through raiseAlert would reactivate an
    // acknowledged alert and strip its silencing on every heartbeat, so the
    // operator could never put the alarm to rest while the condition lasts.
    // Only what the operator reads — priority and message — counts as a
    // change; data that moves with every reading must not re-alert anyone.
    if (
      existing &&
      existing.priority === described.priority &&
      existing.message === described.message
    ) {
      // Still the same alert, but the detail around it can have moved, so the
      // model and the store carry what the source last said.
      await this.manager.updateDescription(existing.id, {
        $source: value.$source,
        group: described.group,
        latching: described.latching,
        references: described.references,
        data: described.data
      })
      // A REST or plugin clear can land while that await is out, and a
      // liveness timer for an alert that is gone survives until it fires.
      if (this.manager.getAlert(existing.id)) {
        this.manager.noteSourceUpdate(existing.id)
      }
      return
    }

    const alert = await this.manager.raiseAlert({
      path: alertPath,
      $source: value.$source,
      ...described,
      ...(value.context === undefined ? {} : { context: value.context })
    })

    // Delta sources re-emit, so their silence means something. This is the
    // only surface with that convention.
    if (this.manager.getAlert(alert.id)) {
      this.manager.noteSourceUpdate(alert.id)
    }
  }
}

/** Whether any value in the delta is an alert value. */
function carriesAlerts(delta: Delta): boolean {
  for (const update of delta.updates ?? []) {
    if (!hasValues(update)) {
      continue
    }
    for (const value of update.values) {
      if (isAlertPath(value.path)) {
        return true
      }
    }
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A null value and a terminal state both mean the condition is over. */
function isClear(value: unknown): boolean {
  return value === null || (isRecord(value) && value.state === 'normal')
}

/**
 * The descriptive fields of an incoming value. Lifecycle belongs to the
 * manager, so a device claiming a state or an id is describing nothing.
 */
function describedAlert(value: unknown):
  | {
      priority: AlertPriority
      message: string
      group?: string
      latching?: boolean
      references?: Path[]
      data?: Record<string, Value>
    }
  | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const { priority, message } = value
  if (
    typeof priority !== 'string' ||
    !KNOWN_PRIORITIES.has(priority) ||
    typeof message !== 'string' ||
    message.length === 0
  ) {
    return undefined
  }

  let references: Path[] | undefined
  if (Array.isArray(value.references)) {
    try {
      references = value.references.map(validateAlertPath)
    } catch (error) {
      if (!(error instanceof InvalidAlertPathError)) {
        throw error
      }
      references = undefined
    }
  }

  return {
    priority: priority as AlertPriority,
    message,
    ...(typeof value.group === 'string' ? { group: value.group } : {}),
    ...(typeof value.latching === 'boolean'
      ? { latching: value.latching }
      : {}),
    ...(references === undefined ? {} : { references }),
    ...(isRecord(value.data)
      ? { data: value.data as Record<string, Value> }
      : {})
  }
}
