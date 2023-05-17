import { IRouter } from 'express'
import { SignalKMessageHub, WithConfig } from '../app'
import { WithSecurityStrategy } from '../security'
import { CourseApi } from './course'
import { ResourcesApi } from './resources'
import { AutopilotApi } from './autopilot'

export interface ApiResponse {
  state: 'FAILED' | 'COMPLETED' | 'PENDING'
  statusCode: number
  message: string
  requestId?: string
  href?: string
  token?: string
}

export const Responses = {
  ok: {
    state: 'COMPLETED',
    statusCode: 200,
    message: 'OK'
  },
  invalid: {
    state: 'FAILED',
    statusCode: 400,
    message: `Invalid Data supplied.`
  },
  unauthorised: {
    state: 'FAILED',
    statusCode: 403,
    message: 'Unauthorised'
  },
  notFound: {
    state: 'FAILED',
    statusCode: 404,
    message: 'Resource not found.'
  }
}

export const startApis = (
  app: SignalKMessageHub & WithSecurityStrategy & IRouter & WithConfig
) => {
  const resourcesApi = new ResourcesApi(app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).resourcesApi = resourcesApi
  const courseApi = new CourseApi(app, resourcesApi)
  const autopilotApi = new AutopilotApi(app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).autopilotApi = autopilotApi
  Promise.all([resourcesApi.start(), courseApi.start(), autopilotApi.start()])
}
