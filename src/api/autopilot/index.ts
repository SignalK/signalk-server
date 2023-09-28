/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:autopilot')

import { IRouter, NextFunction, Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { SignalKMessageHub } from '../../app'

export const AUTOPILOT_API_PATH = `/signalk/v2/api/vessels/self/steering/autopilot`

interface AutopilotApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {
  handleMessage: (id: string, data: any) => void
}

export class AutopilotApi {
  constructor(private server: AutopilotApplication) {}

  async start() {
    this.initApiFacade()
    return Promise.resolve()
  }

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'steering.autopilot'
    )
  }

  private initApiFacade() {
    debug(`** Initialise ${AUTOPILOT_API_PATH} facade **`)

    this.server.use(
      `${AUTOPILOT_API_PATH}`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** FACADE: ${AUTOPILOT_API_PATH}`)
        if (req.method !== 'GET') {
          debug(`** Checking update is allowed....`)
          if (!this.updateAllowed(req)) {
            res.status(403).json(Responses.unauthorised)
          } else {
            debug(`** Granted.....calling next()....`)
            next()
          }
        } else {
          next()
        }
      }
    )
  }
}
