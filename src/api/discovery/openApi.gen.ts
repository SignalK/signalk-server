/**
 * OpenAPI 3.1.0 Document for the Signal K Discovery API
 */

import { DiscoveryDataSchema, FeaturesModelSchema } from '@signalk/server-api'
import {
  toOpenApiSchema,
  okResponse,
  errorResponse,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Discovery-specific responses
// ---------------------------------------------------------------------------

const discoveryResponse = {
  description: 'Discovery response.',
  content: {
    'application/json': {
      schema: toOpenApiSchema(DiscoveryDataSchema)
    }
  }
}

const featuresResponse = {
  description: 'Server features response.',
  content: {
    'application/json': {
      schema: toOpenApiSchema(FeaturesModelSchema)
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const discoveryOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K discovery API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [
    {
      url: '/signalk'
    }
  ],
  tags: [
    { name: 'server', description: 'Signal K Server.' },
    { name: 'features', description: 'Signal K Server features.' }
  ],
  components: {
    schemas: {
      DiscoveryData: toOpenApiSchema(DiscoveryDataSchema),
      FeaturesModel: toOpenApiSchema(FeaturesModelSchema)
    },
    responses: {
      DiscoveryResponse: discoveryResponse,
      '200Ok': okResponse,
      ErrorResponse: errorResponse,
      FeaturesResponse: featuresResponse
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
