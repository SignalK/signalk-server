import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notification')

import * as uuid from 'uuid'
import { ServerApp, SignalKMessageHub, WithConfig } from '../../app'
import {
  Context,
  Delta,
  hasValues,
  Path,
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
  readonly updateManager: NotificationUpdateManager

  constructor(private app: NotificationApplication) {
    this.updateManager = new NotificationUpdateManager(app)
  }

  async start() {
    return Promise.resolve()
  }
}

/**
 * Class to manage updates containing notifications.* paths
 * It ensures:
 * 1. notifications paths are contained in their own update message
 * 2. updates containing a notification path has an identifier applied
 * 3. identifier is applied for each $source.context.path combination.
 */
export class NotificationUpdateManager {
  private idMap: Map<string, string> = new Map()

  constructor(private server: ServerApp) {
    // Register delta input processing method
    server.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        const noti = this.processDeltaInput(delta)
        next(noti)
      }
    )
  }

  /**
   * Generates and returns the unique id for the supplied $source, context, path combination.
   * If the combination has been previously assigned an id, it is returned.
   * @param source
   * @param context
   * @param path
   * @returns notification id ($nmi)
   */
  assign(source: SourceRef, context: Context, path: Path) {
    const key = this.buildKey(source, context, path)
    if (!this.idMap.has(key)) {
      this.idMap.set(key, uuid.v4())
    }
    return this.idMap.get(key)
  }

  /**
   * Process delta input and assign identifier to notifications
   * @param delta Incoming Delta
   * @returns Delta containing individual notification updates with identifier
   */
  private processDeltaInput(delta: Delta): Delta {
    const notiUpdates: Update[] = [] // notification updates

    // process updates
    const dUpdates = delta.updates?.filter((update) => {
      if (hasValues(update)) {
        // ignore messages from NotificationManager
        if ('$nmi' in update) {
          //server.debug( `Ignored: update has ${this.idLabel}`, update.values[0].path)
          return false
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
      // apply filtered updates
      delta.updates = ([] as Update[]).concat(dUpdates)
    }
    if (notiUpdates.length) {
      // apply notification updates
      delta.updates = delta.updates.concat(
        this.parseNotifications(notiUpdates, delta.context as Context)
      )
    }
    return delta
  }

  /**
   * Assign identifier and add to idMap
   * @param updates Array of updates containing notifications.* path
   * @param context Signal K context e.g. 'vessels.self'
   */
  private parseNotifications(updates: Update[], context: Context) {
    updates.forEach((u: Update) => {
      if (hasValues(u) && u.values.length) {
        const path = u.values[0].path
        const src = u['$source'] as SourceRef
        const key = this.buildKey(src, context, path)
        if (this.idMap.has(key)) {
          u.$nmi = this.idMap.get(key)
          debug('**existing**:', key, this.idMap.get(key))
        } else {
          const id = uuid.v4()
          this.idMap.set(key, id)
          u.$nmi = id
          debug('**new**:', key, id)
        }
      }
    })
    debug(JSON.stringify(updates))
    return updates
  }

  /**
   * Return key for supplied $source, context, path combination
   * @param source
   * @param context
   * @param path
   * @returns idMap key
   */
  private buildKey(source: SourceRef, context: Context, path: Path): string {
    return `${source}/${context}/${path}`
  }
}
