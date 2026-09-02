import { OpenApiDescription } from '../swagger'
import { typeboxToOpenApiSchemas } from '../openApiSchemas'
import {
  AlertPrioritySchema,
  AlertSchema,
  AlertStateSchema,
  HistoryEntrySchema,
  HistoryEventTypeSchema,
  HistoryQueryResultSchema,
  RaiseAlertRequestSchema,
  StoreStatusSchema,
  TransitionResultSchema
} from '@signalk/server-api/typebox'

const alertsApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '2.0.0',
    title: 'Signal K Alerts API',
    description:
      'Alert lifecycle management: one active alert per path, ' +
      'acknowledgment, silencing, escalation and a persisted audit trail.',
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
  servers: [{ url: '/signalk/v2/api/alerts' }],
  tags: [
    { name: 'Alerts', description: 'The active alert set' },
    { name: 'Actions', description: 'Lifecycle actions on one alert' },
    { name: 'History', description: 'The audit trail' }
  ],
  components: {
    schemas: {
      ...typeboxToOpenApiSchemas([
        AlertPrioritySchema,
        AlertStateSchema,
        HistoryEventTypeSchema,
        AlertSchema,
        RaiseAlertRequestSchema,
        TransitionResultSchema,
        HistoryEntrySchema,
        HistoryQueryResultSchema,
        StoreStatusSchema
      ]),
      ErrorResponse: {
        type: 'object',
        required: ['state', 'statusCode', 'message'],
        properties: {
          state: { type: 'string', enum: ['FAILED'] },
          statusCode: { type: 'integer' },
          message: { type: 'string' }
        }
      }
    },
    responses: {
      ErrorResponse: {
        description: 'Failed operation',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      },
      NotFound: {
        description: 'No alert with that id',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      }
    },
    parameters: {
      AlertId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['Alerts'],
        summary: 'The active alert set, in the order an operator reads it.',
        parameters: [
          {
            name: 'state',
            in: 'query',
            schema: { $ref: '#/components/schemas/AlertState' }
          },
          {
            name: 'priority',
            in: 'query',
            schema: { $ref: '#/components/schemas/AlertPriority' }
          },
          { name: 'group', in: 'query', schema: { type: 'string' } },
          { name: 'stale', in: 'query', schema: { type: 'boolean' } }
        ],
        responses: {
          '200': {
            description: 'The active alerts',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Alert' }
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      },
      post: {
        tags: ['Alerts'],
        summary: 'Raise an alert, or update the one already on that path.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RaiseAlertRequest' }
            }
          }
        },
        responses: {
          '201': {
            description: 'The alert',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Alert' }
              }
            }
          },
          '409': { $ref: '#/components/responses/ErrorResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/status': {
      get: {
        tags: ['Alerts'],
        summary: 'Whether alert state is being persisted.',
        responses: {
          '200': {
            description: 'Store status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StoreStatus' }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/history': {
      get: {
        tags: ['History'],
        summary: 'The audit trail.',
        parameters: [
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' }
          },
          { name: 'alertId', in: 'query', schema: { type: 'string' } },
          { name: 'path', in: 'query', schema: { type: 'string' } },
          {
            name: 'eventType',
            in: 'query',
            schema: { $ref: '#/components/schemas/HistoryEventType' }
          },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          '200': {
            description: 'Matching entries and the total before paging',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HistoryQueryResult' }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/silence-all': {
      post: {
        tags: ['Actions'],
        summary: 'Silence every active alert for its maximum duration.',
        responses: {
          '200': { description: 'Silenced' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}': {
      get: {
        tags: ['Alerts'],
        summary: 'One alert.',
        parameters: [{ $ref: '#/components/parameters/AlertId' }],
        responses: {
          '200': {
            description: 'The alert',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Alert' }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/acknowledge': {
      post: {
        tags: ['Actions'],
        summary: 'Acknowledge an alert.',
        parameters: [{ $ref: '#/components/parameters/AlertId' }],
        responses: {
          '200': {
            description: 'The transition',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransitionResult' }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/escalate': {
      post: {
        tags: ['Actions'],
        summary: 'Raise an alert to a higher priority.',
        parameters: [{ $ref: '#/components/parameters/AlertId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['priority'],
                properties: {
                  priority: { $ref: '#/components/schemas/AlertPriority' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'The escalated alert',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Alert' }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/ErrorResponse' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/silence': {
      post: {
        tags: ['Actions'],
        summary: 'Silence one alert, for a while.',
        parameters: [{ $ref: '#/components/parameters/AlertId' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  duration: {
                    type: 'number',
                    description:
                      'Seconds. Capped by the configured maximum, which is ' +
                      'shorter for an emergency.'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'The silenced alert',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Alert' }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/{id}/condition': {
      put: {
        tags: ['Actions'],
        summary: 'Report whether the condition is still present.',
        parameters: [{ $ref: '#/components/parameters/AlertId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['active'],
                properties: { active: { type: 'boolean' } }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'The transition',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransitionResult' }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    }
  }
}

export const alertsApiRecord = {
  name: 'alerts',
  path: '/signalk/v2/api/alerts',
  apiDoc: alertsApiDoc as unknown as OpenApiDescription
}
