/*
 API for raising / clearing Standard Alarm types as defined in Signal K specification,
 providing default message text for each alarm type which can be overridden.
*/

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:alarms')

import { IRouter, Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import { SignalKMessageHub, WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'

import {
  Position,
  ALARM_METHOD,
  ALARM_STATE,
  Notification,
  SKVersion
} from '@signalk/server-api'
import { Responses } from '..'

import { buildSchemaSync } from 'api-schema-builder'
import alarmsApiDoc from './openApi.json'

const ALARMS_API_SCHEMA = buildSchemaSync(alarmsApiDoc)

const SIGNALK_API_PATH = `/signalk/v2/api`
const ALARMS_API_PATH = `${SIGNALK_API_PATH}/notifications`

const STANDARD_ALARMS = [
  'mob',
  'fire',
  'sinking',
  'flooding',
  'collision',
  'grounding',
  'listing',
  'adrift',
  'piracy',
  'abandon'
]

interface AlarmsApplication
  extends IRouter,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

export class AlarmsApi {
  constructor(private server: AlarmsApplication) {}

  async start() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve) => {
      this.initAlarmEndpoints()
      resolve()
    })
  }

  private getVesselPosition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _.get((this.server.signalk as any).self, 'navigation.position.value')
  }

  private getVesselAttitude() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _.get((this.server.signalk as any).self, 'navigation.attitude.value')
  }

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'notifications'
    )
  }

  private initAlarmEndpoints() {
    debug(`** Initialise ${ALARMS_API_PATH} path handlers **`)

    this.server.put(
      `${ALARMS_API_PATH}/:alarmType`,
      (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${ALARMS_API_PATH}/${req.params.alarmType}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (!STANDARD_ALARMS.includes(req.params.alarmType)) {
          next()
          return
        }
        try {
          const endpoint =
            ALARMS_API_SCHEMA[`${ALARMS_API_PATH}/:standardAlarm`].put
          if (!endpoint.body.validate(req.body)) {
            res.status(400).json(endpoint.body.errors)
            return
          }
          const r = this.updateAlarmState(req)
          res.status(200).json(r)
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    this.server.delete(
      `${ALARMS_API_PATH}/:alarmType`,
      (req: Request, res: Response, next: NextFunction) => {
        debug(`** DELETE ${ALARMS_API_PATH}/${req.params.alarmType}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (!STANDARD_ALARMS.includes(req.params.alarmType)) {
          next()
          return
        }
        try {
          const r = this.updateAlarmState(req, true)
          res.status(200).json(r)
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )
  }

  // set / clear alarm state
  private updateAlarmState = (req: Request, clear = false) => {
    const path = `notifications.${req.params.alarmType as string}`
    let alarmValue: Notification | null

    if (clear) {
      alarmValue = null
    } else {
      let msg = req.body.message
        ? req.body.message
        : this.getDefaultMessage(req.params.alarmType as string)

      const pos: Position = this.getVesselPosition()
      msg += pos ? '' : ' (No position data available.)'

      let roll: number | null = null
      if (req.params.alarmType === 'listing') {
        const att = this.getVesselAttitude()
        roll = att && att.roll ? att.roll : null
      }

      alarmValue = {
        message: msg,
        method: [ALARM_METHOD.sound, ALARM_METHOD.visual],
        state: ALARM_STATE.emergency
      }

      if (req.body.additionalData || pos || roll) {
        alarmValue.data = {}

        if (req.body.additionalData) {
          Object.assign(alarmValue.data, req.body.additionalData)
        }
        if (pos) {
          Object.assign(alarmValue.data, { position: pos })
        }
        if (roll) {
          Object.assign(alarmValue.data, { roll: roll })
        }
      }
    }

    debug(`****** Sending ${req.params.alarmType} Notification: ******`)
    debug(path, JSON.stringify(alarmValue))
    this.emitAlarmNotification(path, alarmValue, SKVersion.v1)
    return { state: 'COMPLETED', resultStatus: 200, statusCode: 200 }
  }

  // return default message for supplied alarm type
  private getDefaultMessage = (alarmType: string): string => {
    switch (alarmType) {
      case 'mob':
        return 'Man overboard!'
        break
      case 'fire':
        return 'Fire onboard vessel!'
        break
      case 'sinking':
        return 'Vessel sinking!'
        break
      case 'flooding':
        return 'Vessel talking on water!'
        break
      case 'collision':
        return 'Vessel has collided with another!'
        break
      case 'grounding':
        return 'Vessel has run aground!'
        break
      case 'listing':
        return 'Vessel has exceeded maximum safe angle of list!'
        break
      case 'adrift':
        return 'Vessel is cast adrift!'
        break
      case 'piracy':
        return 'Vessel has encountered pirates!'
        break
      case 'abandon':
        return 'Vessel has been abandoned!'
        break
    }
    return alarmType
  }

  // emit delta of specified version
  private emitAlarmNotification(path: string, value: Notification | null, version: SKVersion ) {
    this.server.handleMessage(
      'alarmsApi',
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
      version
    )
  }
}
