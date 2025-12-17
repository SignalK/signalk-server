import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notification')

import { Subject } from 'rxjs'
import * as uuid from 'uuid'
import { ServerApp, SignalKMessageHub, WithConfig } from '../../app'
import {
  ALARM_METHOD,
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

interface NotiAction {
  silence: boolean
  acknowledge: boolean
  delta: Delta
}

export interface NotificationApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

const SIGNALK_API_PATH = `/signalk/v2/api`
const NOTI_API_PATH = `${SIGNALK_API_PATH}/notifications`

const deltaVersion: SKVersion = SKVersion.v1

export class NotificationApi {
  private app: NotificationApplication
  private updateManager: NotificationUpdateHandler
  private notiKeys: Map<string, string> = new Map()
  private notifications: Map<string, NotiAction> = new Map()

  constructor(private server: NotificationApplication) {
    this.app = server
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
      res.status(200).json(Array.from(this.notifications))
    })

    this.app.get(
      `${NOTI_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.notifications.has(req.params.id)) {
          res.status(200).json(this.notifications.get(req.params.id))
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
        if (this.notifications.has(req.params.id)) {
          this.silenceNotification(req.params.id)
          res.status(200).json(Responses.ok)
        } else {
          res.status(200).json(Responses.notFound)
        }
      }
    )

    // Acknowledge
    this.app.post(
      `${NOTI_API_PATH}/:id/ack`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (this.notifications.has(req.params.id)) {
          this.silenceNotification(req.params.id, true)
          res.status(200).json(Responses.ok)
        } else {
          res.status(200).json(Responses.notFound)
        }
      }
    )
  }

  /**
   * Remove 'sound' method from notification and emit delta
   * @param id Notification identifier
   * @param ack true = acknowledge, false = silence
   */
  silenceNotification(id: string, ack?: boolean) {
    const a = this.notifications.get(id) as NotiAction
    if (ack) a.acknowledge = true
    else a.silence = true

    if ('values' in a.delta.updates[0]) {
      const value: Notification = a.delta.updates[0].values[0]
        .value as Notification
      value.method = this.alignAlarmMethod(id, value.method)
      this.notifications.set(id, a)
      this.app.handleMessage('notificationApi', a.delta, deltaVersion)
    }
  }

  /**
   * Handle incoming notification deltas and assign a notification identintier
   * @param delta Incoming notification delta
   */
  private handleNotiUpdate(delta: Delta) {
    delta.updates?.forEach((u: Update) => {
      if (hasValues(u) && u.values.length) {
        const value = u.values[0].value as Notification
        const path = u.values[0].path
        const src = u['$source'] as SourceRef
        const key = this.buildKey(src, delta.context as Context, path)
        if (this.notiKeys.has(key)) {
          u.notificationId = this.notiKeys.get(key)
        } else {
          const id = uuid.v4()
          this.notiKeys.set(key, id)
          u.notificationId = id
        }
        // manage ALARMS and ALARM_METHOD
        const id = u.notificationId as string
        if (['emergency', 'alarm'].includes(value.state)) {
          if (this.notifications.has(id)) {
            value.method = this.alignAlarmMethod(id, value.method)
            const n = this.notifications.get(id) as NotiAction
            n.delta = delta
            this.notifications.set(id, n)
          } else {
            this.notifications.set(id, {
              silence: false,
              acknowledge: false,
              delta: delta
            })
          }
        } else if (value.state === 'normal') {
          this.notifications.delete(id as string)
        }
      }
    })
    this.app.handleMessage('notificationApi', delta, deltaVersion)
  }

  /**
   * Align notification alarm method with recorded user action
   * @param id
   * @param method
   * @returns alarm method
   */
  private alignAlarmMethod(
    id: string,
    method: Array<ALARM_METHOD>
  ): Array<ALARM_METHOD> {
    const a = this.notifications.get(id)
    if (a?.silence || a?.acknowledge) {
      return method.filter((i) => i !== 'sound')
    } else {
      return method
    }
  }

  /**
   * Generates and returns the unique id for the supplied $source, context, path combination.
   * If the combination has been previously assigned an id, it is returned.
   * @param source
   * @param context
   * @param path
   * @returns notification identifier (notificationId)
   */
  assign(source: SourceRef, context: Context, path: Path) {
    const key = this.buildKey(source, context, path)
    if (!this.notiKeys.has(key)) {
      this.notiKeys.set(key, uuid.v4())
    }
    return this.notiKeys.get(key)
  }

  /**
   * Return key for supplied $source, context, path combination
   * @param source
   * @param context
   * @param path
   * @returns formatted key value
   */
  private buildKey(source: SourceRef, context: Context, path: Path): string {
    return `${source}/${context}/${path}`
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
