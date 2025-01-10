/*
 API for working with Alerts (Alarms & Notifications).
*/

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:alerts')
import { IRouter, Request, Response } from 'express'
import { SignalKMessageHub, WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'
import _ from 'lodash'
import { AlertManager, Alert } from './alertmanager'

import {
  Path,
  AlertMetaData,
  isAlertPriority,
  AlertPriority,
  SourceRef,
  AlertValue
} from '@signalk/server-api'

const SIGNALK_API_PATH = `/signalk/v2/api`
const ALERTS_API_PATH = `${SIGNALK_API_PATH}/alerts`

export interface AlertsApplication
  extends IRouter,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

export class AlertsApi {
  private alertManager: AlertManager

  constructor(private app: AlertsApplication) {
    this.alertManager = new AlertManager()
  }

  async start() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve) => {
      this.initApiEndpoints()
      resolve()
    })
  }

  /** public interface methods */

  mob(properties: AlertMetaData): string {
    const pos = this.getVesselPosition()
    const al = new Alert(this.app, 'emergency', {
      path: 'mob' as Path,
      name: properties?.name ?? 'MOB',
      message: properties?.message ?? 'Person Overboard!',
      sourceRef: (properties?.sourceRef as SourceRef) ?? 'alarmApi',
      position: pos ?? null
    })
    return this.alertManager.add(al)
  }

  raise(priority: AlertPriority, metaData?: AlertMetaData): string {
    debug(`** priority:(${priority}, metaData, ${metaData})`)
    if (!isAlertPriority(priority)) {
      throw new Error('Invalid alert priority or not provided!')
    }
    const al = new Alert(this.app, priority, metaData ?? undefined)
    return this.alertManager.add(al)
  }

  fetch(alertId: string): AlertValue {
    debug(`** fetch: ${alertId}`)
    return this.alertManager.get(alertId)?.value as AlertValue
  }

  setPriority(alertId: string, priority: AlertPriority) {
    debug(`** set priority:${priority}`)
    if (!isAlertPriority(priority)) {
      throw new Error('Invalid alert priority or value not provided!')
    }
    this.alertManager.get(alertId)?.updatePriority(priority)
  }

  setProperties(alertId: string, metaData: AlertMetaData) {
    debug(`** set metaData: ${metaData}`)
    if (Object.keys(metaData ?? {}).length === 0) {
      throw new Error('No properties have been provided!')
    }
    const al = this.alertManager.get(alertId)
    if (al) al.properties = metaData
  }

  resolve(alertId: string) {
    debug(`** resolve: ${alertId}`)
    this.alertManager.get(alertId)?.resolve()
  }

  ack(alertId: string) {
    debug(`** ack: ${alertId}`)
    this.alertManager.get(alertId)?.ack()
  }

  unack(alertId: string) {
    debug(`** unack: ${alertId}`)
    this.alertManager.get(alertId)?.unAck()
  }

  silence(alertId: string): boolean {
    debug(`** silence: ${alertId}`)
    return this.alertManager.get(alertId)?.silence() as boolean
  }

  remove(alertId: string) {
    debug(`** delete / clean: ${alertId}`)
    this.alertManager.delete(alertId)
  }

  /** /public interface methods */

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'alerts'
    )
  }

  private getVesselPosition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _.get((this.app.signalk as any).self, 'navigation.position').value
  }

  private initApiEndpoints() {
    debug(`** Initialise ${ALERTS_API_PATH} path handlers **`)

    // List Alerts
    this.app.get(`${ALERTS_API_PATH}`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.json(this.alertManager.list(req.query as any))
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Fetch Alert
    this.app.get(`${ALERTS_API_PATH}/:id`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)

      try {
        res.json(this.alertManager.get(req.params.id))
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // New Alert
    this.app.post(`${ALERTS_API_PATH}`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

      try {
        const id = this.raise(
          req.body.priority,
          req.body.properties ?? undefined
        )
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

    // MOB Alert
    this.app.post(`${ALERTS_API_PATH}/mob`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

      try {
        const id = this.mob(req.body)
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

    // Acknowledge ALL Alerts
    this.app.post(`${ALERTS_API_PATH}/ack`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

      try {
        this.alertManager.ackAll()
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: req.params.id
        })
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Acknowledge Alert
    this.app.post(
      `${ALERTS_API_PATH}/:id/ack`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.ack(req.params.id)
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Unacknowledge Alert
    this.app.post(
      `${ALERTS_API_PATH}/:id/unack`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.unack(req.params.id)
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Silence ALL Alerts
    this.app.post(
      `${ALERTS_API_PATH}/silence`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.alertManager.silenceAll()
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Silence Alert
    this.app.post(
      `${ALERTS_API_PATH}/:id/silence`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          if (this.silence(req.params.id)) {
            res.status(201).json({
              state: 'COMPLETED',
              statusCode: 201,
              id: req.params.id
            })
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: "Unable to silence alert! Priority <> 'alarm'"
            })
          }
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Update Alert metadata
    this.app.put(
      `${ALERTS_API_PATH}/:id/properties`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.setProperties(req.params.id, req.body)
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Update Alert priority
    this.app.put(
      `${ALERTS_API_PATH}/:id/priority`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.setPriority(req.params.id, req.body.value)
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Resolve Alert
    this.app.post(
      `${ALERTS_API_PATH}/:id/resolve`,
      (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

        try {
          this.resolve(req.params.id)
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id: req.params.id
          })
        } catch (e) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (e as Error).message
          })
        }
      }
    )

    // Remove Alert
    this.app.delete(`${ALERTS_API_PATH}/:id`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

      try {
        this.alertManager.delete(req.params.id)
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: req.params.id
        })
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })

    // Clean Alerts
    this.app.delete(`${ALERTS_API_PATH}`, (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path} ${JSON.stringify(req.body)}`)

      try {
        this.alertManager.clean()
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: req.params.id
        })
      } catch (e) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: (e as Error).message
        })
      }
    })
  }
}
