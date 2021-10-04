import express from 'express'
import swaggerUi from 'swagger-ui-express'
import apidoc from './openapi.json'

export interface OpenAPIPathsHandler {
  addPaths: (paths: object) => void
}

export interface OpenAPIRootHandler {
  setRootDoc: (root: object) => void
}

export function mountApiDocs(app: OpenAPIRootHandler & express.IRouter) {
  app.get('/api-docs/openapi.json', (request, response) => {
    response.json(apidoc)
  })
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(undefined , {
    swaggerOptions: {
      url: '/api-docs/openapi.json'
    }
  }))
  return app.setRootDoc(apidoc)
}
