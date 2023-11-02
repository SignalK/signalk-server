/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:autopilot')

import { IRouter, Request, Response } from 'express'
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
  isAutopilotProvider
} from '@signalk/server-api'

export const AUTOPILOT_API_PATH = `/signalk/v2/api/vessels/self/steering/autopilot`

interface AutopilotApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {}

type ProviderInfo = Array<{ id: string; pilotType: string }>

export class AutopilotApi {
  private autopilotProviders: Map<string, AutopilotProvider> = new Map()

  private primaryProvider?: AutopilotProvider
  private primaryProviderId?: string

  constructor(private server: AutopilotApplication) {}

  // ***************** test ***************
  mockProviders() {
    this.register('mock-plugin-1-id', {
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
            states: ['on', 'off'],
            modes: ['compass', 'gps', 'wind']
          },
          target: 0.1,
          state: 'on',
          mode: 'compass',
          engaged: true
        }
      }
    })
    this.register(
      'mock-plugin-2-id',
      {
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
              states: ['enabled', 'standby'],
              modes: ['compass', 'route', 'wind']
            },
            target: 0.1,
            state: 'standby',
            mode: 'wind',
            engaged: false
          }
        }
      },
      true
    )
  }

  async start() {
    this.initApiEndpoints()

    // ***************** test ***************
    this.mockProviders()

    return Promise.resolve()
  }

  register(pluginId: string, provider: AutopilotProvider, primary?: boolean) {
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
    if (this.autopilotProviders.size === 1 || primary) {
      this.changeProvider(pluginId)
    }
    debug(
      `AutoPilotProviders =`,
      this.autopilotProviders,
      'Active Provider:',
      this.primaryProvider
    )
  }

  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Un-registering ${pluginId} plugin as a autopilot provider....`)
    if (this.autopilotProviders.has(pluginId)) {
      debug(`** Un-registering autopilot provider....`)
      this.autopilotProviders.delete(pluginId)
    }
    if (pluginId === this.primaryProviderId) {
      if (this.autopilotProviders.size === 0) {
        debug(`** No autopilot providers registered!!!`)
        this.changeProvider('')
      } else {
        const keys = this.autopilotProviders.keys()
        this.changeProvider(keys.next().value)
      }
    }
    debug(`primaryProvider = ${this.primaryProvider}`)
  }

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

    // get autopilot status & options
    this.server.get(
      `${AUTOPILOT_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}`)
        try {
          this.checkforProvider()
          const r = await this.primaryProvider?.getData()
          debug(r)
          // target, mode, state, engaged, options
          return res.json(r)
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // get autopilot options
    this.server.get(
      `${AUTOPILOT_API_PATH}/options`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/options`)
        try {
          this.checkforProvider()
          const r = await this.primaryProvider?.getData()
          debug(r?.options)
          // target, mode, state, engaged, options
          return res.json(r?.options)
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // get autopilot provider information
    this.server.get(
      `${AUTOPILOT_API_PATH}/providers`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/providers`)
        res.status(200).json({
          providers: this.getProviders(),
          primary: this.primaryProvider
        })
      }
    )

    // set primary autopilot provider
    this.server.post(
      `${AUTOPILOT_API_PATH}/providers/primary`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/providers/primary`)
        debug('req.body:', req.body)
        try {
          this.parseOperationRequest(req)
          if (!this.autopilotProviders.has(req.body.value)) {
            debug('** Invalid provider id supplied...')
            res.status(404).json({
              state: 'FAILED',
              statusCode: 404,
              message: `Invalid provider id supplied!`
            })
            return
          }
          this.changeProvider(req.body.value)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // engage / enable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/engage`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/engage`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.engage()
          // emit delta
          this.emitDeltaMsg('engaged', true)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // disengage / disable the autopilot
    this.server.post(
      `${AUTOPILOT_API_PATH}/disengage`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/disengage`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.disengage()
          // emit delta
          this.emitDeltaMsg('engaged', false)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // get state
    this.server.get(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/state`)
        try {
          this.checkforProvider()
          const r = await this.primaryProvider?.getState()
          debug(r)
          return res.json({ value: r })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // set state
    this.server.put(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/state`)
        debug('req.body:', req.body)
        try {
          this.parseOperationRequest(req)
          if (typeof req.body.value === 'undefined') {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Error: Invalid value supplied!`
            })
            return
          }
          // *** TO DO VALIDATE VALUE (in list of valid states)
          await this.primaryProvider?.setState(req.body.value)
          // emit delta
          this.emitDeltaMsg('state', req.body.value)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // get mode
    this.server.get(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/mode`)
        try {
          this.checkforProvider()
          const r = await this.primaryProvider?.getMode()
          debug(r)
          return res.json({ value: r })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // set mode
    this.server.put(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/mode`)
        debug('req.body:', req.body)
        try {
          this.parseOperationRequest(req)
          if (typeof req.body.value === 'undefined') {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Error: Invalid value supplied!`
            })
            return
          }
          // *** TO DO VALIDATE VALUE (in list of valid modes)
          await this.primaryProvider?.setMode(req.body.value)
          // emit delta
          this.emitDeltaMsg('mode', req.body.value)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // get target
    this.server.get(
      `${AUTOPILOT_API_PATH}/target`,
      async (req: Request, res: Response) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/target`)
        try {
          this.checkforProvider()
          const r = await this.primaryProvider?.getTarget()
          debug(r)
          return res.json({ value: r })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // set target
    this.server.put(
      `${AUTOPILOT_API_PATH}/target`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/target`)
        debug('req.body:', req.body)
        try {
          this.parseOperationRequest(req)
          if (typeof req.body.value !== 'number') {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Error: Invalid value supplied!`
            })
            return
          }
          // *** TO DO VALIDATE VALUE -180 < value < 360 (in radians)
          await this.primaryProvider?.setTarget(req.body.value)
          // emit delta
          this.emitDeltaMsg('target', req.body.value)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // adjust target
    this.server.put(
      `${AUTOPILOT_API_PATH}/target/adjust`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/target/adjust`)
        debug('req.body:', req.body)
        try {
          this.parseOperationRequest(req)
          if (typeof req.body.value !== 'number') {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Error: Invalid value supplied!`
            })
            return
          }
          // *** TO DO VALIDATE VALUE -10 <= value <= 10 (in radians)
          await this.primaryProvider?.adjustTarget(req.body.value)
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // port tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/tack/port`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/tack/port`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.tack('port')
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // starboard tack
    this.server.post(
      `${AUTOPILOT_API_PATH}/tack/starboard`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/tack/starboard`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.tack('starboard')
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // port gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/gybe/port`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/gybe/port`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.gybe('port')
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )

    // starboard gybe
    this.server.post(
      `${AUTOPILOT_API_PATH}/gybe/starboard`,
      async (req: Request, res: Response) => {
        debug(`** POST ${AUTOPILOT_API_PATH}/gybe/starboard`)
        try {
          this.parseOperationRequest(req)
          await this.primaryProvider?.gybe('starboard')
          return res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err: any) {
          res.status(err.statusCode ?? 400).json({
            state: err.state ?? 'FAILED',
            statusCode: err.statusCode ?? 400,
            message: err.message ?? 'Autopilot provider error!'
          })
        }
      }
    )
  }

  /** Check for provider and update permission
   * throws on error
   */
  private parseOperationRequest(req: Request) {
    this.checkforProvider()
    if (!this.updateAllowed(req)) {
      debug('** Update NOT allowed...')
      throw Responses.unauthorised
    }
  }

  /** Check for an active provider
   * throws on error
   */
  private checkforProvider() {
    if (!this.primaryProvider) {
      debug('** No provider found...')
      throw {
        message: `No Provider found!`,
        statusCode: 404
      }
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

  // action to take when provider changed
  private changeProvider(id: string) {
    debug('Changing primaryProvider to:', id)
    this.primaryProviderId = id
    this.primaryProvider = this.autopilotProviders.get(id)
    this.primaryProvider?.getData().then((data: AutopilotInfo) => {
      this.server.handleMessage(
        this.primaryProviderId as string,
        {
          updates: [
            {
              values: [
                {
                  path: `steering.autopilot` as Path,
                  value: data
                }
              ]
            }
          ]
        },
        SKVersion.v2
      )
    })
  }

  // emit delta updates on operation success
  private emitDeltaMsg(path: string, value: any) {
    const msg: Delta = {
      updates: [
        {
          values: [
            {
              path: `steering.autopilot.${path}` as Path,
              value: value
            }
          ]
        }
      ]
    }
    this.server.handleMessage(
      this.primaryProviderId as string,
      msg,
      SKVersion.v2
    )
    this.server.handleMessage(
      this.primaryProviderId as string,
      msg,
      SKVersion.v1
    )
  }
}
