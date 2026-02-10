/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRouter, NextFunction, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import { courseApiRecord } from './course/openApi'
import { notificationsApiRecord } from './notifications/openApi'
import { resourcesApiRecord } from './resources/openApi'
import { autopilotApiRecord } from './autopilot/openApi'
import { securityApiRecord } from './security/openApi'
import { discoveryApiRecord } from './discovery/openApi'
import { weatherApiRecord } from './weather/openApi'
import { appsApiRecord } from './apps/openApi'
import { historyApiRecord } from './history/openApi'
import { radarApiRecord } from './radar/openApi'
import { PluginId, PluginManager } from '../interfaces/plugins'
import { Brand } from '@signalk/server-api'
import { courseAsyncApiDoc } from './course/asyncApi'

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
  weatherApiRecord,
  securityApiRecord,
  historyApiRecord,
  radarApiRecord
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

  // Serve AsyncAPI JSON document for Course API WebSocket delta channels
  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/course`,
    (_req: Request, res: Response) => {
      res.json(courseAsyncApiDoc)
    }
  )

  // Serve AsyncAPI HTML viewer (like Swagger UI but for AsyncAPI)
  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/course/docs`,
    (_req: Request, res: Response) => {
      res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Signal K Course API - WebSocket Deltas</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@2/styles/default.min.css">
  <style>
    body { margin: 0; padding: 0; }
    #asyncapi { padding: 20px; }
  </style>
</head>
<body>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/@asyncapi/react-component@2/browser/standalone/index.js"></script>
  <script>
    AsyncApiStandalone.render({
      schema: { url: '${SERVERROUTESPREFIX}/asyncapi/course' },
      config: { show: { sidebar: true } }
    }, document.getElementById('asyncapi'));
  </script>
</body>
</html>`)
    }
  )
}
