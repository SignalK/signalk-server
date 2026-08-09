import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:sensors')

import { IRouter, Request, Response } from 'express'
import { SignalKMessageHub, WithConfig } from '../../app'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { Responses } from '../'
import {
  GnssCorrectionStatus,
  GnssOffsetCorrector
} from '../gnssOffsetCorrector'
import { validateGnssConfigPayload, validateGnssSensorBounds } from './schemas'
import { applyGnssSensorsAtomic } from './atomicApply'
import { readDesignLengthOverall } from './vesselDimensions'

const SIGNALK_API_PATH = `/signalk/v2/api`
const SENSORS_API_PATH = `${SIGNALK_API_PATH}/vessels/self/sensors`

export interface SensorsApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {
  gnssOffsetCorrector?: GnssOffsetCorrector
}

export class SensorsApi {
  constructor(private app: SensorsApplication) {}

  async start(): Promise<void> {
    this.initSensorsRoutes()
  }

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'sensors.gnss'
    )
  }

  private gnssStatus(): GnssCorrectionStatus {
    return (
      this.app.gnssOffsetCorrector?.getStatus() ?? {
        mode: this.app.config.settings.gnssCorrection ?? 'off',
        active: false
      }
    )
  }

  // Hull dimensions used to bounds-check offsets. Non-positive values come
  // from a stale or hand-edited base-delta and would make every offset out
  // of range; treat them as unavailable so bounds-checking is skipped just
  // like when the dimension was never set.
  private hullDimensions(): {
    lengthOverall: number | undefined
    beam: number | undefined
  } {
    const de = this.app.config.baseDeltaEditor
    const lengthOverallRaw = readDesignLengthOverall(de)
    const beamRaw = de.getSelfValue('design.beam')
    return {
      lengthOverall:
        typeof lengthOverallRaw === 'number' && lengthOverallRaw > 0
          ? lengthOverallRaw
          : undefined,
      beam: typeof beamRaw === 'number' && beamRaw > 0 ? beamRaw : undefined
    }
  }

  private initSensorsRoutes() {
    debug(`** Initialise ${SENSORS_API_PATH} path handlers **`)

    this.app.get(`${SENSORS_API_PATH}/gnss`, (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      res.json({
        correction: this.app.config.settings.gnssCorrection ?? 'off',
        sensors: this.app.config.settings.gnssSensors ?? [],
        status: this.gnssStatus()
      })
    })

    this.app.put(`${SENSORS_API_PATH}/gnss`, (req: Request, res: Response) => {
      debug.enabled && debug(`** ${req.method} ${req.path}`)
      if (!this.updateAllowed(req)) {
        res.status(403).json(Responses.unauthorised)
        return
      }
      const validation = validateGnssConfigPayload(req.body)
      if (!validation.ok) {
        res
          .status(400)
          .json({ state: 'FAILED', statusCode: 400, message: validation.error })
        return
      }
      const { lengthOverall, beam } = this.hullDimensions()
      const boundsError = validateGnssSensorBounds(
        validation.value.sensors,
        lengthOverall,
        beam
      )
      if (boundsError) {
        res
          .status(400)
          .json({ state: 'FAILED', statusCode: 400, message: boundsError })
        return
      }
      applyGnssSensorsAtomic(this.app, validation.value, validation.value, res)
    })

    this.app.delete(
      `${SENSORS_API_PATH}/gnss`,
      (req: Request, res: Response) => {
        debug.enabled && debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        applyGnssSensorsAtomic(
          this.app,
          undefined,
          { correction: 'off', sensors: [] },
          res
        )
      }
    )
  }
}
