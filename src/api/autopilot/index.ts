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
  TackGybeDirection, // ** test only **
  SKVersion,
  Path,
  Delta,
  isAutopilotProvider,
  AutopilotUpdateAttrib,
  isAutopilotUpdateAttrib
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

  private defaultProvider?: AutopilotProvider
  private defaultProviderId?: string
  private defaultDeviceId?: string
  private deviceToProvider: Map<string, string> = new Map()

  constructor(private server: AutopilotApplication) {}

  // ***************** test ***************
  mockProviders() {
    this.register(
      'ap-plugin1',
      {
        engage: async () => {
          debug('pv1: engage')
          return
        },
        disengage: async () => {
          debug('pv1: disengage')
          return
        },
        tack: async (direction: TackGybeDirection) => {
          debug('pv1: tack', direction)
          return
        },
        gybe: async (direction: TackGybeDirection) => {
          debug('pv1: gybe', direction)
          return
        },
        getTarget: async () => {
          debug('pv1: getTarget')
          return Math.PI
        },
        setTarget: async (value: number) => {
          debug('pv1: target', value)
          return
        },
        adjustTarget: async (value: number) => {
          debug('pv1: adjustTarget', value)
          return
        },
        setMode: async (mode: string) => {
          debug('pv1: setMode', mode)
          return
        },
        getMode: async () => {
          debug('pv1: getMode, currentMode')
          return 'currentMode'
        },
        getState: async () => {
          debug('pv1: getState, currentState')
          return 'currentState'
        },
        setState: async (state: string) => {
          debug('pv1: setState', state)
          return state === 'on' ? true : false
        },
        getData: async (id: string) => {
          debug('pv1: getData', id)
          if (id === 'dev1a') {
            return {
              options: {
                states: [
                  { name: 'on', engaged: true },
                  { name: 'off', engaged: false }
                ],
                modes: ['compass', 'gps', 'wind']
              },
              target: 0.1,
              state: 'on',
              mode: 'compass',
              engaged: true
            }
          } else {
            return {
              options: {
                states: [
                  { name: 'auto', engaged: true },
                  { name: 'standby', engaged: false }
                ],
                modes: ['compass', 'nav', 'wind']
              },
              target: 0.2,
              state: 'standby',
              mode: 'wind',
              engaged: false
            }
          }
        }
      },
      ['dev2a']
    )
    this.register(
      'ap-plugin2',
      {
        engage: async () => {
          debug('pv2: engage')
          return
        },
        disengage: async () => {
          debug('pv2: disengage')
          return
        },
        tack: async (direction: TackGybeDirection) => {
          debug('pv2: tack', direction)
          return
        },
        gybe: async (direction: TackGybeDirection) => {
          debug('pv2: gybe', direction)
          return
        },
        getTarget: async () => {
          debug('pv1: getTarget')
          return Math.PI
        },
        setTarget: async (value: number) => {
          debug('pv2: target', value)
          return
        },
        adjustTarget: async (value: number) => {
          debug('pv2: adjustTarget', value)
          return
        },
        setMode: async (mode: string) => {
          debug('pv2: setMode', mode)
          return
        },
        getMode: async () => {
          debug('pv2: getMode, currentMode')
          return 'currentMode'
        },
        setState: async (state: string) => {
          debug('pv2: setState', state)
          return state === 'enabled' ? true : false
        },
        getState: async () => {
          debug('pv2: getState, currentState')
          return 'currentState'
        },
        getData: async () => {
          debug('pv2: getData')
          return {
            options: {
              states: [
                { name: 'enabled', engaged: true },
                { name: 'standby', engaged: false }
              ],
              modes: ['compass', 'route', 'wind']
            },
            target: 0.1,
            state: 'standby',
            mode: 'wind',
            engaged: false
          }
        }
      },
      ['dev1a', 'dev1b']
    )
    //setTimeout(() => this.unRegister('ap-plugin1'), 5000)
    //this.apUpdate('ap-plugin1', 'dev1a', 'target', Math.random())
    //setInterval(() => {
    this.apUpdate('ap-plugin1', 'dev1a', 'target', Math.random())
    this.apUpdate('ap-plugin2', 'dev2a', 'engaged', false)
    this.apUpdate('ap-plugin1', 'dev1b', 'target', Math.random())
    //}, 5000)*/
  }

  async start() {
    this.initApiEndpoints()

    // ***************** test ***************
    this.mockProviders()

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
      this.defaultProvider = undefined
    }

    debug(
      `Remaining number of AutoPilot Providers registered =`,
      this.autopilotProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // Pass changed attribute / value from autopilot.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  apUpdate(
    pluginId: string,
    deviceId: string = pluginId + '.default',
    attrib: AutopilotUpdateAttrib,
    value: any
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
        if (deviceId === this.defaultDeviceId) {
          this.emitDeltaMsg(attrib, value, DEFAULTIDPATH)
        }
      } catch (err) {
        debug(`ERROR apUpdate():`, err)
      }
    } else {
      debug(`ERROR apUpdate():`, `${attrib} is NOT an AutopilotUpdateAttrib!`)
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
      this.defaultProvider = this.autopilotProviders.get(this.defaultProviderId)
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
      this.defaultProvider = this.autopilotProviders.get(this.defaultProviderId)
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
    debug(`delta:`, msg.updates[0])
    this.server.handleMessage(source, msg, SKVersion.v2)
    this.server.handleMessage(source, msg, SKVersion.v1)
  }
}
