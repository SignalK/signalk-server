/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:features')

import { IRouter, Request, Response } from 'express'

import { SignalKMessageHub, WithConfig, WithFeatures } from '../../app'
import { WithSecurityStrategy } from '../../security'

const SIGNALK_API_PATH = `/signalk/v2/api`
const FEATURES_API_PATH = `${SIGNALK_API_PATH}/features`

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

  constructor(private server: FeaturesApplication) {}

  async start() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve) => {
      this.initApiRoutes()
      resolve()
    })
  }

  private initApiRoutes() {
    debug(`** Initialise ${FEATURES_API_PATH} path handlers **`)
    // return Feature information
    this.server.get(
      `${FEATURES_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${FEATURES_API_PATH}`)
        res.json(this.server.getFeatures())
      }
    )
  }
}
