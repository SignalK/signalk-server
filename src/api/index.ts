import { IRouter } from 'express'
import { SignalKMessageHub, WithConfig, WithFeatures } from '../app'
import { WithSecurityStrategy } from '../security'
import { CourseApi } from './course'
import { FeaturesApi } from './discovery'
import { ResourcesApi } from './resources'
import { AutopilotApi } from './autopilot'
import { SignalKApiId } from '@signalk/server-api'

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
  app: SignalKMessageHub &
    WithSecurityStrategy &
    IRouter &
    WithConfig &
    WithFeatures
) => {
  const apiList: Array<SignalKApiId> = []
  const resourcesApi = new ResourcesApi(app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).resourcesApi = resourcesApi
  apiList.push('resources')

  const courseApi = new CourseApi(app, resourcesApi)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).courseApi = courseApi
  apiList.push('course')

  const autopilotApi = new AutopilotApi(app)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).autopilotApi = autopilotApi
  apiList.push('autopilot')

  const featuresApi = new FeaturesApi(app)

  Promise.all([
    resourcesApi.start(),
    courseApi.start(),
    featuresApi.start(),
    autopilotApi.start()
  ])
  return apiList
}
