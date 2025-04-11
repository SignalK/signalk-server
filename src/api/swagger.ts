/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRouter, NextFunction, Request, Response } from 'express'
import * as swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants.js'
import { courseApiRecord } from './course/openApi.js'
import { notificationsApiRecord } from './notifications/openApi.js'
import { resourcesApiRecord } from './resources/openApi.js'
import { autopilotApiRecord } from './autopilot/openApi.js'
import { securityApiRecord } from './security/openApi.js'
import { discoveryApiRecord } from './discovery/openApi.js'
import { appsApiRecord } from './apps/openApi.js'
import { PluginId, PluginManager } from '../interfaces/plugins.js'
import { Brand } from '@signalk/server-api'

export type OpenApiDescription = Brand<object, 'OpenApiDescription'>

export interface OpenApiRecord {
  name: string
  path: string
  apiDoc: OpenApiDescription
}

interface ApiRecords {
  [name: string]: OpenApiRecord
}

const apiDocs = [
  discoveryApiRecord,
  appsApiRecord,
  autopilotApiRecord,
  courseApiRecord,
  notificationsApiRecord,
  resourcesApiRecord,
  securityApiRecord
].reduce<ApiRecords>((acc, apiRecord: OpenApiRecord) => {
  acc[apiRecord.name] = apiRecord
  return acc
}, {})

export function mountSwaggerUi(app: IRouter & PluginManager, path: string) {
  const allApiNames = () =>
    Object.keys(apiDocs).concat(
      app.getPluginOpenApiRecords().map(({ name }) => name)
    )

  // custom middleware to re-setup swaggerUI, because plugins have
  // not been loaded when this is called early in server startup sequence
  app.use(path, (req: Request, res: Response, next: NextFunction) => {
    swaggerUi.setup(undefined, {
      explorer: true,
      swaggerOptions: {
        urls: allApiNames().map((name) => ({
          name,
          url: `${SERVERROUTESPREFIX}/openapi/${name}`
        }))
      }
    })
    next()
  })

  app.use(
    path,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      explorer: true,
      swaggerOptions: {
        urls: Object.keys(apiDocs).map((name) => ({
          name,
          url: `${SERVERROUTESPREFIX}/openapi/${name}`
        }))
      }
    })
  )

  const apiDefinitionHandler = (req: Request, res: Response) => {
    let apiRecord
    if (req.params.api) {
      apiRecord = apiDocs[req.params.api]
    } else if (req.params.pluginId) {
      apiRecord = app.getPluginOpenApi(req.params.pluginId as PluginId)
    }
    const apiDoc = apiRecord?.apiDoc
    const apiPath = apiRecord?.path

    if (apiDoc && apiPath !== undefined) {
      ;(apiDoc as any).servers = (apiDoc as any).servers ?? [
        {
          url: `${apiPath}`
        }
      ]
      res.json(apiDoc)
    } else {
      res.status(404)
      res.json('Not found')
    }
  }
  app.get(
    `${SERVERROUTESPREFIX}/openapi/plugins/:pluginId`,
    apiDefinitionHandler
  )
  app.get(`${SERVERROUTESPREFIX}/openapi/:api`, apiDefinitionHandler)
}
