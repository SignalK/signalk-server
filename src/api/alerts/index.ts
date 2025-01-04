/*
 API for working with Alerts (Alarms & Notifications).
*/

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:alerts')
import { IRouter, Request, Response } from 'express'
import { SignalKMessageHub, WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'

import {
  AlertManager,
  Alert,
  AlertMetaData,
  isAlertPriority
} from './alertmanager'
import { Path } from '@signalk/server-api'

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
  notify(path: string, value: Alert | null, source: string) {
    debug(`** Interface:put(${path}, value, ${source})`)
  }

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'alerts'
    )
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

      if (!isAlertPriority(req.body.priority)) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: 'Alert priority is invalid or not provided!'
        })
        return
      }

      // create alert & add to manager
      const al = new Alert(
        this.app,
        req.body.priority,
        req.body.properties ?? undefined
      )
      try {
        this.alertManager.add(al)
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: al.value.id
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

      const { name, message, sourceRef } = req.body
      // create alert & add to manager
      const al = new Alert(this.app, 'emergency', {
        path: 'mob' as Path,
        name,
        message,
        sourceRef
      })
      try {
        this.alertManager.add(al)
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          id: al.value.id
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
          const al = this.alertManager.get(req.params.id)
          al?.ack()
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
          const al = this.alertManager.get(req.params.id)
          al?.unAck()
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
          const al = this.alertManager.get(req.params.id)
          if (al?.silence()) {
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

        if (Object.keys(req.body).length === 0) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'No properties have been provided!'
          })
          return
        }

        try {
          const al = this.alertManager.get(req.params.id)
          if (al) al.properties = req.body as AlertMetaData
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

        if (!isAlertPriority(req.body.value)) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: 'Alert priority is invalid or not provided!'
          })
          return
        }

        try {
          const al = this.alertManager.get(req.params.id)
          if (al) al.updatePriority(req.body.value)
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
          const al = this.alertManager.get(req.params.id)
          al?.resolve()
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

    // Clean / delete Alert
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
