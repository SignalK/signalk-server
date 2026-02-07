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
  AlarmOptions,
  NotificationId
} from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '..'
import { buildKey, NotificationManager, NotificationKey } from './notificationManager'

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
  private notiKeys: Map<NotificationKey, NotificationId> = new Map()
  private notificationManager: NotificationManager

  constructor(private server: NotificationApplication) {
    this.app = server
    this.notificationManager = new NotificationManager(server)
  }

  async start() {
    return new Promise<void>(async (resolve) => {
      this.initNotificationRoutes()
      this.app.registerDeltaInputHandler(
        (delta: Delta, next: (delta: Delta) => void) => {
          next(this.filterNotifications(delta))
        }
      )
      resolve()
    })
  }

  /** Filter out notifications.* paths and push onto notiUpdate */
  private filterNotifications(delta: Delta): Delta {
    const notiUpdates: Update[] = [] // notification updates

    delta.updates = delta.updates?.filter((update) => {
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
      this.notificationManager.processNotificationUpdate(update, context)
    }
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

    // Silence All
    this.app.post(
      `${NOTI_API_PATH}/silenceAll`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
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

    // Acknowledge All
    this.app.post(
      `${NOTI_API_PATH}/acknowledgeAll`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
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

    // MOB notification
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
    return this.notificationManager.get(id as NotificationId)
  }

  silenceNotification(id: string) {
    this.notificationManager.silence(id as NotificationId)
  }

  silenceAll() {
    this.notificationManager.silenceAll()
  }

  acknowledgeNotification(id: string) {
    this.notificationManager.acknowledge(id as NotificationId)
  }

  acknowledgeAll() {
    this.notificationManager.acknowledgeAll()
  }

  clearNotification(id: string) {
    this.notificationManager.clear(id as NotificationId)
  }

  raiseNotification(options: AlarmOptions) {
    return this.notificationManager.raise(options)
  }

  updateNotification(id: string, options: AlarmOptions) {
    this.notificationManager.update(id as NotificationId, options)
  }

  mob(message: string) {
    return this.notificationManager.mob({ message: message })
  }
}
