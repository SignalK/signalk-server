/**
 * OpenAPI 3.1.0 Document for the Signal K Autopilot API
 */

import {
  AutopilotInfoSchema,
  AutopilotOptionsSchema,
  AutopilotStateDefSchema,
  AutopilotActionDefSchema,
  AngleInputSchema,
  StringValueInputSchema
} from '@signalk/server-api'
import {
  toOpenApiSchema,
  errorResponse,
  securitySchemes,
  defaultSecurity,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// Reusable parameters
// ---------------------------------------------------------------------------

const autopilotIdParam = {
  name: 'id',
  in: 'path' as const,
  description: 'Identifier of the autopilot device the request is directed to.',
  required: true,
  schema: { type: 'string', examples: ['mypilot1'] }
}

// ---------------------------------------------------------------------------
// Reusable responses
// ---------------------------------------------------------------------------

const actionOkResponse = {
  description: 'Successful operation',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['state', 'statusCode'],
        properties: {
          state: { type: 'string', enum: ['COMPLETED'] },
          statusCode: { type: 'number', enum: [200] }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper for simple action endpoints
// ---------------------------------------------------------------------------

function actionEndpoint(
  summary: string,
  description: string,
  method: 'post' | 'delete' = 'post'
) {
  return {
    parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
    [method]: {
      tags: ['autopilot'],
      summary,
      description,
      responses: {
        '200': { $ref: '#/components/responses/200ActionResponse' },
        default: { $ref: '#/components/responses/ErrorResponse' }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const autopilotOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Autopilot API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/signalk/v2/api/vessels/self/autopilots' }],
  tags: [
    { name: 'autopilot', description: 'Autopilot operations' },
    { name: 'provider', description: 'Provider operations' }
  ],
  components: {
    schemas: {
      AutopilotInfo: toOpenApiSchema(AutopilotInfoSchema),
      AutopilotOptions: toOpenApiSchema(AutopilotOptionsSchema),
      AutopilotStateDef: toOpenApiSchema(AutopilotStateDefSchema),
      AutopilotActionDef: toOpenApiSchema(AutopilotActionDefSchema),
      angleInput: toOpenApiSchema(AngleInputSchema),
      stringValueInput: toOpenApiSchema(StringValueInputSchema)
    },
    responses: {
      '200ActionResponse': actionOkResponse,
      ErrorResponse: errorResponse
    },
    parameters: {
      AutopilotIdParam: autopilotIdParam
    },
    securitySchemes
  },
  security: defaultSecurity,
  paths: {
    '/': {
      get: {
        tags: ['autopilot'],
        summary: 'Retrieve list of autopilot devices.',
        responses: {
          default: {
            description: 'List of autopilot device identifiers',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    '/{id}': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      get: {
        tags: ['autopilot'],
        summary: 'Retrieve autopilot details.',
        description: 'Retrieves current data values and valid options.',
        responses: {
          '200': {
            description: 'Autopilot data',
            content: {
              'application/json': {
                schema: toOpenApiSchema(AutopilotInfoSchema)
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/state': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      get: {
        tags: ['autopilot'],
        summary: 'Retrieve autopilot state.',
        description: 'Returns the current state of the autopilot device.',
        responses: {
          '200': {
            description: 'Autopilot state value',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['value'],
                  properties: {
                    value: {
                      type: 'string',
                      description: 'Autopilot state',
                      examples: ['auto']
                    }
                  }
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: ['autopilot'],
        summary: 'Set autopilot state.',
        description: 'Set the state value. Must be a valid state value.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(StringValueInputSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/mode': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      get: {
        tags: ['autopilot'],
        summary: 'Retrieve autopilot mode.',
        responses: {
          '200': {
            description: 'Autopilot mode value',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['value'],
                  properties: {
                    value: {
                      type: 'string',
                      description: 'Autopilot mode',
                      examples: ['compass']
                    }
                  }
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: ['autopilot'],
        summary: 'Set autopilot mode.',
        description: 'Set the mode value. Must be a valid mode value.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(StringValueInputSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/target': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      get: {
        tags: ['autopilot'],
        summary: 'Retrieve the current target value.',
        description: 'The current target value in radians.',
        responses: {
          '200': {
            description: 'Autopilot value response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['value'],
                  properties: {
                    value: {
                      type: 'number',
                      description: 'Value in radians',
                      examples: [2.456]
                    }
                  }
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: ['autopilot'],
        summary: 'Set autopilot `target` value.',
        description:
          'Value supplied must fall within the valid range (-180 & 360 degrees / PI & 2 * PI radians).',
        requestBody: {
          description: 'Value within the valid range.',
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(AngleInputSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/target/adjust': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      put: {
        tags: ['autopilot'],
        summary: 'Adjust autopilot target value by +/- degrees / radians.',
        description:
          'Value supplied will be added to the current target. The result must fall within the valid range.',
        requestBody: {
          description: 'Value to add to the current `target`.',
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(AngleInputSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/engage': actionEndpoint(
      'Engage autopilot.',
      'Set the autopilot to a state that is actively steering the vessel.'
    ),
    '/{id}/disengage': actionEndpoint(
      'Disengage autopilot.',
      'Set the autopilot to a state that is NOT actively steering the vessel.'
    ),
    '/{id}/tack/port': actionEndpoint('Tack to port.', 'Execute a port tack.'),
    '/{id}/tack/starboard': actionEndpoint(
      'Tack to starboard.',
      'Execute a starboard tack.'
    ),
    '/{id}/gybe/port': actionEndpoint(
      'Gybe to port.',
      'Execute a gybe to port.'
    ),
    '/{id}/gybe/starboard': actionEndpoint(
      'Gybe to starboard.',
      'Execute a gybe to starboard.'
    ),
    '/{id}/dodge': {
      parameters: [{ $ref: '#/components/parameters/AutopilotIdParam' }],
      post: {
        tags: ['autopilot'],
        summary: 'Turn on dodge mode.',
        description: 'Enter dodge mode at the current course setting.',
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      delete: {
        tags: ['autopilot'],
        summary: 'Turn off dodge mode.',
        description: 'Resume steering original course.',
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      put: {
        tags: ['autopilot'],
        summary: 'Steer port / starboard to dodge obstacles.',
        description:
          'Override the current course to change direction the supplied number of degrees / radians.',
        requestBody: {
          description: '+/- value to change direction (-ive = port).',
          required: true,
          content: {
            'application/json': {
              schema: toOpenApiSchema(AngleInputSchema)
            }
          }
        },
        responses: {
          '200': { $ref: '#/components/responses/200ActionResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/courseCurrentPoint': actionEndpoint(
      'Steer to the currently set destination position.',
      'Provider plugin will instruct the autopilot to steer to the destination position.'
    ),
    '/{id}/courseNextPoint': actionEndpoint(
      'Advance to next waypoint in route.',
      'Provider plugin will instruct the autopilot to advance to the next waypoint along the route.'
    ),
    '/_providers': {
      get: {
        tags: ['provider'],
        summary: 'Retrieve list of registered autopilot providers.',
        responses: {
          default: {
            description: 'List of provider identifiers',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }
}
