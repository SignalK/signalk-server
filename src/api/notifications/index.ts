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
  Update
} from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '..'
import { AlertManager } from './alertManager'

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
  private alertManager: AlertManager

  constructor(private server: NotificationApplication) {
    this.app = server
    this.alertManager = new AlertManager(server)
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

  private initNotificationRoutes() {
    this.app.get(`${NOTI_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      res.status(200).json(this.alertManager.list)
    })

    this.app.get(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        const n = this.alertManager.get(req.params.id)
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
          this.alertManager.silence(req.params.id)
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
          this.alertManager.acknowledge(req.params.id)
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
    this.app.post(
      `${NOTI_API_PATH}/raise`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${req.body}`)
        try {
          this.alertManager.raise(req.body)
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
  }

  /**
   * Handle incoming notification deltas and assign a notification identitier
   * @param delta Incoming notification delta
   */
  private handleNotiUpdate(delta: Delta) {
    const buildKey = (
      source: SourceRef,
      context: Context,
      path: Path
    ): string => {
      return `${source}/${context}/${path}`
    }

    delta.updates?.forEach((u: Update) => {
      if (hasValues(u) && u.values.length) {
        const value = u.values[0].value as Notification
        const path = u.values[0].path
        const src = u['$source'] as SourceRef
        const key = buildKey(src, delta.context as Context, path)
        if (this.notiKeys.has(key)) {
          u.notificationId = this.notiKeys.get(key)
        } else {
          const id = uuid.v4()
          this.notiKeys.set(key, id)
          u.notificationId = id
        }
        // manage ALARMS
        if (value.state) {
          const id = u.notificationId as string
          if (['normal', 'nominal'].includes(value.state)) {
            this.alertManager.remove(id)
          } else {
            this.alertManager.fromDelta(u, delta.context as Context)
          }
        }
      }
    })
    this.app.handleMessage('notificationApi', delta, deltaVersion)
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
