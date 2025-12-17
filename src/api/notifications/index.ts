import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notification')

import { Subject } from 'rxjs'
import * as uuid from 'uuid'
import { ServerApp, SignalKMessageHub, WithConfig } from '../../app'
import {
  Context,
  Delta,
  hasValues,
  Path,
  SKVersion,
  SourceRef,
  Update
} from '@signalk/server-api'
import { IRouter } from 'express'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'

export interface NotificationApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

export class NotificationApi {
  private app: NotificationApplication
  private updateManager: NotificationUpdateHandler
  private notiId: Map<string, string> = new Map()

  constructor(private server: NotificationApplication) {
    this.app = server
    this.updateManager = new NotificationUpdateHandler(server)
    this.updateManager.$notiUpdate.subscribe((d: Delta) =>
      this.handleNotiUpdate(d)
    )
  }

  async start() {
    return Promise.resolve()
  }

  /**
   * Handle incoming notification deltas and assign a notification identintier
   * @param delta Incoming notification delta
   */
  private handleNotiUpdate(delta: Delta) {
    delta.updates?.forEach((u: Update) => {
      if (hasValues(u) && u.values.length) {
        const path = u.values[0].path
        const src = u['$source'] as SourceRef
        const key = this.buildKey(src, delta.context as Context, path)
        if (this.notiId.has(key)) {
          u.notificationId = this.notiId.get(key)
          //debug('**existing**:', key, this.notiId.get(key))
        } else {
          const id = uuid.v4()
          this.notiId.set(key, id)
          u.notificationId = id
          //debug('**new**:', key, id)
        }
      }
    })
    debug(delta)
    this.app.handleMessage('notificationApi', delta, SKVersion.v2)
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
    if (!this.notiId.has(key)) {
      this.notiId.set(key, uuid.v4())
    }
    return this.notiId.get(key)
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
