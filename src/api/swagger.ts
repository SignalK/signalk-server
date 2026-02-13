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
import { notificationsAsyncApiDoc } from './notifications/asyncApi'
import { autopilotAsyncApiDoc } from './autopilot/asyncApi'
import { radarAsyncApiDoc } from './radar/asyncApi'
import { resourcesAsyncApiDoc } from './resources/asyncApi'

interface AsyncApiRecord {
  name: string
  title: string
  doc: object
}

const asyncApiDocs: Record<string, AsyncApiRecord> = {
  course: {
    name: 'course',
    title: 'Signal K Course API - WebSocket Deltas',
    doc: courseAsyncApiDoc
  },
  notifications: {
    name: 'notifications',
    title: 'Signal K Notifications API - WebSocket Deltas',
    doc: notificationsAsyncApiDoc
  },
  autopilot: {
    name: 'autopilot',
    title: 'Signal K Autopilot API - WebSocket Deltas',
    doc: autopilotAsyncApiDoc
  },
  radar: {
    name: 'radar',
    title: 'Signal K Radar API - WebSocket Streams',
    doc: radarAsyncApiDoc
  },
  resources: {
    name: 'resources',
    title: 'Signal K Resources API - WebSocket Deltas',
    doc: resourcesAsyncApiDoc
  }
}

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
      if (!(apiDoc as any).servers) {
        try {
          ;(apiDoc as any).servers = [{ url: `${apiPath}` }]
        } catch {
          // plugin docs may be frozen or have getter-only properties
        }
      }
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

  // Serve list of available AsyncAPI documents
  app.get(`${SERVERROUTESPREFIX}/asyncapi`, (_req: Request, res: Response) => {
    res.json(
      Object.values(asyncApiDocs).map(({ name, title }) => ({
        name,
        title,
        jsonUrl: `${SERVERROUTESPREFIX}/asyncapi/${name}`,
        docsUrl: `${SERVERROUTESPREFIX}/asyncapi/docs`
      }))
    )
  })

  // Serve unified AsyncAPI viewer with dropdown (mirrors the OpenAPI Swagger UI)
  // using Swagger UI + swagger-editor plugins for a consistent look
  // MUST be registered before /asyncapi/:api to avoid matching "docs" as :api
  const asyncApiUrls = Object.values(asyncApiDocs).map(({ name, title }) => ({
    name: title,
    url: `${SERVERROUTESPREFIX}/asyncapi/${name}`
  }))

  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/docs`,
    (_req: Request, res: Response) => {
      const specsJson = JSON.stringify(
        asyncApiUrls.map((u) => ({
          title: u.name,
          url: u.url
        }))
      )
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signal K AsyncAPI Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@latest/styles/default.min.css" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }
    #nav { display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #252526; color: #cccccc; border-bottom: 1px solid #3c3c3c; }
    #nav label { font-size: 14px; font-weight: 500; }
    #nav select { padding: 4px 8px; border-radius: 4px; border: 1px solid #3c3c3c; background: #3c3c3c; color: #cccccc; font-size: 14px; }
    #nav select:focus { outline: none; border-color: #007acc; }
    /* Dark theme overrides for AsyncAPI React component (VS Code Dark+) */
    .aui-root { background: #1e1e1e !important; color: #d4d4d4 !important; }
    .aui-root h1, .aui-root h2, .aui-root h3, .aui-root h4, .aui-root h5, .aui-root h6 { color: #d4d4d4 !important; }
    .aui-root p, .aui-root li, .aui-root span, .aui-root td, .aui-root th, .aui-root label, .aui-root dt, .aui-root dd { color: #cccccc !important; }
    .aui-root a { color: #3794ff !important; }
    .aui-root a:hover { color: #4daafc !important; }
    .aui-root code { background: #2d2d2d !important; color: #ce9178 !important; }
    .aui-root pre, .aui-root .hljs { background: #1e1e1e !important; }
    .aui-root .bg-white { background-color: #252526 !important; }
    .aui-root .bg-gray-100, .aui-root .bg-gray-200 { background-color: #2d2d2d !important; }
    .aui-root .border-gray-200, .aui-root .border-gray-300 { border-color: #3c3c3c !important; }
    .aui-root .text-gray-600, .aui-root .text-gray-700, .aui-root .text-gray-800, .aui-root .text-gray-900 { color: #cccccc !important; }
    .aui-root .text-gray-500 { color: #858585 !important; }
    .aui-root .shadow, .aui-root .shadow-md, .aui-root .shadow-sm { box-shadow: 0 1px 3px rgba(0,0,0,.5) !important; }
    .aui-root .bg-blue-100 { background-color: #264f78 !important; }
    .aui-root .bg-blue-500, .aui-root .bg-blue-600 { background-color: #007acc !important; }
    .aui-root .bg-green-100 { background-color: #2d4a2d !important; }
    .aui-root .bg-yellow-100 { background-color: #4a4a2d !important; }
    .aui-root .bg-red-100 { background-color: #4a2d2d !important; }
    .aui-root .bg-gray-800 { background-color: #2d2d2d !important; }
    .aui-root [class*="sidebar"] { background: #252526 !important; }
    .aui-root [class*="sidebar"] a { color: #cccccc !important; }
    .aui-root [class*="sidebar"] a:hover, .aui-root [class*="sidebar"] a.active { color: #ffffff !important; }
  </style>
</head>
<body>
  <div id="nav">
    <label for="spec-select">API:</label>
    <select id="spec-select"></select>
  </div>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/@asyncapi/react-component@latest/browser/standalone/index.js"></script>
  <script>
    var specs = ${specsJson};
    var select = document.getElementById('spec-select');
    specs.forEach(function(s, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.title;
      select.appendChild(opt);
    });

    function loadSpec(index) {
      AsyncApiStandalone.render(
        {
          schema: { url: specs[index].url, options: { method: 'GET' } },
          config: { show: { sidebar: true } }
        },
        document.getElementById('asyncapi')
      );
    }

    select.addEventListener('change', function() { loadSpec(this.value); });
    loadSpec(0);
  </script>
</body>
</html>`)
    }
  )

  // Serve AsyncAPI JSON document
  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/:api`,
    (req: Request, res: Response) => {
      const record = asyncApiDocs[req.params.api]
      if (record) {
        res.json(record.doc)
      } else {
        res.status(404).json('Not found')
      }
    }
  )
}
