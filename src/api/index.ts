import { CourseApi } from './course'
import { ResourcesApi } from './resources'

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

const APIS = {
  resourcesApi: ResourcesApi,
  courseApi: CourseApi
}

export const startApis = (app: any) =>
  Promise.all(
    Object.entries(APIS).map((value: any) => {
      const [apiName, apiConstructor] = value
      const api = new apiConstructor(app)
      app[apiName] = api
      return api.start()
    })
  )