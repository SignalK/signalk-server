/**
 * OpenAPI 3.1.0 Document for the Signal K Apps API
 */

import {
  securitySchemes,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const appsOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Apps API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/' }],
  tags: [
    { name: 'apps', description: 'WebApps Information' },
    { name: 'plugins', description: 'Plugin Management' }
  ],
  components: {
    schemas: {
      WebAppInformation: {
        type: 'object',
        required: ['name', 'version', 'location'],
        properties: {
          name: {
            type: 'string',
            example: '@signalk/instrumentpanel'
          },
          version: { type: 'string', example: '1.3.1' },
          description: {
            type: 'string',
            example: 'Signal K Instrument Panel'
          },
          location: {
            type: 'string',
            description: 'Path where WebApp is mounted',
            example: '/@signalk/instrumentpanel'
          },
          license: { type: 'string', example: 'Apache-2.0' },
          author: {
            type: 'string',
            description: 'WebApp author(s)',
            example: 'author1@hotmail.com, author2@hotmail.com'
          }
        }
      },
      PluginInformation: {
        type: 'object',
        required: [
          'id',
          'name',
          'packageName',
          'keywords',
          'version',
          'description',
          'schema',
          'data'
        ],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          packageName: { type: 'string' },
          keywords: {
            type: 'array',
            items: { type: 'string' }
          },
          version: { type: 'string' },
          description: { type: 'string' },
          schema: {
            type: 'object',
            properties: {}
          },
          statusMessage: { type: 'string' },
          data: {
            type: 'object',
            required: [
              'configuration',
              'enabled',
              'enableDebug',
              'enableLogging'
            ],
            properties: {
              configuration: {
                type: 'object',
                properties: {}
              },
              enabled: { type: 'boolean' },
              enableLogging: { type: 'boolean' },
              enableDebug: { type: 'boolean' }
            }
          }
        }
      }
    },
    responses: {
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
      AppsListResponse: {
        description: 'Application list response.',
        content: {
          'application/json': {
            schema: {
              description: 'Application list.',
              type: 'array',
              items: {
                $ref: '#/components/schemas/WebAppInformation'
              }
            }
          }
        }
      },
      PluginDetailResponse: {
        description: 'Plugin detail response.',
        content: {
          'application/json': {
            schema: {
              description: 'Plugin detail.',
              type: 'object',
              required: [
                'enabled',
                'enabledByDefault',
                'id',
                'name',
                'version'
              ],
              properties: {
                enabled: { type: 'boolean' },
                enabledByDefault: { type: 'boolean' },
                id: { type: 'string', example: 'sksim' },
                name: {
                  type: 'string',
                  example: 'Data stream generator'
                },
                version: { type: 'string', example: '1.5.4' }
              }
            }
          }
        }
      }
    },
    securitySchemes
  },
  paths: {
    '/signalk/v1/apps/list': {
      get: {
        tags: ['apps'],
        summary: 'List of installed Webapps',
        responses: {
          '200': { $ref: '#/components/responses/AppsListResponse' }
        }
      }
    },
    '/plugins': {
      get: {
        tags: ['plugins'],
        summary: 'List of installed plugins with detailed data',
        description:
          'This provides comprehensive data about all installed plugin, including their versions, configuration schemas and configuration data as well as enabled statuses.',
        responses: {
          '200': {
            description: 'Array of detailed data for installed plugins',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/PluginInformation'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/plugins/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path' as const,
          description: 'Plugin identifier',
          required: true,
          schema: { type: 'string' }
        }
      ],
      get: {
        tags: ['plugins'],
        summary: 'Status information for a plugin',
        responses: {
          '200': {
            $ref: '#/components/responses/PluginDetailResponse'
          }
        }
      }
    },
    '/plugins/{id}/config': {
      parameters: [
        {
          name: 'id',
          in: 'path' as const,
          description: 'Plugin identifier',
          required: true,
          schema: { type: 'string' }
        }
      ],
      post: {
        tags: ['plugins'],
        summary: 'Save configuration for a plugin',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['enabled', 'configuration'],
                properties: {
                  configuration: {
                    type: 'object',
                    properties: {}
                  },
                  enabled: { type: 'boolean' },
                  enableLogging: { type: 'boolean' },
                  enableDebug: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Plugin saved successfully'
          }
        }
      }
    }
  }
}
