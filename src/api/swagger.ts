import { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import courseApiDoc from './course/openApi.json'
import resourcesApiDoc from './resources/openApi.json'

const apiDocs: {
  [key: string]: any
} = {
  course: courseApiDoc,
  resources: resourcesApiDoc
}

export function mountSwaggerUi(app: any, path: string) {
  app.use(
    path,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      explorer: true,
      swaggerOptions: {
        urls: Object.keys(apiDocs).map(name => ({
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
        res.json(apiDocs[req.params.api])
      } else {
        res.status(404)
        res.send('Not found')
      }
    }
  )
}
