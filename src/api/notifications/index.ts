import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notification')

import * as uuid from 'uuid'
import { SignalKMessageHub, WithConfig } from '../../app'
import {
  Context,
  Delta,
  hasValues,
  SKVersion,
  SourceRef,
  Update,
  AlarmProperties,
  NotificationId,
  NotificationManagerDisabledError,
  AlarmRaiseOptions,
  AlarmUpdateOptions,
  Path,
  ALARM_STATE,
  ALARM_METHOD,
  Notification,
  Timestamp
} from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '..'
import {
  buildKey,
  NotificationManager,
  NotificationKey
} from './notificationManager'

export interface NotificationApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

const SIGNALK_API_PATH = `/signalk/v2/api`
const NOTI_API_PATH = `${SIGNALK_API_PATH}/notifications`

const DISABLED_MESSAGE = new NotificationManagerDisabledError().message

/** Non-path metadata keys on fullsignalk model nodes */
const MODEL_NODE_KEYS = new Set([
  'value',
  'values',
  'meta',
  '$source',
  'timestamp'
])

export const deltaVersion: SKVersion = SKVersion.v1

export class NotificationApi {
  private app: NotificationApplication
  private notiKeys: Map<NotificationKey, NotificationId> = new Map()
  private notificationManager?: NotificationManager

  constructor(private server: NotificationApplication) {
    this.app = server
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.initNotificationRoutes()
      if (this.isManaging()) {
        this.notificationManager = new NotificationManager(this.server)
        this.app.registerDeltaInputHandler(
          (delta: Delta, next: (delta: Delta) => void) => {
            next(this.filterNotifications(delta))
          }
        )
      } else {
        debug(
          'Core notification management disabled ' +
            '(settings.notifications.manageNotifications=false)'
        )
      }
      resolve()
    })
  }

  private isManaging(): boolean {
    return this.app.config.settings.notifications?.manageNotifications !== false
  }

  /** Filter out notifications.* paths and push onto notiUpdate */
  private filterNotifications(delta: Delta): Delta {
    const notiUpdates: Update[] = [] // notification updates

    delta.updates =
      delta.updates?.filter((update) => {
        if (hasValues(update)) {
          // ignore messages from NotificationManager
          if ('notificationId' in update) {
            return true
          }
          // filter out values containing notification paths
          const filteredValues = update.values.filter((u) => {
            if (u.path.startsWith('notifications')) {
              const nu = Object.assign({}, update, { values: [u] })
              notiUpdates.push(nu)
              return false
            } else {
              return true
            }
          })
          if (filteredValues.length) {
            update.values = filteredValues
            return true
          } else {
            return false
          }
        }
        return true
      }) ?? []

    notiUpdates.forEach((update) => {
      this.handleNotificationUpdate(update, delta.context as Context)
    })
    return delta
  }

  /**
   * Handle incoming notification update and assign a notification identifier
   * @param update Update object
   * @param context Context value
   */
  private handleNotificationUpdate(update: Update, context: Context) {
    if (hasValues(update) && update.values.length) {
      const path = update.values[0].path
      const src = update['$source'] as SourceRef
      const key = buildKey(context, path, src)
      if (this.notiKeys.has(key)) {
        update.notificationId = this.notiKeys.get(key)
      } else {
        update.notificationId = uuid.v4() as NotificationId
        this.notiKeys.set(key, update.notificationId)
      }
      // register with manager
      this.notificationManager?.processNotificationUpdate(update, context)
    }
  }

  /** Initialise API endpoints */
  private initNotificationRoutes() {
    // Return list of notifications
    this.app.get(`${NOTI_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      res.status(200).json(this.list())
    })

    // Retrieve notification entry
    this.app.get(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        if (uuid.validate(req.params.id)) {
          const n = this.getId(req.params.id as NotificationId)
          if (n) {
            res.status(200).json(n)
          } else {
            res.status(404).json(Responses.notFound)
          }
        } else {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    // Silence All
    this.app.post(
      `${NOTI_API_PATH}/silenceAll`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          this.silenceAll()
          res.status(200).json(Responses.ok)
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // Silence
    this.app.post(
      `${NOTI_API_PATH}/:id/silence`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          if (uuid.validate(req.params.id)) {
            this.silence(req.params.id as NotificationId)
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // Acknowledge All
    this.app.post(
      `${NOTI_API_PATH}/acknowledgeAll`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          this.acknowledgeAll()
          res.status(200).json(Responses.ok)
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // Acknowledge
    this.app.post(
      `${NOTI_API_PATH}/:id/acknowledge`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          if (uuid.validate(req.params.id)) {
            this.acknowledge(req.params.id as NotificationId)
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // Clear
    this.app.delete(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          if (uuid.validate(req.params.id)) {
            this.clear(req.params.id as NotificationId)
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // raise
    this.app.post(`${NOTI_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      try {
        const id = this.raise(req.body)
        res.status(200).json(Object.assign({}, Responses.ok, { id: id }))
      } catch (err) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (err as Error).message
        })
      }
    })

    // update
    this.app.put(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.rejectIfDisabled(res)) return
        try {
          if (uuid.validate(req.params.id)) {
            this.update(req.params.id as NotificationId, req.body)
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )

    // MOB notification
    this.app.post(
      `${NOTI_API_PATH}/mob`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const id = this.mob(req.body?.message)
          res.status(200).json(Object.assign({}, Responses.ok, { id: id }))
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (err as Error).message
          })
        }
      }
    )
  }

  //** Plugin Interface Methods */

  list(): Record<NotificationId, AlarmProperties> {
    return this.notificationManager
      ? this.notificationManager.list
      : this.listFromModel()
  }

  getId(id: NotificationId): AlarmProperties | undefined {
    return this.requireManager().get(id)
  }

  getPath(path: Path): Record<NotificationId, AlarmProperties> {
    return this.notificationManager
      ? this.notificationManager.getPath(path)
      : this.listFromModel(path)
  }

  silence(id: NotificationId): void {
    this.requireManager().silence(id)
  }

  silenceAll(): void {
    this.requireManager().silenceAll()
  }

  acknowledge(id: NotificationId): void {
    this.requireManager().acknowledge(id)
  }

  acknowledgeAll(): void {
    this.requireManager().acknowledgeAll()
  }

  clear(id: NotificationId): void {
    this.requireManager().clear(id)
  }

  raise(options: AlarmRaiseOptions): NotificationId {
    return this.notificationManager
      ? this.notificationManager.raise(options)
      : this.raiseViaDelta(options)
  }

  update(id: NotificationId, options: AlarmUpdateOptions): void {
    this.requireManager().update(id, options)
  }

  mob(message?: string): NotificationId {
    return this.notificationManager
      ? this.notificationManager.mob(message)
      : this.raiseViaDelta({
          state: ALARM_STATE.emergency,
          message: message ?? 'Person Overboard!',
          path: 'mob' as Path,
          idInPath: true,
          includePosition: true,
          includeCreatedAt: true
        })
  }

  // ----- Disabled-mode behaviour (no NotificationManager) -----

  private requireManager(): NotificationManager {
    if (!this.notificationManager) {
      throw new NotificationManagerDisabledError()
    }
    return this.notificationManager
  }

  private rejectIfDisabled(res: Response): boolean {
    if (this.notificationManager) {
      return false
    }
    res.status(501).json({
      state: 'FAILED',
      statusCode: 501,
      message: DISABLED_MESSAGE
    })
    return true
  }

  /**
   * Read notifications from the data model. A handler's notifications still
   * appear in the model when core management is off, so list/getPath serve
   * them. A handler-supplied `id` in the value is used as the key; otherwise
   * the path is used (no core-side status enrichment).
   */
  private listFromModel(
    pathFilter?: Path
  ): Record<NotificationId, AlarmProperties> {
    const result: Record<string, AlarmProperties> = Object.create(null)
    const root: unknown = this.app.signalk.self?.notifications
    if (!root) {
      return result
    }
    const filter = pathFilter
      ? String(pathFilter).replace(/^notifications(\.|$)/, '')
      : ''
    // iterative walk: a notification leaf can itself parent further
    // notification nodes, so leaves do not end the descent
    const stack: Array<[unknown, string]> = [[root, '']]
    while (stack.length) {
      const [entry, dotted] = stack.pop()!
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const node = entry as Record<string, unknown>
      const nodeValue = node.value
      if (
        nodeValue &&
        typeof nodeValue === 'object' &&
        'state' in nodeValue &&
        (!filter || dotted === filter || dotted.startsWith(`${filter}.`))
      ) {
        const value = nodeValue as Notification
        const path = `notifications.${dotted}` as Path
        // key by source-supplied id; on a duplicate id fall back to the
        // (unique) path so no notification is silently dropped
        const key =
          typeof value.id === 'string' && !(value.id in result)
            ? value.id
            : path
        result[key] = { context: 'vessels.self' as Context, path, value }
      }
      for (const segment of Object.keys(node)) {
        if (!MODEL_NODE_KEYS.has(segment)) {
          stack.push([node[segment], dotted ? `${dotted}.${segment}` : segment])
        }
      }
    }
    return result
  }

  /**
   * Emit a notification as a delta without a NotificationManager. It lands in
   * the data model and reaches any external handler. A generated id is
   * embedded in the value (matching managed-mode) and returned.
   */
  private raiseViaDelta(options: AlarmRaiseOptions): NotificationId {
    if (!options || !options.state || !options.message) {
      throw new Error(
        'Notification `state` or `message` properties are missing!'
      )
    }
    if (!options.path) {
      throw new Error(
        'Notification `path` is required when core notification management is disabled.'
      )
    }
    const id = uuid.v4() as NotificationId
    const basePath = String(options.path).startsWith('notifications.')
      ? String(options.path)
      : `notifications.${options.path}`
    const path = (options.idInPath ? `${basePath}.${id}` : basePath) as Path

    const value: Notification = {
      state: options.state,
      message: options.message,
      method: [ALARM_METHOD.visual, ALARM_METHOD.sound],
      id
    }
    if (options.includePosition || options.state === ALARM_STATE.emergency) {
      value.position =
        this.app.signalk.self?.navigation?.position?.value ?? null
    }
    if (options.includeCreatedAt || options.state === ALARM_STATE.emergency) {
      value.createdAt = new Date().toISOString() as Timestamp
    }
    if (options.data) {
      value.data = structuredClone(options.data)
    }

    const delta: Delta = {
      // managed-mode raise also emits for self regardless of options.context
      // (Alarm attaches context to the delta only for external updates)
      context: 'vessels.self' as Context,
      updates: [
        {
          values: [{ path, value }]
        } as Update
      ]
    }
    this.app.handleMessage('notificationApi', delta, deltaVersion)
    return id
  }
}
