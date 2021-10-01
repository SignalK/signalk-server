import swaggerUi from 'swagger-ui-express'
import apidoc from './openapi.json'

export function mountApiDocs(app: any) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(apidoc))
}
