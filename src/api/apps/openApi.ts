import { OpenApiDescription } from '../swagger'
import { appsOpenApiDoc } from './openApi.gen'

export const appsApiRecord = {
  name: 'apps',
  path: '/',
  apiDoc: appsOpenApiDoc as unknown as OpenApiDescription
}
