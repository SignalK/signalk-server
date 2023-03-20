/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRouter, NextFunction, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import { courseApiRecord } from './course/openApi'
import { notificationsApiRecord } from './notifications/openApi'
import { resourcesApiRecord } from './resources/openApi'
import { securityApiRecord } from './security/openApi'
import { discoveryApiRecord } from './discovery/openApi'
import { appsApiRecord } from './apps/openApi'
import { PluginId, PluginManager } from '../interfaces/plugins'
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
  securityApiRecord,
  courseApiRecord,
  notificationsApiRecord,
  resourcesApiRecord
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const apiDocPath = apiRecord?.path

    if (apiDoc && apiDocPath !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(apiDoc as any).servers = [
        {
          url: `${process.env.PROTOCOL ? 'https' : req.protocol}://${req.get(
            'Host'
          )}${apiDocPath}`
        },
        {
          url: `https://demo.signalk.org${apiDocPath}`
        }
      ]
      res.json(apiDoc)
    } else {
      res.status(404)
      res.send('Not found')
    }
  }
  app.get(
    `${SERVERROUTESPREFIX}/openapi/plugins/:pluginId`,
    apiDefinitionHandler
  )
  app.get(`${SERVERROUTESPREFIX}/openapi/:api`, apiDefinitionHandler)
}
