/*
 API for working with Notifications / Alarms.
*/

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:notifications')

import { IRouter, Request, Response } from 'express'
import _ from 'lodash'
import { v4 as uuidv4 } from 'uuid'

import { SignalKMessageHub, WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'

import {
  ALARM_METHOD,
  ALARM_STATE,
  Notification,
  SKVersion
} from '@signalk/server-api'

import { buildSchemaSync } from 'api-schema-builder'
import notificationsApiDoc from './openApi.json'

const NOTI_API_SCHEMA = buildSchemaSync(notificationsApiDoc)

const SIGNALK_API_PATH = `/signalk/v2/api`
const NOTI_API_PATH = `${SIGNALK_API_PATH}/notifications`
const $SRC = 'notificationsApi'

interface NotificationsApplication
  extends IRouter,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

export class NotificationsApi {
  private idToPathMap: Map<string, string>

  constructor(private server: NotificationsApplication) {
    this.idToPathMap = new Map()
  }

  async start() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve) => {
      this.initApiEndpoints()
      resolve()
    })
  }

  /** public interface methods */
  notify(path: string, value: Notification | null, source: string) {
    debug(`** Interface:put(${path}, value, ${source})`)
    if (!path || !source) {
      throw new Error('Path and source values must be specified!')
    }
    if (path.split('.')[0] !== 'notifications') {
      throw new Error('Invalid notifications path!')
    }

    try {
      if (!value) {
        this.clearNotificationAtPath(path, source)
      } else {
        return this.setNotificationAtPath(path, value, source)
      }
    } catch (e) {
      debug((e as Error).message)
      throw e
    }
  }

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'notifications'
    )
  }

  private initApiEndpoints() {
    debug(`** Initialise ${NOTI_API_PATH} path handlers **`)

    // Raise man overboard alarm
    this.server.post(`${NOTI_API_PATH}/mob`, (req: Request, res: Response) => {
      debug(`** POST ${NOTI_API_PATH}/mob`)

      const notiPath = `notifications.mob`
      const pos = this.getSelfPath('navigation.position')
      try {
        const notiValue: Notification = {
          message: 'Man Overboard!',
          method: [ALARM_METHOD.sound, ALARM_METHOD.visual],
          state: ALARM_STATE.emergency,
          id: uuidv4(),
          data: {
            position: pos ? pos.value : 'No vessel position data.'
          }
        }
        this.updateModel(notiPath, notiValue, $SRC)

        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: notiValue.id
        })
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Acknowledge notification
    this.server.put(`${NOTI_API_PATH}/ack/*`, (req: Request, res: Response) => {
      debug(`** PUT ${NOTI_API_PATH}/ack/${req.params[0]}`)
      debug(`** params ${JSON.stringify(req.query)}`)
      const source = (req.query.source as string) ?? $SRC

      try {
        const id = this.pathIsUuid(req.params[0])
        let noti
        if (id) {
          debug(`** id detected: Fetch Notification with id = ${id}`)
          noti = this.getNotificationById(id)
          if (!noti) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 404,
              message: `Notification with id = ${id} NOT found!`
            })
            return
          }
        } else {
          const notiPath = `notifications.` + req.params[0].split('/').join('.')
          noti = this.getNotificationByPath(notiPath, source)
          if (noti) {
            res.status(200).json(noti)
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 404,
              message: `Notification ${notiPath} NOT found!`
            })
            return
          }
        }
        if (noti.value.actions && Array.isArray(noti.value.actions)) {
          if (!noti.value.actions.includes('ACK')) {
            noti.value.actions.push('ACK')
          }
        } else {
          noti.value.actions = ['ACK']
        }
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Create / update notification
    this.server.put(`${NOTI_API_PATH}/*`, (req: Request, res: Response) => {
      debug(`** PUT ${NOTI_API_PATH}/${req.params[0]}`)
      debug(JSON.stringify(req.body))

      /*if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }*/
      if (!req.params[0]) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: 'No path provided!'
        })
      }

      try {
        /*const endpoint =
            NOTI_API_SCHEMA[`${NOTI_API_PATH}/:standardAlarm`].put
          if (!endpoint.body.validate(req.body)) {
            res.status(400).json(endpoint.body.errors)
            return
          }*/
        let id = this.pathIsUuid(req.params[0])
        let notiPath: string
        if (id) {
          notiPath = this.idToPathMap.get(id) as string
          debug(`** id supplied: PUT(${id}) ---> mapped to path ${notiPath}`)
          if (!notiPath) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Supplied id is not mapped to a notification path!`
            })
            return
          }
        } else {
          notiPath = `notifications.` + req.params[0].split('/').join('.')
          debug(`** path supplied: ${notiPath}`)
        }

        const notiValue: Notification = {
          message: req.body.message ?? '',
          method: this.getNotificationMethod(),
          state: req.body.state ?? ALARM_STATE.alert
        }
        if (req.body.data) {
          notiValue.data = req.body.data
        }

        id = this.setNotificationAtPath(notiPath, notiValue, $SRC)

        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: id
        })
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Clear notification
    this.server.delete(`${NOTI_API_PATH}/*`, (req: Request, res: Response) => {
      debug(`** DELETE ${NOTI_API_PATH}/${req.params[0]}`)
      debug(`** params ${JSON.stringify(req.query)}`)
      /*
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        */
      const source = (req.query.source as string) ?? $SRC
      debug(`** source = ${source}`)
      try {
        const id = this.pathIsUuid(req.params[0])
        if (id) {
          debug(`** id supplied: ${id}`)
          this.clearNotificationWithId(id)
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200
          })
        } else {
          const notiPath = `notifications.` + req.params[0].split('/').join('.')
          debug(`** path supplied: Clear ${notiPath} from $source= ${source}`)
          this.clearNotificationAtPath(notiPath, source)
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200
          })
        }
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // List notifications keyed by either path or id
    this.server.get(`${NOTI_API_PATH}`, (req: Request, res: Response) => {
      debug(`** GET ${NOTI_API_PATH}`)
      debug(`** params ${JSON.stringify(req.query)}`)
      const keyById = req.query.key === 'id' ? true : false
      try {
        const notiList: { [key: string]: Notification } = {}
        this.idToPathMap.forEach((path, id) => {
          const noti = this.getNotificationById(id, keyById)
          if (noti) {
            const key = keyById ? id : path
            notiList[key] = noti
          }
        })
        res.status(200).json(notiList)
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Return notification
    this.server.get(`${NOTI_API_PATH}/*`, (req: Request, res: Response) => {
      debug(`** GET ${NOTI_API_PATH}/*`)
      debug(`** params ${JSON.stringify(req.query)}`)
      const source = req.query.source as string

      try {
        const id = this.pathIsUuid(req.params[0])
        if (id) {
          debug(`** id detected: getNotificationById(${id})`)
          const noti = this.getNotificationById(id, true)
          if (noti) {
            res.status(200).json(noti)
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 404,
              message: `Notification with id = ${id} NOT found!`
            })
          }
        } else {
          const notiPath = `notifications.` + req.params[0].split('/').join('.')
          let noti
          if (source) {
            debug(`** filtering results by source: ${source}`)
            noti = this.getNotificationByPath(notiPath, source)
          } else {
            noti = this.getSelfPath(notiPath)
          }
          if (noti) {
            res.status(200).json(noti)
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 404,
              message: `Notification ${notiPath} NOT found!`
            })
          }
        }
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })
  }

  /** Clear Notification with provided id
   * @param id: UUID of notification to clear
   */
  private clearNotificationWithId(id: string) {
    if (!this.idToPathMap.has(id)) {
      throw new Error(`Notification with id = ${id} NOT found!`)
    }
    const path = this.idToPathMap.get(id)
    // Get $source of notification
    const noti = this.getSelfPath(path as string)
    const source = this.sourceOfId(noti, id) ?? $SRC
    this.updateModel(path as string, null, source)
    this.idToPathMap.delete(id)
  }

  /** Clear Notification at `path` raised by the specified $source
   * @param path: signal k path in dot notation
   * @param source: $source value to use.
   */
  private clearNotificationAtPath(path: string, source: string) {
    debug(`** path supplied: Clear ${path} from $source= ${source}`)
    // Get notification value for the supplied source
    const noti = this.getSelfPath(path)
    const notiValue = this.valueWithSource(noti, source)
    if (!notiValue) {
      throw new Error(
        `No notification found at ${path} that is from ${source}!`
      )
    }
    // Check notification for an id, if present then delete from map
    if (notiValue.id && this.idToPathMap.has(notiValue.id)) {
      debug(`** id detected..removing from map: ${notiValue.id}`)
      this.idToPathMap.delete(notiValue.id)
    }
    this.updateModel(path, null, source)
  }

  /** Set Notification value and $source at supplied path.
   * @param path: signal k path in dot notation
   * @param value: value to assign to path
   * @param source: source identifier
   * @returns id assigned to notification
   */
  private setNotificationAtPath(
    path: string,
    value: Notification,
    source: string
  ): string {
    debug(`** Set Notification at ${path} with $source= ${source}`)
    // get id from existing value or generate id
    const noti = this.getSelfPath(path)
    const nv = noti ? this.valueWithSource(noti, source) : null
    value.id = nv && nv.id ? noti.value.id : uuidv4()
    debug(`** id = ${value.id}`)

    this.updateModel(path, value, source)

    return value.id as string
  }

  /** TODO  *** Get the Notification method for the supplied Notification type */
  private getNotificationMethod = (type?: string) => {
    if (!type) {
      return [ALARM_METHOD.sound, ALARM_METHOD.visual]
    } else {
      // return method for supplied type from settings
      return [ALARM_METHOD.sound, ALARM_METHOD.visual]
    }
  }

  /** Maintain id mapping and send delta.
   * @param path: signal k path in dot notation
   * @param value: value to assign to path
   * @param source: source identifier
   */
  private updateModel = (
    path: string,
    value: Notification | null,
    source: string
  ) => {
    debug(`****** Sending ${path} Notification: ******`)
    debug(`value: `, JSON.stringify(value))
    debug(`source: `, source ?? 'self (default)')

    if (value && value.id) {
      debug(`ADDING to idToPathMap(${value.id})`)
      this.idToPathMap.set(value.id, path)
    }

    this.server.handleMessage(
      source,
      {
        updates: [
          {
            values: [
              {
                path: path,
                value: value
              }
            ]
          }
        ]
      },
      SKVersion.v1
    )
  }

  /** Checks if path is a UUID
   * @param path: UUID or signal k path in / notation
   * @returns UUID value (or empty string
   * */
  private pathIsUuid(path: string): string {
    const testId = (id: string): boolean => {
      const uuid = RegExp(
        '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
      )
      return uuid.test(id)
    }
    const p = path.indexOf('/') !== -1 ? path.split('/') : path.split('.')
    if (p.length === 1 && testId(p[0])) {
      return p[0]
    } else {
      return ''
    }
  }

  /** Get Signal K object from `self` at supplied path.
   *  @param path: signal k path in dot notation
   *  @returns signal k object
   */
  private getSelfPath(path: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _.get((this.server.signalk as any).self, path)
  }

  /** Get Notification object with the supplied id.
   *  Note: values attribute (if present) is omitted from the returned object!
   * @param id: notification id value to match.
     @param incPath: If true includes a path attribute containing the signal k path.
     @returns signal k object or null
  */
  private getNotificationById(id: string, incPath?: boolean) {
    if (this.idToPathMap.has(id)) {
      const path = this.idToPathMap.get(id)
      debug(`getNotificationById(${id}) => ${path}`)
      const n = this.getSelfPath(path as string)
      if (n['$source'] !== $SRC) {
        const v = this.valueWithSource(n, $SRC)
        if (!v) {
          return null
        }
        n.value = v
        n['$source'] !== $SRC
      }
      delete n.values

      const noti = Object.assign({}, n, incPath ? { path: path } : {})
      debug(`**NOTIFICATION with id = ${id}`, JSON.stringify(noti))
      return noti
    } else {
      debug(`idToPathMap(${id}) => NOT FOUND`)
      return null
    }
  }

  /** Get Notification object at specified path with the value from the supplied $source.
   *  Note: values attribute (if present) is omitted from the returned object!
   * @param path: signal k path in dot notation.
     @param source: source identifier of the value to return
     @returns signal k object or null
  */
  private getNotificationByPath(path: string, source: string = $SRC) {
    const n = this.getSelfPath(path as string)
    if (n['$source'] !== source) {
      const v = this.valueWithSource(n, source)
      if (!v) {
        console.log(`*** Couldn't find  $source = ${source}`)
        return null
      }
      n.value = v
      n['$source'] = source
    }
    delete n.values
    const noti = Object.assign({}, n)
    debug(`**NOTIFICATION at ${path} from ${source}`, JSON.stringify(noti))
    return noti
  }

  // returns $source value of supplied SK object with the specified id attribute value
  /** Get the $source of the notification with the supplied id (including when multiple values are present).
   * @param o: signal k object
   * @param id: notification id
   * @returns astring containing the value of $source | undefined
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sourceOfId(o: any, id: string) {
    let src
    if (o.values) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(o.values).forEach((e: Array<any>) => {
        if (e[1].value && e[1].value.id && e[1].value.id === id) {
          src = e[0]
        }
      })
    } else {
      if (o.value && o.value.id && o.value.id === id) {
        src = o['$source']
      }
    }
    debug(`** sourceWithId(${id}) = ${src}`)
    return src
  }

  /** Get the value (including when multiple values are present) with the provided $source.
   * @param o: signal k object
   * @param source: $source identifier of desired value.
   * @returns Notification | null
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private valueWithSource(o: any, source: string) {
    let v
    if (o.values && o.values[source]) {
      v = Object.assign({}, o.values[source].value)
    } else {
      if (o['$source'] === source) {
        v = Object.assign({}, o.value)
      }
    }
    debug(`** valueWithSource(${source}) = ${JSON.stringify(v)}`)
    return v
  }
}
