/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:radar')

import { IRouter, Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { SignalKMessageHub } from '../../app'

import { radar } from '@signalk/server-api'

const RADAR_API_PATH = `/signalk/v2/api/vessels/self/radars`

interface RadarApplication
  extends WithSecurityStrategy, SignalKMessageHub, IRouter {}

export class RadarApi {
  private radarProviders: Map<string, radar.RadarProvider> = new Map()
  private defaultProviderId?: string

  constructor(private app: RadarApplication) {}

  async start() {
    this.initApiEndpoints()
    return Promise.resolve()
  }

  // ***** Plugin Interface methods *****

  /**
   * Register plugin as radar provider.
   */
  register(pluginId: string, provider: radar.RadarProvider) {
    debug(`** Registering radar provider... ${pluginId}`)

    if (!pluginId || !provider) {
      throw new Error(`Error registering radar provider ${pluginId}!`)
    }
    if (!radar.isRadarProvider(provider)) {
      throw new Error(
        `${pluginId} is missing RadarProvider properties/methods!`
      )
    } else {
      if (!this.radarProviders.has(pluginId)) {
        this.radarProviders.set(pluginId, provider)
      }
      if (this.radarProviders.size === 1) {
        this.defaultProviderId = pluginId
      }
    }
    debug(`No. of RadarProviders registered =`, this.radarProviders.size)
  }

  /**
   * Unregister plugin as radar provider.
   */
  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Request to un-register radar provider... ${pluginId}`)

    if (!this.radarProviders.has(pluginId)) {
      debug(`** NOT FOUND... ${pluginId}... cannot un-register!`)
      return
    }

    debug(`** Un-registering radar provider... ${pluginId}`)
    this.radarProviders.delete(pluginId)
    if (pluginId === this.defaultProviderId) {
      this.defaultProviderId = undefined
    }
    // update defaultProviderId if required
    if (this.radarProviders.size !== 0 && !this.defaultProviderId) {
      this.defaultProviderId = this.radarProviders.keys().next().value
    }
    debug(
      `Remaining number of Radar Providers registered =`,
      this.radarProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // ***** Server API methods *****

  /**
   * Get list of all radars from all providers.
   */
  async getRadars(): Promise<radar.RadarInfo[]> {
    const radars: radar.RadarInfo[] = []
    for (const [pluginId, provider] of this.radarProviders) {
      try {
        const radarIds = await provider.methods.getRadars()
        for (const radarId of radarIds) {
          const info = await provider.methods.getRadarInfo(radarId)
          if (info) {
            radars.push(info)
          }
        }
      } catch (err: any) {
        debug(`Error getting radars from ${pluginId}: ${err.message}`)
      }
    }
    return radars
  }

  /**
   * Get info for a specific radar by ID.
   */
  async getRadarInfo(radarId: string): Promise<radar.RadarInfo | null> {
    // Search all providers for this radar
    for (const [pluginId, provider] of this.radarProviders) {
      try {
        const radarIds = await provider.methods.getRadars()
        if (radarIds.includes(radarId)) {
          return await provider.methods.getRadarInfo(radarId)
        }
      } catch (err: any) {
        debug(`Error checking radar ${radarId} in ${pluginId}: ${err.message}`)
      }
    }
    return null
  }

  // ***** Private methods *****

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'radar'
    )
  }

  /**
   * Find the provider that owns a specific radar.
   */
  private async findProviderForRadar(
    radarId: string
  ): Promise<radar.RadarProviderMethods | null> {
    for (const [pluginId, provider] of this.radarProviders) {
      try {
        const radarIds = await provider.methods.getRadars()
        if (radarIds.includes(radarId)) {
          return provider.methods
        }
      } catch (err: any) {
        debug(`Error checking radar ${radarId} in ${pluginId}: ${err.message}`)
      }
    }
    return null
  }

  private initApiEndpoints() {
    debug(`** Initialise ${RADAR_API_PATH} endpoints. **`)

    // Disable caching for all radar API endpoints
    // Radar data can change at any time (model identification, status, controls)
    this.app.use(`${RADAR_API_PATH}`, (_req: Request, res: Response, next) => {
      res.setHeader('Cache-Control', 'no-cache')
      next()
    })

    // GET /radars - List all radars
    this.app.get(`${RADAR_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      try {
        const radars = await this.getRadars()
        res.status(200).json(radars)
      } catch (err: any) {
        res.status(500).json({
          statusCode: 500,
          state: 'FAILED',
          message: err.message
        })
      }
    })

    // GET /radars/_providers - List registered providers
    this.app.get(
      `${RADAR_API_PATH}/_providers`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const r: radar.RadarProviders = {}
          this.radarProviders.forEach((v: radar.RadarProvider, k: string) => {
            r[k] = {
              name: v.name,
              isDefault: k === this.defaultProviderId
            }
          })
          res.status(200).json(r)
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/_providers/_default - Get default provider
    this.app.get(
      `${RADAR_API_PATH}/_providers/_default`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          res.status(200).json({
            id: this.defaultProviderId
          })
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // POST /radars/_providers/_default/:id - Set default provider
    this.app.post(
      `${RADAR_API_PATH}/_providers/_default/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          if (!req.params.id) {
            throw new Error('Provider id not supplied!')
          }
          if (this.radarProviders.has(req.params.id)) {
            this.defaultProviderId = req.params.id
            res.status(200).json({
              statusCode: 200,
              state: 'COMPLETED',
              message: `Default provider set to ${req.params.id}.`
            })
          } else {
            throw new Error(`Provider ${req.params.id} not found!`)
          }
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/:id - Get specific radar info
    this.app.get(
      `${RADAR_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const radarInfo = await this.getRadarInfo(req.params.id)
          if (radarInfo) {
            res.status(200).json(radarInfo)
          } else {
            res.status(404).json(Responses.notFound)
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id - Update radar controls
    this.app.put(
      `${RADAR_API_PATH}/:id`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setControls) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setControls'
            })
            return
          }
          const controls: Partial<radar.RadarControls> =
            req.body.value ?? req.body
          const success = await provider.setControls(req.params.id, controls)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to update radar controls'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/power - Set radar power state
    this.app.put(
      `${RADAR_API_PATH}/:id/power`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setPower) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setPower'
            })
            return
          }
          const state: radar.RadarStatus = req.body.value
          if (!['off', 'standby', 'transmit', 'warming'].includes(state)) {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message:
                'Invalid power state. Must be: off, standby, transmit, or warming'
            })
            return
          }
          const success = await provider.setPower(req.params.id, state)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to set radar power state'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/range - Set radar range
    this.app.put(
      `${RADAR_API_PATH}/:id/range`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setRange) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setRange'
            })
            return
          }
          const range: number = req.body.value
          if (typeof range !== 'number' || range <= 0) {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Invalid range value. Must be a positive number (meters)'
            })
            return
          }
          const success = await provider.setRange(req.params.id, range)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to set radar range'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/gain - Set radar gain
    this.app.put(
      `${RADAR_API_PATH}/:id/gain`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setGain) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setGain'
            })
            return
          }
          const gain: { auto: boolean; value?: number } =
            typeof req.body.value === 'object' ? req.body.value : req.body
          if (typeof gain.auto !== 'boolean') {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Invalid gain value. Must have "auto" boolean property'
            })
            return
          }
          const success = await provider.setGain(req.params.id, gain)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to set radar gain'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/sea - Set radar sea clutter
    this.app.put(
      `${RADAR_API_PATH}/:id/sea`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setSea) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setSea'
            })
            return
          }
          const sea: { auto: boolean; value?: number } =
            typeof req.body.value === 'object' ? req.body.value : req.body
          if (typeof sea.auto !== 'boolean') {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Invalid sea value. Must have "auto" boolean property'
            })
            return
          }
          const success = await provider.setSea(req.params.id, sea)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to set radar sea clutter'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/rain - Set radar rain clutter
    this.app.put(
      `${RADAR_API_PATH}/:id/rain`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json(Responses.notFound)
            return
          }
          if (!provider.setRain) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setRain'
            })
            return
          }
          const rain: { auto: boolean; value?: number } =
            typeof req.body.value === 'object' ? req.body.value : req.body
          if (typeof rain.auto !== 'boolean') {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Invalid rain value. Must have "auto" boolean property'
            })
            return
          }
          const success = await provider.setRain(req.params.id, rain)
          if (success) {
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Failed to set radar rain clutter'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // ============================================
    // Capability and State Endpoints
    // ============================================

    // GET /radars/:id/capabilities - Get radar capability manifest (cacheable)
    this.app.get(
      `${RADAR_API_PATH}/:id/capabilities`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getCapabilities) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support getCapabilities'
            })
            return
          }
          const capabilities = await provider.getCapabilities(req.params.id)
          if (capabilities) {
            res.status(200).json(capabilities)
          } else {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/:id/state - Get current radar state
    this.app.get(
      `${RADAR_API_PATH}/:id/state`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getState) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support getState'
            })
            return
          }
          const state = await provider.getState(req.params.id)
          if (state) {
            res.status(200).json(state)
          } else {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/:id/controls - List all controls with current values
    this.app.get(
      `${RADAR_API_PATH}/:id/controls`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getState) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support getState'
            })
            return
          }
          const state = await provider.getState(req.params.id)
          if (state && state.controls) {
            res.status(200).json(state.controls)
          } else {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/:id/controls/:controlId - Get single control value
    this.app.get(
      `${RADAR_API_PATH}/:id/controls/:controlId`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getControl) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support getControl'
            })
            return
          }
          const value = await provider.getControl(
            req.params.id,
            req.params.controlId
          )
          if (value !== null && value !== undefined) {
            res.status(200).json({ value })
          } else {
            res.status(404).json({
              error: 'Control not found',
              controlId: req.params.controlId
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/controls/:controlId - Set single control value
    this.app.put(
      `${RADAR_API_PATH}/:id/controls/:controlId`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.setControl) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support setControl'
            })
            return
          }
          const value = req.body.value !== undefined ? req.body.value : req.body
          const result = await provider.setControl(
            req.params.id,
            req.params.controlId,
            value
          )
          if (result.success) {
            res.status(200).json({ success: true })
          } else {
            res.status(400).json({
              success: false,
              error: result.error || 'Failed to set control',
              controlId: req.params.controlId
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // Note: WebSocket stream endpoint (/radars/:id/stream) would require
    // additional WebSocket handling infrastructure. For now, providers
    // should expose their own streamUrl for direct client connection.

    // ============================================
    // ARPA Target Endpoints
    // ============================================

    // GET /radars/:id/targets - Get all tracked ARPA targets
    this.app.get(
      `${RADAR_API_PATH}/:id/targets`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getTargets) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support ARPA targets'
            })
            return
          }
          const targets = await provider.getTargets(req.params.id)
          if (targets) {
            res.status(200).json(targets)
          } else {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // POST /radars/:id/targets - Manually acquire a target
    this.app.post(
      `${RADAR_API_PATH}/:id/targets`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.acquireTarget) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support target acquisition'
            })
            return
          }
          const { bearing, distance } = req.body
          if (typeof bearing !== 'number' || typeof distance !== 'number') {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message:
                'Invalid request. Must provide bearing (degrees) and distance (meters)'
            })
            return
          }
          if (bearing < 0 || bearing >= 360) {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Bearing must be between 0 and 360 degrees'
            })
            return
          }
          if (distance <= 0) {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Distance must be a positive number (meters)'
            })
            return
          }
          const result = await provider.acquireTarget(
            req.params.id,
            bearing,
            distance
          )
          if (result.success) {
            res.status(201).json({
              success: true,
              targetId: result.targetId
            })
          } else {
            res.status(400).json({
              success: false,
              error: result.error || 'Failed to acquire target'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // DELETE /radars/:id/targets/:targetId - Cancel tracking of a target
    this.app.delete(
      `${RADAR_API_PATH}/:id/targets/:targetId`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.cancelTarget) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support target cancellation'
            })
            return
          }
          const targetId = parseInt(req.params.targetId, 10)
          if (isNaN(targetId)) {
            res.status(400).json({
              statusCode: 400,
              state: 'FAILED',
              message: 'Invalid target ID. Must be a number'
            })
            return
          }
          const success = await provider.cancelTarget(req.params.id, targetId)
          if (success) {
            res.status(200).json({ success: true })
          } else {
            res.status(404).json({
              success: false,
              error: 'Target not found or already cancelled'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // GET /radars/:id/arpa/settings - Get ARPA settings
    this.app.get(
      `${RADAR_API_PATH}/:id/arpa/settings`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.getArpaSettings) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support ARPA settings'
            })
            return
          }
          const settings = await provider.getArpaSettings(req.params.id)
          if (settings) {
            res.status(200).json(settings)
          } else {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // PUT /radars/:id/arpa/settings - Update ARPA settings
    this.app.put(
      `${RADAR_API_PATH}/:id/arpa/settings`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const provider = await this.findProviderForRadar(req.params.id)
          if (!provider) {
            res.status(404).json({
              error: 'Radar not found',
              id: req.params.id
            })
            return
          }
          if (!provider.setArpaSettings) {
            res.status(501).json({
              statusCode: 501,
              state: 'FAILED',
              message: 'Provider does not support ARPA settings'
            })
            return
          }
          const settings: Partial<radar.ArpaSettings> =
            req.body.value !== undefined ? req.body.value : req.body
          const result = await provider.setArpaSettings(req.params.id, settings)
          if (result.success) {
            res.status(200).json({ success: true })
          } else {
            res.status(400).json({
              success: false,
              error: result.error || 'Failed to update ARPA settings'
            })
          }
        } catch (err: any) {
          res.status(500).json({
            statusCode: 500,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // Note: WebSocket target stream endpoint (/radars/:id/targets/stream)
    // would require additional WebSocket handling infrastructure.
    // For real-time target updates, clients should subscribe to the
    // main radar stream which includes target data.
  }
}
