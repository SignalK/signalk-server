/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:weather')

import { IRouter, NextFunction, Request, Response } from 'express'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { SignalKMessageHub } from '../../app'

import {
  WeatherProvider,
  WeatherProviders,
  WeatherProviderMethods,
  WeatherData,
  isWeatherProvider,
  Position,
  WeatherReqParams
} from '@signalk/server-api'

const WEATHER_API_PATH = `/signalk/v2/api/weather`

interface WeatherApplication
  extends WithSecurityStrategy,
    SignalKMessageHub,
    IRouter {}

export class WeatherApi {
  private weatherProviders: Map<string, WeatherProvider> = new Map()

  private defaultProviderId?: string

  constructor(private app: WeatherApplication) {}

  async start() {
    this.initApiEndpoints()
    return Promise.resolve()
  }

  // ***** Plugin Interface methods *****

  // Register plugin as provider.
  register(pluginId: string, provider: WeatherProvider) {
    debug(`** Registering provider(s)....${pluginId} ${provider}`)

    if (!pluginId || !provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!isWeatherProvider(provider)) {
      throw new Error(
        `${pluginId} is missing WeatherProvider properties/methods!`
      )
    } else {
      if (!this.weatherProviders.has(pluginId)) {
        this.weatherProviders.set(pluginId, provider)
      }
      if (this.weatherProviders.size === 1) {
        this.defaultProviderId = pluginId
      }
    }
    debug(`No. of WeatherProviders registered =`, this.weatherProviders.size)
  }

  // Unregister plugin as provider.
  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Request to un-register plugin.....${pluginId}`)

    if (!this.weatherProviders.has(pluginId)) {
      debug(`** NOT FOUND....${pluginId}... cannot un-register!`)
      return
    }

    debug(`** Un-registering autopilot provider....${pluginId}`)
    this.weatherProviders.delete(pluginId)
    if (pluginId === this.defaultProviderId) {
      this.defaultProviderId = undefined
    }
    // update defaultProviderId if required
    if (this.weatherProviders.size !== 0 && !this.defaultProviderId) {
      this.defaultProviderId = this.weatherProviders.keys().next().value
    }
    debug(
      `Remaining number of Weather Providers registered =`,
      this.weatherProviders.size,
      'defaultProvider =',
      this.defaultProviderId
    )
  }

  // *************************************

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'weather'
    )
  }

  /** @returns 1= OK, 0= invalid location, -1= location not provided */
  private checkLocation(req: Request): number {
    if (req.query.lat && req.query.lon) {
      return isNaN(Number(req.query.lat)) || isNaN(Number(req.query.lon))
        ? 0
        : 1
    } else {
      return -1
    }
  }

  private parseRequest(req: Request, res: Response, next: NextFunction) {
    try {
      debug(`Weather`, req.method, req.path, req.query, req.body)
      if (['PUT', 'POST'].includes(req.method)) {
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
        } else {
          next()
        }
      } else {
        const l = this.checkLocation(req)
        if (l === 1) {
          next()
        } else if (l === 0) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: 'Invalid position data!'
          })
        } else {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: 'Location not supplied!'
          })
        }
      }
    } catch (err: any) {
      res.status(500).json({
        state: 'FAILED',
        statusCode: 500,
        message: err.message
      })
    }
  }

  private initApiEndpoints() {
    debug(`** Initialise ${WEATHER_API_PATH} endpoints. **`)

    this.app.use(
      `${WEATHER_API_PATH}`,
      (req: Request, res: Response, next: NextFunction) => {
        debug(`Using... ${WEATHER_API_PATH}`)
        if (req.path.includes('providers')) {
          next()
        } else {
          return this.parseRequest(req, res, next)
        }
      }
    )

    // return list of weather providers
    this.app.get(
      `${WEATHER_API_PATH}/_providers`,
      async (req: Request, res: Response) => {
        debug(`**route = ${req.method} ${req.path}`)
        try {
          const r: WeatherProviders = {}
          this.weatherProviders.forEach((v: WeatherProvider, k: string) => {
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

    // change weather provider
    this.app.post(
      `${WEATHER_API_PATH}/_providers`,
      async (req: Request, res: Response) => {
        debug(`**route = ${req.method} ${req.path} ${JSON.stringify(req.body)}`)
        try {
          if (!req.body.id) {
            throw new Error('Provider id not supplied!')
          }
          if (this.weatherProviders.has(req.body.id)) {
            this.defaultProviderId = req.body.id
            res.status(200).json({
              statusCode: 200,
              state: 'COMPLETED',
              message: `Default provider set to ${req.body.id}.`
            })
          } else {
            throw new Error(`Provider ${req.body.id} not found!`)
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

    // return observation data at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/observations`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const q = this.parseQueryOptions(req.query)
          const r = await this.useProvider().getObservations(
            q.position,
            q.options
          )
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

    /**
     * Return daily forecast data at the provided lat / lon for the supplied number of days
     * ?days=x
     *
     */
    this.app.get(
      `${WEATHER_API_PATH}/forecasts/daily`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const q = this.parseQueryOptions(req.query)
          const r = await this.useProvider().getForecasts(
            q.position,
            'daily',
            q.options
          )
          const df = r.filter((i: WeatherData) => {
            return i.type === 'daily'
          })
          res.status(200).json(df)
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // return point forecast data at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/forecasts/point`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        try {
          const q = this.parseQueryOptions(req.query)
          const r = await this.useProvider().getForecasts(
            q.position,
            'point',
            q.options
          )
          const pf = r.filter((i: WeatherData) => {
            return i.type === 'point'
          })
          res.status(200).json(pf)
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // return warning data at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/warnings`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          const q = this.parseQueryOptions(req.query)
          const r = await this.useProvider().getWarnings(q.position)
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

    // error response
    this.app.use(
      `${WEATHER_API_PATH}/*`,
      (err: any, req: Request, res: Response, next: NextFunction) => {
        debug(`** route = error path **`)
        const msg = {
          state: err.state ?? 'FAILED',
          statusCode: err.statusCode ?? 500,
          message: err.message ?? 'Weather provider error!'
        }
        if (res.headersSent) {
          console.log('EXCEPTION: headersSent')
          return next(msg)
        }
        res.status(500).json(msg)
      }
    )
  }

  /** Returns provider to use as data source.
   * @param req If not supplied default provider is returned.
   */
  private useProvider(req?: Request): WeatherProviderMethods {
    debug('** useProvider()')
    if (this.weatherProviders.size === 0) {
      throw new Error('No providers registered!')
    }
    if (!req) {
      if (
        this.defaultProviderId &&
        this.weatherProviders.has(this.defaultProviderId)
      ) {
        debug(`Using default provider...${this.defaultProviderId}`)
        return this.weatherProviders.get(this.defaultProviderId as string)
          ?.methods as WeatherProviderMethods
      } else {
        throw new Error(`Default provider not found!`)
      }
    } else {
      if (this.weatherProviders.has(req.params.id)) {
        debug(`Provider found...using ${req.params.id}`)
        return this.weatherProviders.get(req.params.id)
          ?.methods as WeatherProviderMethods
      } else {
        throw new Error(`Cannot get provider (${req.params.id})!`)
      }
    }
  }

  /**
   * Parse request.query into weather provider options
   * @param query req.query
   */
  private parseQueryOptions(query: any): WeatherReqOptions {
    const q: WeatherReqOptions = {
      position: {
        latitude: this.parseValueAsNumber(query.lat) ?? 0,
        longitude: this.parseValueAsNumber(query.lon) ?? 0
      },
      options: {}
    }
    if ('count' in query) {
      const n = this.parseValueAsNumber(query.count)
      if (typeof n === 'number') {
        q.options.maxCount = n
      }
    }
    if ('date' in query) {
      const pattern = /[0-9]{4}-[0-9]{2}-[0-9]{2}/
      if ((query.date as string).match(pattern)) {
        q.options.startDate = query.date?.toString()
      }
    }
    return q
  }

  /**
   * Ensure the query parameter value is a number
   * @param q Query param value
   */
  private parseValueAsNumber(value: unknown): number | undefined {
    const n = Number(value)
    return isNaN(n) ? undefined : n
  }
}

interface WeatherReqOptions {
  position: Position
  options: WeatherReqParams
}
