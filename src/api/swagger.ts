/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import { courseApiRecord } from './course/openApi'
import { notificationsApiRecord } from './notifications/openApi'
import { resourcesApiRecord } from './resources/openApi'

interface OpenApiRecord {
  name: string
  path: string
  apiDoc: any
}

const apiDocs: {
  [name: string]: OpenApiRecord
} = [courseApiRecord, notificationsApiRecord, resourcesApiRecord].reduce(
  (acc: any, apiRecord: OpenApiRecord) => {
    acc[apiRecord.name] = apiRecord
    return acc
  },
  {}
)

export function mountSwaggerUi(app: any, path: string) {
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
