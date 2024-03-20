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
  Notification,
  Delta,
  isAutopilotProvider,
  AutopilotUpdateAttrib,
  isAutopilotUpdateAttrib,
  AutopilotAlarm,
  isAutopilotAlarm
} from '@signalk/server-api'

const AUTOPILOT_API_PATH = `/signalk/v2/api/vessels/self/steering/autopilots`
const DEFAULTIDPATH = 'default'

interface AutopilotApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {}

interface AutopilotList {
  [id: string]: { provider: string; isDefault: boolean }
}

export class AutopilotApi {
  private autopilotProviders: Map<string, AutopilotProvider> = new Map()

  private defaultProviderId?: string
  private defaultDeviceId?: string
  private deviceToProvider: Map<string, string> = new Map()

  constructor(private server: AutopilotApplication) {}

  async start() {
    this.initApiEndpoints()
    return Promise.resolve()
  }

  // ***** Plugin Interface methods *****

  // Register plugin as provider.
  register(pluginId: string, provider: AutopilotProvider, devices: string[]) {
    debug(`** Registering provider(s)....${pluginId} ${provider}`)

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
      this.emitDeltaMsg('defaultPilot', this.defaultDeviceId, 'autopilotApi')
    }

    debug(
      `Remaining number of AutoPilot Providers registered =`,
      this.autopilotProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // Pass changed attribute / value from autopilot.
  apUpdate(
    pluginId: string,
    deviceId: string = pluginId + '.default',
    attrib: AutopilotUpdateAttrib,
    value: Value
  ) {
    if (deviceId && !this.deviceToProvider.has(deviceId)) {
      this.deviceToProvider.set(deviceId, pluginId)
    }
    if (isAutopilotUpdateAttrib(attrib)) {
      try {
        if (!this.defaultDeviceId) {
          this.initDefaults(deviceId)
        }
        this.emitDeltaMsg(attrib, value, deviceId)
      } catch (err) {
        debug(`ERROR apUpdate(): ${pluginId}->${deviceId}`, err)
      }
    } else {
      debug(
        `ERROR apUpdate(): ${pluginId}->${deviceId}`,
        `${attrib} is NOT an AutopilotUpdateAttrib!`
      )
    }
  }

  // Pass alarm / notification from autopilot.
  apAlarm(
    pluginId: string,
    deviceId: string = pluginId + '.default',
    alarmName: AutopilotAlarm,
    value: Notification
  ) {
    if (isAutopilotAlarm(alarmName)) {
      debug(`Alarm -> ${deviceId}:`, value)
      this.server.handleMessage(deviceId, {
        updates: [
          {
            values: [
              {
                path: `notifications.steering.autopilot.${alarmName}` as Path,
                value: value
              }
            ]
          }
        ]
      })
    }
  }

  // ***** /Plugin Interface methods *****

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'steering.autopilot'
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
      `${AUTOPILOT_API_PATH}/defaultPilot`,
      (req: Request, res: Response) => {
        debug(`params:`, req.params)
        res.status(Responses.ok.statusCode).json({ id: this.defaultDeviceId })
      }
    )

    // set default autopilot device
    this.server.post(
      `${AUTOPILOT_API_PATH}/defaultPilot/:id`,
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
          .then((r: string) => {
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
          .then((r: boolean) => {
            debug('engaged =', r)
            this.emitDeltaMsg('engaged', r, req.params.id)
            if (req.params.id === this.defaultDeviceId) {
              this.emitDeltaMsg('engaged', r, DEFAULTIDPATH)
            }
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch(() => {
            res.status(Responses.invalid.statusCode).json(Responses.invalid)
          })
      }
    )

    // get mode
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/mode`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getMode(req.params.id)
          .then((r: string) => {
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
          .catch(() => {
            res.status(Responses.invalid.statusCode).json(Responses.invalid)
          })
      }
    )

    // get target
    this.server.get(
      `${AUTOPILOT_API_PATH}/:id/target`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .getTarget(req.params.id)
          .then((r: number) => {
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
        if (req.body.value < 0 - Math.PI || req.body.value > 2 * Math.PI) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error: Value supplied is outside of the valid range (-PI < value < 2*PI radians).`
          })
          return
        }
        this.useProvider(req)
          .setTarget(req.body.value, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch(() => {
            res.status(Responses.invalid.statusCode).json(Responses.invalid)
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
        this.useProvider(req)
          .adjustTarget(req.body.value, req.params.id)
          .then(() => {
            res.status(Responses.ok.statusCode).json(Responses.ok)
          })
          .catch(() => {
            res.status(Responses.invalid.statusCode).json(Responses.invalid)
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

    // dodge to port
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/dodge/port`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .dodge('port', req.params.id)
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

    // dodge to starboard
    this.server.post(
      `${AUTOPILOT_API_PATH}/:id/dodge/starboard`,
      (req: Request, res: Response) => {
        this.useProvider(req)
          .dodge('starboard', req.params.id)
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
      this.emitDeltaMsg('defaultPilot', this.defaultDeviceId, 'autopilotApi')
      debug(`Default Device = ${this.defaultDeviceId}`)
      debug(`Default Provider = ${this.defaultProviderId}`)
      return
    }

    // else set to first AP device registered
    if (this.deviceToProvider.size !== 0) {
      const k = this.deviceToProvider.keys()
      this.defaultDeviceId = k.next().value as string
      this.defaultProviderId = this.deviceToProvider.get(
        this.defaultDeviceId
      ) as string
      this.emitDeltaMsg('defaultPilot', this.defaultDeviceId, 'autopilotApi')
      debug(`Default Device = ${this.defaultDeviceId}`)
      debug(`Default Provider = ${this.defaultProviderId}`)
      return
    } else {
      throw new Error(
        'Cannot set defaultDevice....No autopilot devices registered!'
      )
    }
  }

  // emit delta updates on operation success
  private emitDeltaMsg(path: string, value: any, source: string) {
    const msg: Delta = {
      updates: [
        {
          values: [
            {
              path: `steering.autopilot${path ? '.' + path : ''}` as Path,
              value: value
            }
          ]
        }
      ]
    }
    debug(`delta -> ${source}:`, msg.updates[0])
    this.server.handleMessage(source, msg, SKVersion.v2)
    this.server.handleMessage(source, msg, SKVersion.v1)
  }
}
