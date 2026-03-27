import { OpenApiDescription } from '../swagger'

/* eslint-disable @typescript-eslint/no-explicit-any */
const containerJobsApiDoc: any = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Signal K Container Jobs API',
    description:
      'API for monitoring container jobs run by plugins via the server container runtime (Podman or Docker).'
  },
  paths: {
    '/': {
      get: {
        summary: 'List all tracked container jobs',
        parameters: [
          {
            name: 'label',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filter jobs by label substring match'
          }
        ],
        responses: {
          '200': {
            description: 'Array of container job results',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ContainerJobResult' }
                }
              }
            }
          },
          '403': { description: 'Unauthorised' }
        }
      }
    },
    '/runtime': {
      get: {
        summary: 'Get detected container runtime information',
        responses: {
          '200': {
            description: 'Container runtime info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContainerRuntimeInfo' }
              }
            }
          },
          '403': { description: 'Unauthorised' }
        }
      }
    },
    '/{jobId}': {
      get: {
        summary: 'Get a specific container job',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': {
            description: 'Container job result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContainerJobResult' }
              }
            }
          },
          '403': { description: 'Unauthorised' },
          '404': { description: 'Job not found' }
        }
      },
      delete: {
        summary: 'Remove a completed or failed job from tracking',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          '200': { description: 'Job removed' },
          '403': { description: 'Unauthorised' },
          '404': { description: 'Job not found' },
          '409': { description: 'Cannot delete an active job' }
        }
      }
    },
    '/images/prune': {
      post: {
        summary:
          'Remove dangling (unused) container images to reclaim disk space',
        responses: {
          '200': {
            description: 'Prune completed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: { type: 'string' },
                    statusCode: { type: 'integer' },
                    imagesRemoved: { type: 'integer' },
                    spaceReclaimed: { type: 'string' }
                  }
                }
              }
            }
          },
          '403': { description: 'Unauthorised' },
          '503': { description: 'No container runtime available' }
        }
      }
    }
  },
  components: {
    schemas: {
      ContainerJobResult: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['pending', 'pulling', 'running', 'completed', 'failed']
          },
          image: { type: 'string' },
          command: { type: 'array', items: { type: 'string' } },
          label: { type: 'string' },
          exitCode: { type: 'integer', nullable: true },
          log: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          runtime: { type: 'string', enum: ['podman', 'docker'] }
        }
      },
      ContainerRuntimeInfo: {
        type: 'object',
        properties: {
          runtime: {
            type: 'string',
            enum: ['podman', 'docker'],
            nullable: true
          },
          version: { type: 'string' },
          isPodmanDockerShim: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}

export const containerJobsApiRecord = {
  name: 'containerjobs',
  path: '/signalk/v2/api/containerjobs',
  apiDoc: containerJobsApiDoc as OpenApiDescription
}
