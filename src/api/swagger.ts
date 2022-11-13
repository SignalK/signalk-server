/* eslint-disable @typescript-eslint/no-explicit-any */
import { IRouter, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import { courseApiRecord } from './course/openApi'
import { notificationsApiRecord } from './notifications/openApi'
import { resourcesApiRecord } from './resources/openApi'
import { securityApiRecord } from './security/openApi'
import { discoveryApiRecord } from './discovery/openApi'
import { appsApiRecord } from './apps/openApi'

interface WithServers {
  servers: {
    url: string
  }[]
}

interface OpenApiRecord {
  name: string
  path: string
  apiDoc: WithServers
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

export function mountSwaggerUi(app: IRouter, path: string) {
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
  app.get(
    `${SERVERROUTESPREFIX}/openapi/:api`,
    (req: Request, res: Response) => {
      if (apiDocs[req.params.api]) {
        apiDocs[req.params.api].apiDoc.servers = [
          {
            url: `${process.env.PROTOCOL ? 'https' : req.protocol}://${req.get(
              'Host'
            )}${apiDocs[req.params.api].path}`
          },
          {
            url: `https://demo.signalk.org${apiDocs[req.params.api].path}`
          }
        ]
        res.json(apiDocs[req.params.api].apiDoc)
      } else {
        res.status(404)
        res.send('Not found')
      }
    }
  )
}
