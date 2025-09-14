/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:autopilot')

import { IRouter, NextFunction, Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { SignalKMessageHub } from '../../app'

import {
  AutopilotProvider,
  AutopilotInfo,
  SKVersion,
  Path,
  Value,
  Delta,
  isAutopilotProvider,
  isAutopilotUpdateAttrib,
  isAutopilotAlarm,
  PathValue,
  SourceRef,
  AutopilotActionDef
} from '@signalk/server-api'

const AUTOPILOT_API_PATH = `/signalk/v2/api/vessels/self/autopilots`
const DEFAULTIDPATH = '_default'

interface AutopilotApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {}

interface AutopilotList {
  [id: string]: { provider: string; isDefault: boolean }
}

interface AutopilotApiSettings {
  maxTurn: number // maximum course adjust / steer angle value (degrees)
}

export class AutopilotApi {
  private autopilotProviders: Map<string, AutopilotProvider> = new Map()

  private defaultProviderId?: string
  private defaultDeviceId?: string
  private deviceToProvider: Map<string, string> = new Map()

  private settings: AutopilotApiSettings = {
    maxTurn: 20 * (Math.PI / 180)
  }

  constructor(private server: AutopilotApplication) {}

  async start() {
    this.initApiEndpoints()
    return Promise.resolve()
  }

  // ***** Plugin Interface methods *****

  // Register plugin as provider.
  register(pluginId: string, provider: AutopilotProvider, devices: string[]) {
    debug(`** Registering provider(s)....${pluginId}`)

    if (!provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!devices) {
      throw new Error(`${pluginId} has not supplied a device list!`)
    }
    if (!isAutopilotProvider(provider)) {
      throw new Error(
        `${pluginId} is missing AutopilotProvider properties/methods!`
      )
    } else {
      if (!this.autopilotProviders.has(pluginId)) {
        this.autopilotProviders.set(pluginId, provider)
      }
      devices.forEach((id: string) => {
        if (!this.deviceToProvider.has(id)) {
          this.deviceToProvider.set(id, pluginId)
        }
      })
    }
    debug(
      `No. of AutoPilotProviders registered =`,
      this.autopilotProviders.size
    )
  }

  // Unregister plugin as provider.
  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Request to un-register plugin.....${pluginId}`)

    if (!this.autopilotProviders.has(pluginId)) {
      debug(`** NOT FOUND....${pluginId}... cannot un-register!`)
      return
    }

    debug(`** Un-registering autopilot provider....${pluginId}`)
    this.autopilotProviders.delete(pluginId)

    debug(`** Update deviceToProvider Map .....${pluginId}`)
    this.deviceToProvider.forEach((v: string, k: string) => {
      debug('k', k, 'v', v)
      if (v === pluginId) {
        this.deviceToProvider.delete(k)
      }
    })

    // update default if required
    if (pluginId === this.defaultProviderId) {
      debug(`** Resetting defaults .....`)
      this.defaultDeviceId = undefined
      this.defaultProviderId = undefined
      this.initDefaults()
      /*this.emitUpdates(
        [
          this.buildPathValue(
            'defaultPilot' as Path,
            this.defaultDeviceId ?? null
          )
        ],
        'autopilotApi' as SourceRef
      )*/
    }

    debug(
      `Remaining number of AutoPilot Providers registered =`,
      this.autopilotProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  /** Emit updates from autopilot device as `steering.autopilot.*` deltas.
   *  This should be used by provider plugins to:
   *   - Ensure API state is consistant
   *   - trigger the sending of deltas.
   */
  apUpdate(
    pluginId: string,
    deviceId: SourceRef = pluginId as SourceRef,
    apInfo: { [path: string]: Value }
  ) {
    try {
      if (deviceId && !this.deviceToProvider.has(deviceId)) {
        this.deviceToProvider.set(deviceId, pluginId)
      }
      if (!this.defaultDeviceId) {
        this.initDefaults(deviceId)
      }
    } catch (err) {
      debug(`ERROR apUpdate(): ${pluginId}->${deviceId}`, err)
      return
    }

    const values: any[] = []
    Object.keys(apInfo).forEach((attrib: string) => {
      if (isAutopilotUpdateAttrib(attrib) && attrib !== 'options') {
        if (attrib === 'alarm') {
          const alarm: PathValue = apInfo[attrib] as PathValue
          if (isAutopilotAlarm(alarm.path)) {
            values.push({
              path: `notifications.steering.autopilot.${alarm.path}` as Path,
              value: alarm.value
            })
          }
        } else if (attrib === 'actions') {
          const actions = apInfo[attrib] as AutopilotActionDef
          if (Array.isArray(actions)) {
            const av = actions.filter((i) => i.available).map((i) => i.id)
            values.push({
              path: `notifications.steering.autopilot.availableActions` as Path,
              value: av
            })
          }
        } else {
          values.push({
            path: `steering.autopilot.${attrib}`,
            value: apInfo[attrib]
          })
        }
      }
    })
    if (values.length !== 0) {
      this.emitUpdates(values, deviceId)
    }
  }

  // ***** /Plugin Interface methods *****

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'autopilot'
    )
  }

  private initApiEndpoints() {
    debug(`** Initialise ${AUTOPILOT_API_PATH} endpoints. **`)

    this.server.use(
      `${AUTOPILOT_API_PATH}/*`,
      (req: Request, res: Response, next: NextFunction) => {
        debug(`Autopilot path`, req.method, req.params)
        try {
          if (['PUT', 'POST'].includes(req.method)) {
            debug(`Autopilot`, req.method, req.path, req.body)
            if (!this.updateAllowed(req)) {
              res.status(403).json(Responses.unauthorised)
            } else {
              next()
            }
          } else {
            debug(`Autopilot`, req.method, req.path, req.query, req.body)
            next()
          }
        } catch (err: any) {
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: err.message ?? 'No autopilots available!'
          })
        }
      }
    )

    // get autopilot provider information
    this.server.get(`${AUTOPILOT_API_PATH}`, (req: Request, res: Response) => {
      res.status(200).json(this.getDevices())
    })

    // get default autopilot device
    this.server.get(
      `${AUTOPILOT_API_PATH}/_providers/_default`,
      (req: Request, res: Response) => {
        debug(`params:`, req.params)
        res.status(Responses.ok.statusCode).json({ id: this.defaultDeviceId })
      }
    )

    // set default autopilot device
    this.server.post(
      `${AUTOPILOT_API_PATH}/_providers/_default/:id`,
      (req: Request, res: Response) => {
        debug(`params:`, req.params)
        if (!this.deviceToProvider.has(req.params.id)) {
          debug('** Invalid device id supplied...')
          res.status(Responses.invalid.statusCode).json(Responses.invalid)
          return
        }
        this.initDefaults(req.params.id)
        res.status(Responses.ok.statusCode).json(Responses.ok)
      }
    )

    // get default autopilot status & options
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getData(req.params.id)
          .then((data: AutopilotInfo) => {
            res.json(data)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // get autopilot options
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/options`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getData(req.params.id)
          .then((r: AutopilotInfo) => {
            res.json(r.options)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // engage / enable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/engage`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .engage(req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // disengage / disable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/disengage`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .disengage(req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // get state
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/state`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getState(req.params.id)
          .then((r: string | null) => {
            res.json({ value: r })
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // set state
    this.server.put(
      `${AUTOPILOT_API_PATH}/:id/state`,
      (req: Request, res: Response) => {
        if (typeof req.body.value === 'undefined') {
          res.status(Responses.invalid.statusCode).json(Responses.invalid)
          return
        }
        this.useProvider(req)
          .setState(req.body.value, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // get mode
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/mode`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getMode(req.params.id)
          .then((r: string | null) => {
            res.json({ value: r })
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // set mode
    this.server.put(
      `${AUTOPILOT_API_PATH}/:id/mode`,
      (req: Request, res: Response) => {
        if (typeof req.body.value === 'undefined') {
          res.status(400).json(Responses.invalid)
          return
        }
        this.useProvider(req)
          .setMode(req.body.value, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // get target
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/target`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getTarget(req.params.id)
          .then((r: number | null) => {
            res.json({ value: r })
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // set target
    this.server.put(
      `${AUTOPILOT_API_PATH}/:id/target`,
      (req: Request, res: Response) => {
        if (typeof req.body.value !== 'number') {
          res.status(Responses.invalid.statusCode).json(Responses.invalid)
          return
        }

        const u: string = req.body.units ?? 'rad'
        let v =
          typeof u === 'string' && u.toLocaleLowerCase() === 'deg'
            ? req.body.value * (Math.PI / 180)
            : req.body.value

        v =
          v < 0 - Math.PI
            ? Math.max(...[0 - Math.PI, v])
            : Math.min(...[2 * Math.PI, v])

        debug('target = ', v)
        this.useProvider(req)
          .setTarget(v, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // adjust target
    this.server.put(
      `${AUTOPILOT_API_PATH}/:id/target/adjust`,
      (req: Request, res: Response) => {
        if (typeof req.body.value !== 'number') {
          res.status(Responses.invalid.statusCode).json(Responses.invalid)
          return
        }
        const u: string = req.body.units ?? 'rad'
        const v =
          typeof u === 'string' && u.toLocaleLowerCase() === 'deg'
            ? req.body.value * (Math.PI / 180)
            : req.body.value

        debug('target = ', v)
        this.useProvider(req)
          .adjustTarget(v, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // steer to current destination point
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/courseCurrentPoint`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .courseCurrentPoint(req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // advance to next point
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/courseNextPoint`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .courseNextPoint(req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // port tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/tack/port`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .tack('port', req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // starboard tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/tack/starboard`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .tack('starboard', req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // port gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/gybe/port`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .gybe('port', req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // starboard gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/gybe/starboard`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .gybe('starboard', req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // dodge mode ON
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/dodge`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .dodge(0, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // dodge mode OFF
    this.server.delete(
      `${AUTOPILOT_API_PATH}/:id/dodge`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .dodge(null, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    /** dodge port (-ive) / starboard (+ive) degrees */
    this.server.put(
      `${AUTOPILOT_API_PATH}/:id/dodge`,
      (req: Request, res: Response) => {
        if (typeof req.body.value !== 'number') {
          res.status(Responses.invalid.statusCode).json(Responses.invalid)
          return
        }

        const u: string = req.body.units ?? 'rad'
        let v =
          typeof u === 'string' && u.toLocaleLowerCase() === 'deg'
            ? req.body.value * (Math.PI / 180)
            : req.body.value

        debug('dodge pre-normalisation) = ', v)
        v =
          v < 0
            ? Math.max(...[0 - this.settings.maxTurn, v])
            : Math.min(...[this.settings.maxTurn, v])

        debug('dodge = ', v)
        this.useProvider(req)
          .dodge(v, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch((err) => {
            res.status(err.statusCode ?? 500).json({
              state: err.state ?? 'FAILED',
              statusCode: err.statusCode ?? 500,
              message: err.message ?? 'No autopilots available!'
            })
          })
      }
    )

    // error response
    this.server.use(
      `${AUTOPILOT_API_PATH}/*`,
      (err: any, req: Request, res: Response, next: NextFunction) => {
        const msg = {
          state: err.state ?? 'FAILED',
          statusCode: err.statusCode ?? 500,
          message: err.message ?? 'No autopilots available!'
        }
        if (res.headersSent) {
          console.log('EXCEPTION: headersSent')
          return next(msg)
        }
        res.status(500).json(msg)
      }
    )
  }

  // returns provider to use.
  private useProvider(req: Request): AutopilotProvider {
    debug(`useProvider(${req.params.id})`)

    if (req.params.id === DEFAULTIDPATH) {
      if (!this.defaultDeviceId) {
        this.initDefaults()
      }
      if (
        this.defaultProviderId &&
        this.autopilotProviders.has(this.defaultProviderId)
      ) {
        debug(`Using default device provider...`)
        return this.autopilotProviders.get(
          this.defaultProviderId
        ) as AutopilotProvider
      } else {
        debug(`No default device provider...`)
        throw Responses.invalid
      }
    } else {
      const pid = this.deviceToProvider.get(req.params.id) as string
      if (this.autopilotProviders.has(pid)) {
        debug(`Found provider...using ${pid}`)
        return this.autopilotProviders.get(pid) as AutopilotProvider
      } else {
        debug('Cannot get Provider!')
        throw Responses.invalid
      }
    }
  }

  // Returns an array of provider info
  private getDevices(): AutopilotList {
    const pilots: AutopilotList = {}
    this.deviceToProvider.forEach((providerId: string, deviceId: string) => {
      pilots[deviceId] = {
        provider: providerId,
        isDefault: deviceId === this.defaultDeviceId
      }
    })
    return pilots
  }

  /** Initialises the value of default device / provider.
   * If id is not supplied sets first registered device as the default.
   **/
  private initDefaults(deviceId?: string) {
    debug(`initDefaults()...${deviceId}`)

    // set to supplied deviceId
    if (deviceId && this.deviceToProvider.has(deviceId)) {
      this.defaultDeviceId = deviceId
      this.defaultProviderId = this.deviceToProvider.get(
        this.defaultDeviceId
      ) as string
    }
    // else set to first AP device registered
    else if (this.deviceToProvider.size !== 0) {
      const k = this.deviceToProvider.keys()
      this.defaultDeviceId = k.next().value as string
      this.defaultProviderId = this.deviceToProvider.get(
        this.defaultDeviceId
      ) as string
    } else {
      this.defaultDeviceId = undefined
      this.defaultProviderId = undefined
    }
    this.emitUpdates(
      [
        this.buildPathValue(
          'defaultPilot' as Path,
          this.defaultDeviceId ?? null
        )
      ],
      'autopilotApi' as SourceRef
    )
    debug(`Default Device = ${this.defaultDeviceId}`)
    debug(`Default Provider = ${this.defaultProviderId}`)
  }

  // build autopilot delta PathValue
  private buildPathValue(path: Path, value: Value): PathValue {
    return {
      path: `steering.autopilot${path ? '.' + path : ''}` as Path,
      value: value
    }
  }

  // emit delta updates on operation success
  private emitUpdates(values: PathValue[], source: SourceRef) {
    const msg: Delta = {
      updates: [
        {
          values: values
        }
      ]
    }
    debug(`delta -> ${source}:`, msg.updates[0])
    this.server.handleMessage(source, msg, SKVersion.v2)
    this.server.handleMessage(source, msg, SKVersion.v1)
  }
}
