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
  TackGybeDirection,
  SKVersion,
  Path,
  Delta,
  isAutopilotProvider,
  AutopilotStateDef,
  AutopilotUpdateAttrib,
  isAutopilotUpdateAttrib
} from '@signalk/server-api'

export const AUTOPILOT_API_PATH = `/signalk/v2/api/vessels/self/steering/autopilot`

interface AutopilotApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {}

type ProviderInfo = Array<{ id: string; pilotType: string }>

export class AutopilotApi {
  private autopilotProviders: Map<string, AutopilotProvider> = new Map()

  private defaultProvider?: AutopilotProvider
  private defaultProviderId?: string

  private apData: AutopilotInfo = {
    options: {
      states: [],
      modes: []
    },
    state: null,
    mode: null,
    target: null,
    engaged: false
  }

  constructor(private server: AutopilotApplication) {}

  // ***************** test ***************
  mockProviders() {
    this.register('ap-plugin1', {
      pilotType: 'mock-pilot-type1',
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
        return
      },
      getData: async () => {
        debug('pv1: getData')
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
      }
    })
    this.register('ap-plugin2', {
      pilotType: 'mock-pilot-type2',
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
        return
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
    })
    //setTimeout(() => this.unRegister('ap-plugin1'), 5000)
    /*setInterval(() => {
      this.apUpdate('ap-plugin1', 'target', Math.random())
      this.apUpdate('ap-plugin2', 'engaged', false)
      this.apUpdate('ap-plugin1', 'target', Math.random(), 'dev1b')
    }, 10000)*/
  }

  async start() {
    this.initApiEndpoints()

    // ***************** test ***************
    this.mockProviders()

    return Promise.resolve()
  }

  // ***** Plugin Interface methods *****

  // Register plugin as provider.
  register(pluginId: string, provider: AutopilotProvider, asDefault?: boolean) {
    debug(`** Registering provider(s)....${pluginId} ${provider?.pilotType}`)

    if (!provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!isAutopilotProvider(provider)) {
      throw new Error(
        `${pluginId} is missing AutopilotProvider properties/methods`
      )
    } else {
      if (!this.autopilotProviders.has(pluginId)) {
        this.autopilotProviders.set(pluginId, provider)
      }
    }
    if (asDefault) {
      this.changeProvider(pluginId)
    }
    debug(
      `No. of AutoPilotProviders registered =`,
      this.autopilotProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // Unregister plugin as provider.
  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Un-register plugin .....${pluginId}`)
    if (this.autopilotProviders.has(pluginId)) {
      debug(`** Un-registering autopilot provider....${pluginId}`)
      this.autopilotProviders.delete(pluginId)
    }
    if (pluginId === this.defaultProviderId) {
      if (this.autopilotProviders.size === 0) {
        debug(`** No autopilot providers registered!!!`)
        this.changeProvider()
      } else {
        const keys = this.autopilotProviders.keys()
        this.changeProvider(keys.next().value)
      }
    }
    debug(
      `No. of AutoPilotProviders registered =`,
      this.autopilotProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // Pass changed attribute / value from autopilot.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  apUpdate(
    pluginId: string,
    attrib: AutopilotUpdateAttrib,
    value: any,
    deviceId?: string
  ) {
    if (isAutopilotUpdateAttrib(attrib)) {
      ;(this.apData as any)[attrib] = value
      this.emitDeltaMsg(
        attrib,
        value,
        pluginId ? `${pluginId}${deviceId ? '.' + deviceId : ''}` : undefined
      )
      try {
        if (!this.defaultProviderId) {
          this.initDefaultProvider(pluginId)
        }
        if (pluginId === this.defaultProviderId) {
          this.emitDeltaMsg(attrib, value)
        }
      } catch (err) {
        debug(`apUpdate():`, err)
      }
    } else {
      debug(`${attrib} is NOT an AutopilotUpdateAttrib!`)
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
          if (
            req.params[0].indexOf('providers') === -1 &&
            !this.defaultProviderId
          ) {
            this.initDefaultProvider()
          }
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

    // get autopilot status & options
    this.server.get(
      `${AUTOPILOT_API_PATH}`,
      async (req: Request, res: Response) => {
        try {
          if (!this.defaultProviderId) {
            this.initDefaultProvider()
          }
          this.apData = (await this.useProvider(
            req
          )?.getData()) as AutopilotInfo
          debug(this.apData)
          res.json(this.apData)
        } catch (err: any) {
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: err.message ?? 'No autopilots available!'
          })
        }
      }
    )

    // get autopilot options
    this.server.get(
      `${AUTOPILOT_API_PATH}/options`,
      async (req: Request, res: Response) => {
        const r = await this.useProvider(req)?.getData()
        debug(r?.options)
        res.json(r?.options)
      }
    )

    // get autopilot provider information
    this.server.get(
      `${AUTOPILOT_API_PATH}/providers`,
      async (req: Request, res: Response) => {
        res.status(200).json({
          providers: this.getProviders(),
          defaultProvider: this.defaultProviderId
        })
      }
    )

    // set default autopilot provider
    this.server.post(
      `${AUTOPILOT_API_PATH}/providers/:id`,
      async (req: Request, res: Response) => {
        debug(`params:`, req.params)
        if (!this.autopilotProviders.has(req.params.id)) {
          debug('** Invalid provider id supplied...')
          res.status(400).json(Responses.invalid)
          return
        }
        this.changeProvider(req.params.id)
        return res.status(200).json(Responses.ok)
      }
    )

    // engage / enable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/engage`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.engage()
        this.emitDeltaMsg('engaged', true)
        return res.status(200).json(Responses.ok)
      }
    )

    // disengage / disable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/disengage`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.disengage()
        this.emitDeltaMsg('engaged', false)
        return res.status(200).json(Responses.ok)
      }
    )

    // get state
    this.server.get(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response) => {
        const r = await this.useProvider(req)?.getState()
        debug(r)
        return res.json({ value: r })
      }
    )

    // set state
    this.server.put(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response) => {
        let matchedState: AutopilotStateDef | undefined

        const isValidState = (state: string) => {
          const st = this.apData.options.states.filter(
            (i: AutopilotStateDef) => i.name === state
          )
          matchedState = st.length > 0 ? st[0] : undefined
          return st.length > 0
        }
        if (
          typeof req.body.value === 'undefined' ||
          !isValidState(req.body.value)
        ) {
          res.status(400).json(Responses.invalid)
          return
        }
        await this.useProvider(req)?.setState(req.body.value)
        this.emitDeltaMsg('state', matchedState?.name)
        this.emitDeltaMsg('engaged', matchedState?.engaged)
        return res.status(200).json(Responses.ok)
      }
    )

    // get mode
    this.server.get(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response) => {
        const r = await this.useProvider(req)?.getMode()
        debug(r)
        return res.json({ value: r })
      }
    )

    // set mode
    this.server.put(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response) => {
        if (
          typeof req.body.value === 'undefined' ||
          !this.apData.options.modes.includes(req.body.value)
        ) {
          res.status(400).json(Responses.invalid)
          return
        }
        await this.useProvider(req)?.setMode(req.body.value)
        this.emitDeltaMsg('mode', req.body.value)
        return res.status(200).json(Responses.ok)
      }
    )

    // get target
    this.server.get(
      `${AUTOPILOT_API_PATH}/target`,
      async (req: Request, res: Response) => {
        const r = await this.useProvider(req)?.getTarget()
        debug(r)
        return res.json({ value: r })
      }
    )

    // set target
    this.server.put(
      `${AUTOPILOT_API_PATH}/target`,
      async (req: Request, res: Response) => {
        if (typeof req.body.value !== 'number') {
          res.status(400).json(Responses.invalid)
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
        await this.useProvider(req)?.setTarget(req.body.value)
        this.emitDeltaMsg('target', req.body.value)
        return res.status(200).json(Responses.ok)
      }
    )

    // adjust target
    this.server.put(
      `${AUTOPILOT_API_PATH}/target/adjust`,
      async (req: Request, res: Response) => {
        if (typeof req.body.value !== 'number') {
          res.status(400).json(Responses.invalid)
          return
        }
        const s = req.body.value + this.apData.target
        if (s < 0 - Math.PI || s > 2 * Math.PI) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error: Value supplied is outside of the valid range (-PI < value < 2*PI radians).`
          })
          return
        }
        await this.useProvider(req)?.adjustTarget(req.body.value)
        return res.status(200).json(Responses.ok)
      }
    )

    // port tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/tack/port`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.tack('port')
        return res.status(200).json(Responses.ok)
      }
    )

    // starboard tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/tack/starboard`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.tack('starboard')
        return res.status(200).json(Responses.ok)
      }
    )

    // port gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/gybe/port`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.gybe('port')
        return res.status(200).json(Responses.ok)
      }
    )

    // starboard gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/gybe/starboard`,
      async (req: Request, res: Response) => {
        await this.useProvider(req)?.gybe('starboard')
        return res.status(200).json(Responses.ok)
      }
    )

    // error response
    this.server.use(
      `${AUTOPILOT_API_PATH}/*`,
      (err: any, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
          return next({
            state: 'FAILED',
            statusCode: 500,
            message: err.message ?? 'No autopilots available!'
          })
        }
        res.status(500)
        res.render('error', { error: err })
      }
    )
  }

  // returns provider to use.
  private useProvider(req: Request): AutopilotProvider | undefined {
    debug(`useProvider()`, req.query)
    const id = req.query.provider as string
    if (!id) {
      if (
        this.defaultProviderId &&
        this.autopilotProviders.has(this.defaultProviderId)
      ) {
        debug(`Using default provider...`)
        return this.autopilotProviders.get(
          this.defaultProviderId
        ) as AutopilotProvider
      } else {
        debug(`No default provider...`)
        return
      }
    }
    if (this.autopilotProviders.has(id)) {
      debug(`Found provider...using ${id}`)
      return this.autopilotProviders.get(id) as AutopilotProvider
    } else {
      debug('Cannot get Provider!')
      return
    }
  }

  // Returns an array of provider info
  private getProviders(): ProviderInfo {
    const providers: ProviderInfo = []
    this.autopilotProviders.forEach((v: AutopilotProvider, k: string) => {
      providers.push({
        id: k,
        pilotType: v.pilotType
      })
    })
    return providers
  }

  /** Initialises the value of default provider to the supplied id.
   * If id is not supplied sets first registered Provider as the default.
   **/
  private initDefaultProvider(id?: string) {
    debug(`initDefaultProvider()...${id}`)
    if (id && this.autopilotProviders.has(id)) {
      this.defaultProviderId = id
      this.defaultProvider = this.autopilotProviders.get(id)
      debug(`Default Provider = ${this.defaultProviderId}`)
      return
    }
    if (this.autopilotProviders.size !== 0) {
      const k = this.autopilotProviders.keys()
      this.defaultProviderId = k.next().value as string
      this.defaultProvider = this.autopilotProviders.get(this.defaultProviderId)
      debug(`Default Provider = ${this.defaultProviderId}`)
    } else {
      throw new Error('Cannot set defaultProvider....No providers registered!')
    }
  }

  /** Change default provider to supplied id, update apData and emit delta(s)
   * When no id is supplied === last provider unregistered
   **/
  private changeProvider(id?: string) {
    debug('Changing defaultProvider to:', id)
    if (!id) {
      this.defaultProviderId = undefined
      this.defaultProvider = undefined
      debug('defaultProvider = ', id)
      this.apData = {
        options: {
          states: [],
          modes: []
        },
        state: null,
        mode: null,
        target: null,
        engaged: false
      }
      this.emitDeltaMsg('mode', null)
      this.emitDeltaMsg('state', null)
      this.emitDeltaMsg('target', null)
      this.emitDeltaMsg('engaged', null)
    } else {
      if (!this.autopilotProviders.has(id)) {
        debug(
          `providerId not found!....${id}`,
          'default = ',
          this.defaultProviderId
        )
        return
      }
      this.defaultProviderId = id
      this.defaultProvider = this.autopilotProviders.get(id)
      this.defaultProvider?.getData().then((data: AutopilotInfo) => {
        this.apData = data
        this.emitDeltaMsg('mode', data.mode)
        this.emitDeltaMsg('state', data.state)
        this.emitDeltaMsg('target', data.target)
        this.emitDeltaMsg('engaged', data.engaged)
      })
      debug('defaultProvider = ', this.defaultProviderId)
    }
  }

  // emit delta updates on operation success
  private emitDeltaMsg(path: string, value: any, source?: string) {
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
    this.server.handleMessage(source ?? 'autopilotApi', msg, SKVersion.v2)
    this.server.handleMessage(source ?? 'autopilotApi', msg, SKVersion.v1)
  }
}
