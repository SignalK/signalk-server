import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:alerts')

import * as path from 'path'
import { IRouter, Request, Response } from 'express'

/** The authenticated principal the security middleware attaches. */
interface SkRequest extends Request {
  skPrincipal?: { identifier: string }
}
import { SignalKMessageHub, WithConfig } from '../../app'
import { SERVERSTATEDIRNAME } from '../../serverstate/store'
import { Responses } from '..'
import { AlertManager, type AlertManagerConfig } from './alertManager'
import { AlertStore } from './alertStore'
import { AlertDeltas, type DeltaHub } from './deltas'
import { validateAlertPath } from './alertPath'
import { checkDescriptionBounds } from './description'
import { sortForDisplay } from './ordering'
import {
  AlertLimitReachedError,
  AlertNotFoundError,
  InvalidAlertDescriptionError,
  InvalidAlertPathError,
  InvalidAlertPriorityError,
  InvalidEscalationError,
  InvalidSilenceDurationError
} from './errors'
import {
  ALERT_PRIORITIES,
  type Alert,
  ALERT_STATES,
  HISTORY_EVENT_TYPES,
  type AlertFilter,
  type AlertPriority,
  type AlertState,
  type HistoryEventType,
  type HistoryQuery
} from './types'
import type { CreateAlertParams } from './alertStateMachine'
import type { Context, Path, SourceRef } from '@signalk/server-api'

export interface AlertsApplication
  extends IRouter, WithConfig, SignalKMessageHub {}

const SIGNALK_API_PATH = `/signalk/v2/api`
const ALERTS_API_PATH = `${SIGNALK_API_PATH}/alerts`

/** The alerts surface `startApis` attaches to the app. */
export interface WithAlertsApi {
  alertsApi?: Pick<AlertsApi, 'stop'>
}

/** Where the alert database lives, under the server's own state directory. */
const ALERTS_DB = ['alerts', 'alerts.db']

/**
 * Source label on an alert raised through REST. The operator's own request is
 * the source; a device that raises its own alerts names itself.
 */
const REST_SOURCE = 'alerts-api' as SourceRef

/**
 * Lifecycle settings until the server exposes them (see the settings unit).
 * The numbers are the proposal's: escalate an unacknowledged warning after
 * five minutes, silence for two minutes, thirty seconds for an emergency.
 */
const DEFAULT_CONFIG: AlertManagerConfig = {
  escalation: { enabled: true, timeoutSeconds: 300 },
  silencing: {
    defaultMaxSilenceSeconds: 120,
    emergencyMaxSilenceSeconds: 30
  }
}

const serverError = {
  state: 'FAILED',
  statusCode: 500,
  message: 'Internal server error.'
}

/**
 * The alerts REST surface.
 *
 * Owns the manager and its store for the life of the server: constructed
 * unconditionally, because an alarm system that can be switched off is not one.
 */
export class AlertsApi {
  private store?: AlertStore
  private manager?: AlertManager
  private deltas?: AlertDeltas

  constructor(
    private app: AlertsApplication,
    private config: Partial<AlertManagerConfig> = {}
  ) {}

  async start(): Promise<void> {
    const dbPath = path.join(
      this.app.config.configPath,
      SERVERSTATEDIRNAME,
      ...ALERTS_DB
    )
    const store = new AlertStore(dbPath)
    await store.initialize()
    const manager = new AlertManager(
      { ...DEFAULT_CONFIG, ...this.config },
      undefined,
      store
    )
    await manager.loadFromStore()

    this.store = store
    this.manager = manager
    this.initAlertRoutes()

    // Started last: the active set is published as the mirror's first state,
    // which needs the store already loaded.
    this.deltas = new AlertDeltas(this.app as unknown as DeltaHub, manager)
    this.deltas.start()
  }

  async stop(): Promise<void> {
    await this.deltas?.stop()
    this.deltas = undefined
    this.manager?.stop()
    await this.store?.close()
    this.manager = undefined
    this.store = undefined
  }

  /**
   * Raise an alert on behalf of a plugin, or update the one already on that
   * path. The path is validated here as at every other ingress surface.
   */
  raise(request: Record<string, unknown>, $source: SourceRef): Promise<Alert> {
    return this.requireManager().raiseAlert(this.raiseParams(request, $source))
  }

  acknowledge(alertId: string, userId?: string) {
    return this.requireManager().acknowledgeAlert(alertId, userId)
  }

  silence(alertId: string, durationSeconds?: number) {
    return this.requireManager().silenceAlert(
      alertId,
      durationSeconds === undefined ? undefined : durationSeconds * 1000
    )
  }

  silenceAll() {
    return this.requireManager().silenceAll()
  }

  escalate(alertId: string, priority: AlertPriority) {
    // A plugin is JavaScript, so the parameter type is not a check. An
    // unknown priority would persist and then refuse to load on the next
    // start, taking the server down with it.
    if (!this.isPriority(priority)) {
      throw new InvalidAlertPriorityError(String(priority))
    }
    return this.requireManager().escalateAlert(alertId, priority)
  }

  clearCondition(alertId: string, clearedBy?: SourceRef) {
    return this.requireManager().clearCondition(alertId, clearedBy)
  }

  list(filter?: AlertFilter): Alert[] {
    return sortForDisplay(this.requireManager().getAlerts(filter))
  }

  get(alertId: string): Alert | null {
    return this.requireManager().getAlert(alertId)
  }

  getByPath(alertPath: Path, context?: Context): Alert | null {
    return this.requireManager().getAlertByPath(alertPath, context)
  }

  history(query: HistoryQuery = {}) {
    return this.requireStore().queryHistory(query)
  }

  /** Resolves once every alert delta taken out of the chain is applied. */
  async ingressSettled(): Promise<void> {
    await this.deltas?.settled()
  }

  private initAlertRoutes() {
    // Static routes first: Express matches in registration order, and
    // /status would otherwise arrive as an alert id.
    this.app.get(`${ALERTS_API_PATH}/status`, (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      res.status(200).json({
        store: { degraded: this.requireManager().isStoreDegraded() }
      })
    })

    this.app.get(
      `${ALERTS_API_PATH}/history`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        let query: HistoryQuery
        try {
          query = this.historyQuery(req.query)
        } catch (error) {
          return this.fail(res, error)
        }
        try {
          res.status(200).json(await this.requireStore().queryHistory(query))
        } catch (error) {
          this.fail(res, error)
        }
      }
    )

    this.app.get(`${ALERTS_API_PATH}`, (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      let filter: AlertFilter
      try {
        filter = this.listFilter(req.query)
      } catch (error) {
        return this.fail(res, error)
      }
      res
        .status(200)
        .json(sortForDisplay(this.requireManager().getAlerts(filter)))
    })

    this.app.post(`${ALERTS_API_PATH}`, async (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      let params: CreateAlertParams
      try {
        params = this.raiseParams(req.body as Record<string, unknown>)
      } catch (error) {
        return this.fail(res, error)
      }
      try {
        res.status(201).json(await this.requireManager().raiseAlert(params))
      } catch (error) {
        this.fail(res, error)
      }
    })

    this.app.post(
      `${ALERTS_API_PATH}/silence-all`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        try {
          await this.requireManager().silenceAll()
          res.status(200).json(Responses.ok)
        } catch (error) {
          this.fail(res, error)
        }
      }
    )

    this.app.get(`${ALERTS_API_PATH}/:id`, (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      const alert = this.requireManager().getAlert(req.params.id)
      if (!alert) {
        return this.fail(res, new AlertNotFoundError(req.params.id))
      }
      res.status(200).json(alert)
    })

    this.app.post(
      `${ALERTS_API_PATH}/:id/acknowledge`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        try {
          res
            .status(200)
            .json(
              await this.requireManager().acknowledgeAlert(
                req.params.id,
                (req as SkRequest).skPrincipal?.identifier
              )
            )
        } catch (error) {
          this.fail(res, error)
        }
      }
    )

    this.app.post(
      `${ALERTS_API_PATH}/:id/silence`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        const body = req.body as Record<string, unknown>
        let durationMs: number | undefined
        if (body.duration !== undefined) {
          if (typeof body.duration !== 'number' || !(body.duration > 0)) {
            return this.badRequest(
              res,
              'duration must be a positive number of seconds'
            )
          }
          durationMs = body.duration * 1000
        }
        try {
          res
            .status(200)
            .json(
              await this.requireManager().silenceAlert(
                req.params.id,
                durationMs
              )
            )
        } catch (error) {
          this.fail(res, error)
        }
      }
    )

    this.app.post(
      `${ALERTS_API_PATH}/:id/escalate`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        const body = req.body as Record<string, unknown>
        if (!this.isPriority(body.priority)) {
          return this.badRequest(
            res,
            `priority must be one of ${ALERT_PRIORITIES.join(', ')}`
          )
        }
        try {
          res
            .status(200)
            .json(
              await this.requireManager().escalateAlert(
                req.params.id,
                body.priority
              )
            )
        } catch (error) {
          this.fail(res, error)
        }
      }
    )

    this.app.put(
      `${ALERTS_API_PATH}/:id/condition`,
      async (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        const body = req.body as Record<string, unknown>
        if (typeof body.active !== 'boolean') {
          return this.badRequest(res, 'active must be a boolean')
        }

        const manager = this.requireManager()
        // An active condition on an alert that already exists is what raising
        // it again means, and raising needs the whole alert, so this route
        // only reports the current state.
        if (body.active) {
          const alert = manager.getAlert(req.params.id)
          if (!alert) {
            return this.fail(res, new AlertNotFoundError(req.params.id))
          }
          return void res
            .status(200)
            .json({ alert, cleared: false, previousState: alert.state })
        }

        try {
          res
            .status(200)
            .json(await manager.clearCondition(req.params.id, REST_SOURCE))
        } catch (error) {
          this.fail(res, error)
        }
      }
    )
  }

  /** Raise parameters from a request body, or a rejection naming the field. */
  private raiseParams(
    body: Record<string, unknown>,
    $source: SourceRef = REST_SOURCE
  ): CreateAlertParams {
    const alertPath = validateAlertPath(body.path)

    if (!this.isPriority(body.priority)) {
      throw new BadRequest(
        `priority must be one of ${ALERT_PRIORITIES.join(', ')}`
      )
    }
    if (typeof body.message !== 'string' || body.message.length === 0) {
      throw new BadRequest('message must be a non-empty string')
    }
    if (body.references !== undefined) {
      if (
        !Array.isArray(body.references) ||
        body.references.some((reference) => typeof reference !== 'string')
      ) {
        throw new BadRequest('references must be an array of paths')
      }
    }

    // Silently dropping a field of the wrong type would answer 201 for an
    // alert the caller did not ask for.
    for (const key of ['context', 'group'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        throw new BadRequest(`${key} must be a string`)
      }
    }
    if (body.latching !== undefined && typeof body.latching !== 'boolean') {
      throw new BadRequest('latching must be a boolean')
    }
    if (body.data !== undefined && !isRecord(body.data)) {
      throw new BadRequest('data must be an object')
    }

    const params = {
      path: alertPath,
      $source,
      priority: body.priority,
      message: body.message,
      ...(body.references === undefined
        ? {}
        : { references: (body.references as string[]).map(validateAlertPath) }),
      ...(body.context === undefined ? {} : { context: body.context }),
      ...(body.group === undefined ? {} : { group: body.group }),
      ...(body.latching === undefined ? {} : { latching: body.latching }),
      ...(body.data === undefined ? {} : { data: body.data })
    } as CreateAlertParams

    checkDescriptionBounds(params)
    return params
  }

  private listFilter(query: Record<string, unknown>): AlertFilter {
    const filter: AlertFilter = {}

    const states = this.asArray(query.state)
    if (states) {
      for (const state of states) {
        if (!this.isState(state)) {
          throw new BadRequest(
            `state must be one of ${ALERT_STATES.join(', ')}`
          )
        }
      }
      filter.state = states as AlertState[]
    }

    const priorities = this.asArray(query.priority)
    if (priorities) {
      for (const priority of priorities) {
        if (!this.isPriority(priority)) {
          throw new BadRequest(
            `priority must be one of ${ALERT_PRIORITIES.join(', ')}`
          )
        }
      }
      filter.priority = priorities as AlertPriority[]
    }

    if (typeof query.group === 'string') {
      filter.group = query.group
    }

    if (query.stale !== undefined) {
      if (query.stale !== 'true' && query.stale !== 'false') {
        throw new BadRequest('stale must be true or false')
      }
      filter.stale = query.stale === 'true'
    }

    return filter
  }

  private historyQuery(query: Record<string, unknown>): HistoryQuery {
    const result: HistoryQuery = {}

    for (const key of ['limit', 'offset'] as const) {
      const value = query[key]
      if (value === undefined) {
        continue
      }
      const count = Number(value)
      if (!Number.isInteger(count) || count < 0) {
        throw new BadRequest(`${key} must be a non-negative whole number`)
      }
      result[key] = count
    }

    for (const key of ['from', 'to'] as const) {
      const value = query[key]
      if (value === undefined) {
        continue
      }
      if (typeof value !== 'string' || !isIsoTimestamp(value)) {
        throw new BadRequest(`${key} must be an ISO 8601 timestamp`)
      }
      result[key] = value
    }

    const eventTypes = this.asArray(query.eventType)
    if (eventTypes) {
      for (const eventType of eventTypes) {
        if (!HISTORY_EVENT_TYPES.includes(eventType as HistoryEventType)) {
          throw new BadRequest(
            `eventType must be one of ${HISTORY_EVENT_TYPES.join(', ')}`
          )
        }
      }
      result.eventType = eventTypes as HistoryEventType[]
    }

    if (typeof query.alertId === 'string') {
      result.alertId = query.alertId
    }
    if (query.path !== undefined) {
      result.path = validateAlertPath(query.path)
    }

    return result
  }

  /** A repeatable query parameter as a list, or undefined when absent. */
  private asArray(value: unknown): string[] | undefined {
    if (value === undefined) {
      return undefined
    }
    const values = Array.isArray(value) ? value : [value]
    return values.map((entry) => String(entry))
  }

  private isPriority(value: unknown): value is AlertPriority {
    return ALERT_PRIORITIES.includes(value as AlertPriority)
  }

  private isState(value: unknown): value is AlertState {
    return ALERT_STATES.includes(value as AlertState)
  }

  private badRequest(res: Response, message: string): void {
    res.status(400).json({ ...Responses.invalid, message })
  }

  /** Answer a failed request from the type of the error, never its text. */
  private fail(res: Response, error: unknown): void {
    if (error instanceof AlertNotFoundError) {
      res.status(404).json({ ...Responses.notFound, message: error.message })
      return
    }
    if (
      error instanceof InvalidEscalationError ||
      error instanceof AlertLimitReachedError
    ) {
      res
        .status(409)
        .json({ state: 'FAILED', statusCode: 409, message: error.message })
      return
    }
    if (
      error instanceof BadRequest ||
      error instanceof InvalidAlertPathError ||
      error instanceof InvalidAlertDescriptionError ||
      error instanceof InvalidAlertPriorityError ||
      error instanceof InvalidSilenceDurationError
    ) {
      this.badRequest(res, error.message)
      return
    }
    console.error('Alerts API request failed:', error)
    res.status(500).json(serverError)
  }

  private requireManager(): AlertManager {
    if (!this.manager) {
      throw new Error('The alerts API is not started.')
    }
    return this.manager
  }

  private requireStore(): AlertStore {
    if (!this.store) {
      throw new Error('The alerts API is not started.')
    }
    return this.store
  }
}

/** Whether the value is a plain object, for the fields that carry one. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether the string is an ISO 8601 instant.
 *
 * `Date.parse` alone is not a check: it accepts non-ISO input and rolls an
 * impossible date such as 2026-02-30 over into March, so a client's typo would
 * silently query a different window. The calendar date is therefore checked on
 * its own, before any offset is applied.
 */
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

function isIsoTimestamp(value: string): boolean {
  const parts = ISO_TIMESTAMP.exec(value)
  if (!parts || Number.isNaN(Date.parse(value))) {
    return false
  }
  const [, year, month, day] = parts
  const asDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day))
  )
  return (
    asDate.getUTCFullYear() === Number(year) &&
    asDate.getUTCMonth() + 1 === Number(month) &&
    asDate.getUTCDate() === Number(day)
  )
}

/** A request the route layer rejects before the manager sees it. */
class BadRequest extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequest'
  }
}
