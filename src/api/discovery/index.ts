/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:features')

import { IRouter, Request, Response } from 'express'

import { SignalKMessageHub, WithConfig, WithFeatures } from '../../app'
import { WithSecurityStrategy } from '../../security'

const FEATURES_API_PATH = `/signalk/v2/features`

interface FeaturesApplication
  extends IRouter,
    WithConfig,
    WithFeatures,
    WithSecurityStrategy,
    SignalKMessageHub {}

interface FeatureInfo {
  apis: string[]
  plugins: string[]
}

export class FeaturesApi {
  private features: FeatureInfo = {
    apis: [],
    plugins: []
  }

  constructor(private app: FeaturesApplication) {}

  async start() {
    return new Promise<void>((resolve) => {
      this.initApiRoutes()
      resolve()
    })
  }

  private initApiRoutes() {
    debug(`** Initialise ${FEATURES_API_PATH} path handlers **`)
    // return Feature information
    this.app.get(
      `${FEATURES_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${FEATURES_API_PATH}`)
        res.json(
          await this.app.getFeatures(
            typeof req.query.enabled !== 'undefined' ? true : false
          )
        )
      }
    )
  }
}
