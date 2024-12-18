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
  WeatherWarning,
  WeatherData,
  isWeatherProvider,
  SKVersion,
  Path,
  Delta,
  Position,
  ALARM_STATE,
  ALARM_METHOD
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

  // Send warning Notification
  emitWarning(
    pluginId: string,
    position?: Position,
    warnings?: WeatherWarning[]
  ) {
    this.sendNotification(pluginId, position, warnings)
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
    debug(`Autopilot path`, req.method, req.params)
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // fetch weather data for provided lat / lon
    this.app.get(`${WEATHER_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** route = ${req.method} ${req.path}`)
      try {
        const r = await this.useProvider().getData({
          latitude: Number(req.query.lat),
          longitude: Number(req.query.lon)
        })
        res.status(200).json(r)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        res.status(400).json({
          statusCode: 400,
          state: 'FAILED',
          message: err.message
        })
      }
    })

    // return observation data at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/observations`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          const r = await this.useProvider().getObservations({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
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

    // return specific observation entry at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/observations/:id`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          if (isNaN(Number(req.params.id))) {
            throw new Error('Invalid index supplied!')
          }
          const r = await this.useProvider().getObservations({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
          })
          if (Number(req.params.id) >= r.length) {
            throw new Error('Index out of range!')
          }
          res.status(200).json(r[Number(req.params.id)])
        } catch (err: any) {
          res.status(400).json({
            statusCode: 400,
            state: 'FAILED',
            message: err.message
          })
        }
      }
    )

    // return all forecasts at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/forecasts`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          const r = await this.useProvider().getForecasts({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
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

    // return daily forecast data at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/forecasts/daily`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          const r = await this.useProvider().getForecasts({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
          })
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
        debug(`** route = ${req.method} ${req.path}`)
        try {
          const r = await this.useProvider().getForecasts({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
          })
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

    // return specific forecast entry at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/forecasts/:id`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          if (isNaN(Number(req.params.id))) {
            throw new Error('Invalid index supplied!')
          }
          const r = await this.useProvider().getForecasts({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
          })
          if (Number(req.params.id) >= r.length) {
            throw new Error('Index out of range!')
          }
          res.status(200).json(r[Number(req.params.id)])
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
          const r = await this.useProvider().getWarnings({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
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

    // return specific warning entry at the provided lat / lon
    this.app.get(
      `${WEATHER_API_PATH}/warnings/:id`,
      async (req: Request, res: Response) => {
        debug(`** route = ${req.method} ${req.path}`)
        try {
          if (isNaN(Number(req.params.id))) {
            throw new Error('Invalid index supplied!')
          }
          const r = await this.useProvider().getWarnings({
            latitude: Number(req.query.lat),
            longitude: Number(req.query.lon)
          })
          if (Number(req.params.id) >= r.length) {
            throw new Error('Index out of range!')
          }
          res.status(200).json(r[Number(req.params.id)])
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

  // send weather warning notification
  private sendNotification(
    sourceId: string,
    pos?: Position,
    warnings?: WeatherWarning[]
  ) {
    let value: { [key: string]: any }
    if (
      !pos ||
      !warnings ||
      (Array.isArray(warnings) && warnings.length === 0)
    ) {
      value = {
        state: ALARM_STATE.normal,
        method: [],
        message: ``
      }
    } else {
      value = {
        state: ALARM_STATE.warn,
        method: [ALARM_METHOD.visual],
        message: `Weather Warning`,
        data: {
          position: pos,
          warnings: warnings
        }
      }
    }
    const msg: Delta = {
      updates: [
        {
          values: [
            {
              path: `notifications.weather.warning` as Path,
              value: value
            }
          ]
        }
      ]
    }
    debug(`delta -> ${sourceId}:`, msg.updates[0])
    this.app.handleMessage(sourceId, msg, SKVersion.v2)
  }
}
