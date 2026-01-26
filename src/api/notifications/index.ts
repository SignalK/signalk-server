import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notification')

import { Subject } from 'rxjs'
import * as uuid from 'uuid'
import { ServerApp, SignalKMessageHub, WithConfig } from '../../app'
import {
  Context,
  Delta,
  hasValues,
  Notification,
  Path,
  SKVersion,
  SourceRef,
  Update,
  AlarmOptions
} from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '..'
import { NotificationManager } from './notificationManager'
import { DbStore } from './dbstore'

export interface NotificationApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

const SIGNALK_API_PATH = `/signalk/v2/api`
const NOTI_API_PATH = `${SIGNALK_API_PATH}/notifications`

export const deltaVersion: SKVersion = SKVersion.v1

export class NotificationApi {
  private app: NotificationApplication
  private updateManager: NotificationUpdateHandler
  private notiKeys: Map<string, string> = new Map()
  private notificationManager: NotificationManager
  private dbLoaded: Promise<void> | null = null
  public db: DbStore

  constructor(private server: NotificationApplication) {
    this.db = new DbStore(server)
    this.dbLoaded = this.loadFromStore()

    this.app = server
    this.notificationManager = new NotificationManager(server, this.db)
    this.updateManager = new NotificationUpdateHandler(server)
    this.updateManager.$notiUpdate.subscribe((d: Delta) =>
      this.handleNotiUpdate(d)
    )
  }

  async start() {
    return new Promise<void>(async (resolve) => {
      this.initNotificationRoutes()
      resolve()
    })
  }

  /** initialise notification identifiers from persisted state */
  private async loadFromStore() {
    try {
      const r = await this.db.listNotis()
      const n = r?.map((i) => {
        return [i.id, i.value]
      })
      if (n) {
        this.notiKeys = new Map(n as [string, string][])
      }
    } catch {
      debug('No persisted notification ids found.')
    }
  }

  /** ready to process notifications */
  private async isReady() {
    if (this.dbLoaded) {
      await this.dbLoaded
    }
  }

  /**
   * Handle incoming notification deltas and assign a notification identitier
   * @param delta Incoming notification delta
   */
  private async handleNotiUpdate(delta: Delta) {
    const buildKey = (
      source: SourceRef,
      context: Context,
      path: Path
    ): string => {
      return `${source}/${context}/${path}`
    }

    await this.isReady()
    delta.updates?.forEach((u: Update) => {
      if (hasValues(u) && u.values.length) {
        const value = u.values[0].value as Notification
        const path = u.values[0].path
        const src = u['$source'] as SourceRef
        const key = buildKey(src, delta.context as Context, path)
        let id: string
        if (this.notiKeys.has(key)) {
          u.notificationId = this.notiKeys.get(key)
          id = u.notificationId as string
        } else {
          id = uuid.v4()
          this.notiKeys.set(key, id)
          this.db.setNoti(key, id)
          u.notificationId = id
        }
        this.db.setNoti(key, id)
        // manage ALARM_STATE
        if (value.state) {
          this.notificationManager.fromDelta(u, delta.context as Context)
        }
      }
    })
    this.app.handleMessage('notificationApi', delta, deltaVersion)
  }

  /** Initialise API endpoints */
  private initNotificationRoutes() {
    // Return list of notifications
    this.app.get(`${NOTI_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      res.status(200).json(this.listNotifications())
    })

    // fetch
    this.app.get(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        const n = this.getNotification(req.params.id)
        if (n) {
          res.status(200).json(n)
        } else {
          res.status(200).json(Responses.notFound)
        }
      }
    )

    // Silence
    this.app.post(
      `${NOTI_API_PATH}/:id/silence`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          this.silenceNotification(req.params.id)
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
        try {
          this.acknowledgeNotification(req.params.id)
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

    // Clear
    this.app.delete(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          this.clearNotification(req.params.id)
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

    // raise
    this.app.post(`${NOTI_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${req.body}`)
      try {
        const id = this.notificationManager.raise(req.body)
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
        debug(`** ${req.method} ${req.path} ${req.body}`)
        try {
          this.updateNotification(req.params.id, req.body)
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

    // MOBnotification
    this.app.post(
      `${NOTI_API_PATH}/mob`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${req.body}`)
        try {
          const id = this.notificationManager.mob(req.body)
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

  listNotifications() {
    return this.notificationManager.list
  }

  getNotification(id: string) {
    return this.notificationManager.get(id)
  }

  silenceNotification(id: string) {
    this.notificationManager.silence(id)
  }

  acknowledgeNotification(id: string) {
    this.notificationManager.acknowledge(id)
  }

  clearNotification(id: string) {
    this.notificationManager.clear(id)
  }

  raiseNotification(options: AlarmOptions) {
    return this.notificationManager.raise(options)
  }

  updateNotification(id: string, options: AlarmOptions) {
    this.notificationManager.update(id, options)
  }

  mob(message: string) {
    return this.notificationManager.mob({ message: message })
  }
}

/**
 * Class to handle Notification Updates (path = notifications.*).
 * It filters out notifications from the delta and places them into
 * individual update messages which are placed onto the notiUpdates Subject
 * for processing and emitting.
 */
export class NotificationUpdateHandler {
  private notiUpdate: Subject<Delta> = new Subject()
  public readonly $notiUpdate = this.notiUpdate.asObservable()

  constructor(private server: ServerApp) {
    server.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        next(this.filterNotifications(delta))
      }
    )
  }

  /** Filter out notifications.* paths and push onto notiUpdate */
  private filterNotifications(delta: Delta): Delta {
    const notiUpdates: Update[] = [] // notification updates

    const dUpdates = delta.updates?.filter((update) => {
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
    })

    delta.updates = []
    if (dUpdates?.length) {
      // return filtered update array
      delta.updates = ([] as Update[]).concat(dUpdates)
    }
    if (notiUpdates.length) {
      this.notiUpdate.next({ context: delta.context, updates: notiUpdates })
    }
    return delta
  }
}
