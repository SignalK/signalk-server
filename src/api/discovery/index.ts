import { WithFeatures } from '@signalk/server-api'
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:features')

import { IRouter, Request, Response } from 'express'

const FEATURES_API_PATH = `/signalk/v2/features`

interface FeaturesApplication extends IRouter, WithFeatures {}

export class FeaturesApi {
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
        debug(`** GET ${req.path}`)

        const enabled = ['true', '1'].includes(req.query.enabled as string)
          ? true
          : ['false', '0'].includes(req.query.enabled as string)
            ? false
            : undefined

        res.json(await this.app.getFeatures(enabled))
      }
    )
  }
}
