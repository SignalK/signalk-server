import path from 'path'
import { IRouter, Request, Response } from 'express'
import {
  AlarmRaiseOptions,
  ALARM_STATE,
  Delta,
  hasValues,
  MessageLogEntry,
  MessageLogEntryInput,
  MessageLogStore,
  MessagePriority,
  NotificationsApi,
  Path,
  ServerAPI,
  Update
} from '@signalk/server-api'
import { WithSecurityStrategy } from '../../security'
import { SignalKMessageHub, WithConfig } from '../../app'
import { createDebug } from '../../debug'
import { SqliteMessageLogStore } from './store'
import { Responses } from '..'

const debug = createDebug('signalk-server:api:communications')

const COMMS_API_PATH = `/signalk/v2/api/communications`

export interface CommunicationsApplication
  extends
    WithSecurityStrategy,
    SignalKMessageHub,
    ServerAPI,
    IRouter,
    WithConfig {
  notificationApi: NotificationsApi
}

export class CommunicationsApi {
  private store!: MessageLogStore
  private notiToEntry: Map<string, string> = new Map()

  constructor(private app: CommunicationsApplication) {}

  async start() {
    const dbPath = path.join(this.app.config.configPath, 'communications.db')
    this.store = new SqliteMessageLogStore(dbPath)
    debug(`** Communications API started (db: ${dbPath}) **`)
    this.initApiEndpoints()
    this.app.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        try {
          this.mirrorNotificationDelta(delta)
        } catch (err) {
          debug(`mirror error: ${(err as Error).message}`)
        }
        next(delta)
      }
    )
    return Promise.resolve()
  }

  /** Test/shutdown helper. */
  stop() {
    if (this.store && 'close' in this.store) {
      ;(this.store as SqliteMessageLogStore).close()
    }
  }

  /** Exposed for tests. */
  getStore(): MessageLogStore {
    return this.store
  }

  private isActionable(priority: MessagePriority): boolean {
    return (
      priority === 'distress' || priority === 'urgency' || priority === 'safety'
    )
  }

  private alarmStateFor(priority: MessagePriority): ALARM_STATE {
    if (priority === 'distress') return ALARM_STATE.emergency
    if (priority === 'urgency') return ALARM_STATE.alarm
    return ALARM_STATE.warn // safety
  }

  /**
   * Single ingestion door for all message producers. Persists the entry and,
   * for actionable calls (distress/urgency/safety), raises a notification whose
   * ack/clear lifecycle is mirrored onto the entry's disposition. The entry is
   * always persisted even if raising fails — it is the regulatory record.
   */
  async logMessage(entry: MessageLogEntryInput): Promise<MessageLogEntry> {
    debug.enabled &&
      debug(`logMessage type=${entry.type} priority=${entry.priority}`)
    let toStore = entry
    if (this.isActionable(entry.priority) && !entry.notificationId) {
      try {
        const options: AlarmRaiseOptions = {
          state: this.alarmStateFor(entry.priority),
          message: entry.summary,
          path: `communications.${entry.type}` as Path,
          includePosition: true,
          includeCreatedAt: true
        }
        const notificationId = this.app.notificationApi.raise(options)
        toStore = { ...entry, notificationId }
      } catch (err) {
        debug(`notification raise failed: ${(err as Error).message}`)
      }
    }
    const stored = await this.store.append(toStore)
    if (stored.notificationId) {
      this.notiToEntry.set(stored.notificationId, stored.id)
    }
    return stored
  }

  /** Mirror notification ack/clear from a delta onto the linked entry's disposition. */
  private mirrorNotificationDelta(delta: Delta) {
    if (!delta?.updates) return
    for (const update of delta.updates as Update[]) {
      const notificationId = (update as { notificationId?: string })
        .notificationId
      if (!notificationId) continue
      const entryId = this.notiToEntry.get(notificationId)
      if (!entryId) continue
      if (!hasValues(update)) continue
      for (const v of update.values) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = v.value as any
        if (!value) continue
        const now = new Date().toISOString()
        // Coalesce ack + clear into a single patch: a value can carry both, and
        // two unawaited updates would each read the row before either write
        // lands, clobbering the other field back to null on the regulatory record.
        const patch: { acknowledgedAt?: string; clearedAt?: string } = {}
        if (value.status?.acknowledged === true) patch.acknowledgedAt = now
        if (value.state === ALARM_STATE.normal) patch.clearedAt = now
        if (!patch.acknowledgedAt && !patch.clearedAt) continue
        void this.store
          .update(entryId, patch)
          .catch((err) =>
            debug(`mirror update failed: ${(err as Error).message}`)
          )
        if (patch.clearedAt) this.notiToEntry.delete(notificationId)
      }
    }
  }

  private parseQuery(req: Request) {
    const q = req.query
    const num = (v: unknown) => {
      const n = Number(v)
      return isNaN(n) ? undefined : n
    }
    return {
      from: typeof q.from === 'string' ? q.from : undefined,
      to: typeof q.to === 'string' ? q.to : undefined,
      type: q.type === 'dsc' ? ('dsc' as const) : undefined,
      priority:
        q.priority === 'distress' ||
        q.priority === 'urgency' ||
        q.priority === 'safety' ||
        q.priority === 'routine'
          ? (q.priority as 'distress' | 'urgency' | 'safety' | 'routine')
          : undefined,
      sender: typeof q.sender === 'string' ? q.sender : undefined,
      limit: num(q.limit),
      order:
        q.order === 'asc'
          ? ('asc' as const)
          : q.order === 'desc'
            ? ('desc' as const)
            : undefined
    }
  }

  private initApiEndpoints() {
    debug(`** Initialise ${COMMS_API_PATH} endpoints. **`)

    // List / query messages (anonymous read under allow_readonly)
    this.app.get(
      `${COMMS_API_PATH}/messages`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        try {
          const entries = await this.store.query(this.parseQuery(req))
          res.status(200).json(entries)
        } catch (err) {
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: (err as Error).message
          })
        }
      }
    )

    // Single message
    this.app.get(
      `${COMMS_API_PATH}/messages/:id`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        try {
          const entry = await this.store.get(req.params.id)
          if (entry) {
            res.status(200).json(entry)
          } else {
            res.status(404).json(Responses.notFound)
          }
        } catch (err) {
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: (err as Error).message
          })
        }
      }
    )
  }
}
