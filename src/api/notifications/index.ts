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
  AlarmRaiseOptions,
  AlarmUpdateOptions
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
      this.notificationManager.processNotificationUpdate(update, context)
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
        if (uuid.validate(req.params.id)) {
          const n = this.getById(req.params.id as NotificationId)
          if (n) {
            res.status(200).json(n)
          } else {
            res.status(200).json(Responses.notFound)
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

  list(): Record<NotificationId, AlarmProperties> {
    return this.notificationManager.list
  }

  getById(id: NotificationId): AlarmProperties | undefined {
    return this.notificationManager.get(id)
  }

  silence(id: NotificationId): void {
    this.notificationManager.silence(id)
  }

  silenceAll(): void {
    this.notificationManager.silenceAll()
  }

  acknowledge(id: NotificationId): void {
    this.notificationManager.acknowledge(id)
  }

  acknowledgeAll(): void {
    this.notificationManager.acknowledgeAll()
  }

  clear(id: NotificationId): void {
    this.notificationManager.clear(id)
  }

  raise(options: AlarmRaiseOptions): NotificationId {
    return this.notificationManager.raise(options)
  }

  update(id: NotificationId, options: AlarmUpdateOptions): void {
    this.notificationManager.update(id, options)
  }

  mob(message?: string): NotificationId {
    return this.notificationManager.mob(
      message ? { message: message } : undefined
    )
  }
}
