import { OpenApiDescription } from '../swagger'

const communicationsApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '0.0.1',
    title: 'Signal K Communications API',
    description:
      'A queryable log of received digital messages (DSC in v1; NAVTEX and AIS safety text later). Distress, urgency, and safety calls also raise notifications; the log entry mirrors the notification ack/clear lifecycle in its `disposition`.',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  servers: [{ url: '/signalk/v2/api/communications' }],
  components: {
    schemas: {
      MessageLogEntry: {
        type: 'object',
        required: [
          'id',
          'type',
          'receivedAt',
          'priority',
          'sender',
          'summary',
          'payload',
          'raw',
          'disposition'
        ],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['dsc'] },
          receivedAt: { type: 'string', format: 'date-time' },
          sourceRef: { type: 'string' },
          transport: { type: 'string', enum: ['nmea0183', 'nmea2000'] },
          priority: {
            type: 'string',
            enum: ['distress', 'urgency', 'safety', 'routine']
          },
          sender: {
            type: 'object',
            properties: {
              mmsi: { type: 'string' },
              name: { type: 'string' }
            }
          },
          subject: {
            type: 'object',
            properties: { mmsi: { type: 'string' } }
          },
          position: {
            type: 'object',
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' }
            }
          },
          summary: { type: 'string' },
          payload: {},
          raw: { type: 'string' },
          notificationId: { type: 'string' },
          disposition: {
            type: 'object',
            properties: {
              acknowledgedAt: { type: 'string', format: 'date-time' },
              clearedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  },
  paths: {
    '/messages': {
      get: {
        tags: ['communications'],
        summary: 'Query the received-message log.',
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
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['dsc'] }
          },
          {
            name: 'priority',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['distress', 'urgency', 'safety', 'routine']
            }
          },
          {
            name: 'sender',
            in: 'query',
            schema: { type: 'string' },
            description: 'Sender MMSI'
          },
          {
            name: 'limit',
            in: 'query',
            description:
              'Maximum number of entries to return. Defaults to 100, capped at 1000.',
            schema: { type: 'integer' }
          },
          {
            name: 'order',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'] }
          }
        ],
        responses: {
          '200': {
            description: 'Matching log entries, ordered by receivedAt.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MessageLogEntry' }
                }
              }
            }
          },
          '400': {
            description: '`from` or `to` is not a parseable timestamp.'
          },
          '500': { description: 'Query failed.' }
        }
      }
    },
    '/messages/{id}': {
      get: {
        tags: ['communications'],
        summary: 'Get a single log entry by id.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'The log entry.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageLogEntry' }
              }
            }
          },
          '404': { description: 'Not found.' },
          '500': { description: 'Read failed.' }
        }
      }
    }
  }
}

export const communicationsApiRecord = {
  name: 'communications',
  path: '/signalk/v2/api/communications',
  apiDoc: communicationsApiDoc as unknown as OpenApiDescription
}
