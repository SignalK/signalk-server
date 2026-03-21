import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  DiscoveryDataSchema,
  PluginMetaDataSchema,
  FeaturesModelSchema
} from '@signalk/server-api/typebox'

const discoveryApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Signal K discovery API',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  externalDocs: {
    url: 'http://signalk.org/specification/',
    description: 'Signal K specification.'
  },
  servers: [{ url: '/signalk' }],
  tags: [
    { name: 'server', description: 'Signal K Server.' },
    { name: 'features', description: 'Signal K Server features.' }
  ],
  components: {
    schemas: typeboxToOpenApiSchemas([
      DiscoveryDataSchema,
      PluginMetaDataSchema,
      FeaturesModelSchema
    ]),
    responses: {
      DiscoveryResponse: {
        description: 'Discovery response.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DiscoveryData' }
          }
        }
      },
      '200Ok': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['COMPLETED'] },
                statusCode: { type: 'number', enum: [200] }
              },
              required: ['state', 'statusCode']
            }
          }
        }
      },
      ErrorResponse: {
        description: 'Failed operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Request error response',
              properties: {
                state: { type: 'string', enum: ['FAILED'] },
                statusCode: { type: 'number', enum: [404] },
                message: { type: 'string' }
              },
              required: ['state', 'statusCode', 'message']
            }
          }
        }
      },
      FeaturesResponse: {
        description: 'Server features response.',
        content: {
          'application/json': {
            schema: {
              description: 'Features response.',
              $ref: '#/components/schemas/FeaturesModel'
            }
          }
        }
      }
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['server'],
        summary: 'Retrieve server version and service endpoints.',
        description: "Returns data about server's endpoints and versions.",
        responses: {
          '200': { $ref: '#/components/responses/DiscoveryResponse' }
        }
      }
    },
    '/v2/features': {
      get: {
        tags: ['features'],
        parameters: [
          {
            name: 'enabled',
            in: 'query',
            description: 'Limit results to enabled features.',
            required: false,
            explode: false,
            schema: {
              type: 'string',
              enum: ['enabled', '1', 'false', '0']
            }
          }
        ],
        summary: 'Retrieve available server features.',
        description: 'Returns object detailing the available server features.',
        responses: {
          '200': { $ref: '#/components/responses/FeaturesResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}

export const discoveryApiRecord = {
  name: 'discovery',
  path: '',
  apiDoc: discoveryApiDoc as unknown as OpenApiDescription
}
