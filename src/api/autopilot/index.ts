/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:autopilot')

import {
  AutopilotProvider,
  AutopilotProviderMethods
} from '@signalk/server-api'

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
  private autopilotProvider: AutopilotProviderMethods | null = null

  constructor(app: AutopilotApplication) {
    this.initAutopilotRoutes(app)
  }

  async start() {
    debug('starting... autopilot API')
    return Promise.resolve()
  }

  register(pluginId: string, provider: AutopilotProvider) {
    debug(`** Registering provider(s)....${pluginId} ${provider?.pilotType}`)
    if (!provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!provider.pilotType) {
      throw new Error(`Invalid AutoPilotProvider.pilotType value!`)
    }
    if (!this.autopilotProvider) {
      if (
        !provider.methods.getConfig ||
        !provider.methods.getState ||
        !provider.methods.setState ||
        !provider.methods.getMode ||
        !provider.methods.setMode ||
        !provider.methods.setTarget ||
        !provider.methods.adjustTarget ||
        !provider.methods.tack ||
        typeof provider.methods.getConfig !== 'function' ||
        typeof provider.methods.getState !== 'function' ||
        typeof provider.methods.setState !== 'function' ||
        typeof provider.methods.getMode !== 'function' ||
        typeof provider.methods.setMode !== 'function' ||
        typeof provider.methods.setTarget !== 'function' ||
        typeof provider.methods.adjustTarget !== 'function' ||
        typeof provider.methods.tack !== 'function'
      ) {
        throw new Error(`Error missing AutoPilotProvider.methods!`)
      } else {
        provider.methods.pluginId = pluginId
        this.autopilotProvider = provider.methods
      }
      debug('AutoPilotProvider = ' + JSON.stringify(this.autopilotProvider))
    } else {
      const msg = `Error: Autopilot ${provider?.pilotType} already registered!`
      debug(msg)
      throw new Error(msg)
    }
  }

  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Un-registering ${pluginId} as autopilot provider....`)
    if (this.autopilotProvider?.pluginId === pluginId) {
      debug(`** Un-registering ${pluginId}....`)
      this.autopilotProvider = null
    }
    debug(JSON.stringify(this.autopilotProvider))
  }
  /*
  getStates() {
    debug(`** getStates()`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`o autopilot provider!`))
    }
    return this.autopilotProvider?.getStates()
  }

  setState(state: string) {
    debug(`** setState(${state})`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`No autopilot provider!`))
    }
    return this.autopilotProvider?.setState(state)
  }

  getModes() {
    debug(`** getModes()`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`No autopilot provider!`))
    }
    return this.autopilotProvider?.getModes()
  }

  setMode(mode: string) {
    debug(`** setMode(${mode})`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`No autopilot provider!`))
    }
    return this.autopilotProvider?.setMode(mode)
  }

  setTarget(value: number) {
    debug(`** setTarget(${value})`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`No autopilot provider!`))
    }
    return this.autopilotProvider?.setTarget(value)
  }

  adjustTarget(value: number) {
    debug(`** adjustTarget(${value})`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`o autopilot provider!`))
    }
    return this.autopilotProvider?.adjustTarget(value)
  }

  tack(port: boolean) {
    debug(`** tack(${port})`)
    if (!this.autopilotProvider) {
      return Promise.reject(new Error(`No autopilot provider!`))
    }
    return this.autopilotProvider?.tack(port)
  }
  */

  private initAutopilotRoutes(server: AutopilotApplication) {
    const updateAllowed = (req: Request): boolean => {
      
      return server.securityStrategy.shouldAllowPut(
        req,
        'vessels.self',
        null,
        'resources'
      )
    }

    // facilitate retrieval of autopilot configuration values
    server.get(
      `${AUTOPILOT_API_PATH}/config`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/config`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }
        try {
          const retVal = await this.autopilotProvider?.getConfig()
          res.json(retVal)
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error retrieving Autopilot configuration!`
          })
        }
      }
    )

    // facilitate retrieval of autopilot state
    server.get(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/state`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }
        try {
          const retVal = await this.autopilotProvider?.getState()
          res.json(retVal)
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error retrieving Autopilot state!`
          })
        }
      }
    )

    // facilitate retrieval of all valid autopilot modes
    server.get(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${AUTOPILOT_API_PATH}/mode`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }
        try {
          const retVal = await this.autopilotProvider?.getMode()
          res.json(retVal)
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error retrieving Autopilot mode!`
          })
        }
      }
    )

    // engage / enable the autopilot
    server.put(
      `${AUTOPILOT_API_PATH}/engage`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/engage`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        try {
          await this.autopilotProvider?.engage(true)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error setting engaging the autopilot!`
          })
        }
      }
    )

    // dis-engage / disable the autopilot
    server.put(
      `${AUTOPILOT_API_PATH}/disengage`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/disengage`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        try {
          await this.autopilotProvider?.engage(false)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error setting disengaging the autopilot!`
          })
        }
      }
    )

    // facilitate setting of autopilot state
    server.put(
      `${AUTOPILOT_API_PATH}/state`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/state`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        if (typeof req.body.value === 'undefined') {
          res.status(400).json(Responses.invalid)
          return
        }

        try {
          await this.autopilotProvider?.setState(req.body.value)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error setting autopilot state!`
          })
        }
      }
    )

    // facilitate setting of autopilot mode
    server.put(
      `${AUTOPILOT_API_PATH}/mode`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/mode`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        if (typeof req.body.value === 'undefined') {
          res.status(400).json(Responses.invalid)
          return
        }

        try {
          await this.autopilotProvider?.setMode(req.body.value)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error setting autopilot mode!`
          })
        }
      }
    )

    // facilitate setting of autopilot increment / decrement (+/-10)
    server.put(
      `${AUTOPILOT_API_PATH}/target/adjust`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/adjustTarget`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        if (
          typeof req.body.value !== 'number' ||
          !(req.body.value >= -10 && req.body.value <= 10)
        ) {
          res.status(400).json(Responses.invalid)
          return
        }

        try {
          await this.autopilotProvider?.adjustTarget(req.body.value)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error setting autopilot target!`
          })
        }
      }
    )

    // facilitate setting of autopilot target (-179 -> 359)
    server.put(
      `${AUTOPILOT_API_PATH}/target`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/target`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.body)
        if (
          typeof req.body.value !== 'number' ||
          !(req.body.value >= -179 && req.body.value < 360)
        ) {
          res.status(400).json(Responses.invalid)
          return
        }

        try {
          await this.autopilotProvider?.setTarget(req.body.value)

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error setting autopilot target!`
          })
        }
      }
    )

    // facilitate tack port / starboard
    server.put(
      `${AUTOPILOT_API_PATH}/tack/:direction`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${AUTOPILOT_API_PATH}/tack`)
        if (!this.autopilotProvider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        debug(req.params.direction)
        if (!['port','starboard'].includes(req.params.direction)) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Invalid request path! (${req.params.direction})`
          })
          return
        }

        try {
          await this.autopilotProvider?.tack(req.params.direction === 'port')

          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: Responses.ok
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error setting autopilot mode!`
          })
        }
      }
    )
  }
}
