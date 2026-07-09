import { OpenApiDescription } from '../swagger'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const sensorsApiDoc: any = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Signal K Sensors API',
    termsOfService: 'http://signalk.org/terms/',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  externalDocs: {
    url: 'http://signalk.org/specification/',
    description: 'Signal K specification.'
  },
  servers: [{ url: '/signalk/v2/api/vessels/self/sensors' }],
  tags: [
    {
      name: 'gnss',
      description:
        'Configuration of GNSS antenna positions and vessel reference point correction of navigation.position to the vessel Common Coordinate Reference Point (CCRP).'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'JAUTHENTICATION'
      }
    },
    schemas: {
      GnssCorrectionMode: {
        type: 'string',
        enum: ['off', 'replace', 'both'],
        description:
          'How configured antenna offsets are applied. `off`: geometry stored only. `replace`: matching navigation.position deltas are rewritten to the CCRP. `both`: the corrected position is additionally published under `<sensorId>.ccrp` alongside the untouched original.'
      },
      GnssSensor: {
        type: 'object',
        required: ['sensorId', '$source', 'fromBow', 'fromCenter'],
        properties: {
          sensorId: {
            type: 'string',
            description: 'Stable label for this antenna. Must not contain `.`.',
            example: 'gnss-bow'
          },
          $source: {
            type: 'string',
            description:
              'Source reference of the position provider this antenna maps to. May be empty for a not-yet-linked row.',
            example: 'n2k-1.160'
          },
          fromBow: {
            type: 'number',
            nullable: true,
            description: 'Metres aft of the bow along the centerline.',
            example: 3.2
          },
          fromCenter: {
            type: 'number',
            nullable: true,
            description:
              'Metres to port (positive) or starboard (negative) of the centerline.',
            example: -0.5
          }
        }
      },
      GnssCorrectionStatus: {
        type: 'object',
        required: ['mode', 'active'],
        properties: {
          mode: { $ref: '#/components/schemas/GnssCorrectionMode' },
          active: {
            type: 'boolean',
            description:
              'True when a correction mode is selected and both vessel length and true heading are available.'
          },
          blocked: {
            type: 'string',
            enum: ['no-length', 'no-heading'],
            description:
              'The missing input preventing correction, when a mode is selected but `active` is false.'
          }
        }
      },
      GnssConfig: {
        type: 'object',
        required: ['correction', 'sensors'],
        properties: {
          correction: { $ref: '#/components/schemas/GnssCorrectionMode' },
          sensors: {
            type: 'array',
            items: { $ref: '#/components/schemas/GnssSensor' }
          }
        }
      }
    },
    responses: {
      ErrorResponse: {
        description: 'Failed operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['state', 'statusCode', 'message'],
              properties: {
                state: { type: 'string', enum: ['FAILED'] },
                statusCode: { type: 'number', enum: [400, 403, 404] },
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  paths: {
    '/gnss': {
      get: {
        tags: ['gnss'],
        summary: 'Retrieve GNSS antenna configuration',
        description:
          'Returns the configured antennas, the active correction mode, and whether correction can currently run.',
        responses: {
          '200': {
            description: 'GNSS configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['correction', 'sensors', 'status'],
                  properties: {
                    correction: {
                      $ref: '#/components/schemas/GnssCorrectionMode'
                    },
                    sensors: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/GnssSensor' }
                    },
                    status: {
                      $ref: '#/components/schemas/GnssCorrectionStatus'
                    }
                  }
                }
              }
            }
          }
        }
      },
      put: {
        tags: ['gnss'],
        summary: 'Set GNSS antenna configuration',
        description:
          'Replaces the antenna list and correction mode. Offsets are bounds-checked against the configured vessel length and beam when those are set.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GnssConfig' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Configuration saved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['result', 'restartRequired'],
                  properties: {
                    result: { type: 'string', enum: ['ok'] },
                    restartRequired: {
                      type: 'boolean',
                      description:
                        'True when legacy per-sensor base-delta entries were swept and a restart is needed to drop them from the data model.'
                    }
                  }
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
          '403': { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: ['gnss'],
        summary: 'Clear GNSS antenna configuration',
        description:
          'Removes all configured antennas and turns vessel reference point correction off.',
        responses: {
          '200': {
            description: 'Configuration cleared',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['result', 'restartRequired'],
                  properties: {
                    result: { type: 'string', enum: ['ok'] },
                    restartRequired: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '403': { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}

export const sensorsApiRecord = {
  name: 'sensors',
  path: '/signalk/v2/api/vessels/self/sensors',
  apiDoc: sensorsApiDoc as unknown as OpenApiDescription
}
