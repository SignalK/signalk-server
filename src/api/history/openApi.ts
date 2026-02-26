import { OpenApiDescription } from '../swagger'
import { historyOpenApiDoc } from './openApi.gen'

export const historyApiRecord = {
  name: 'history',
  path: '/signalk/v2/api/history',
  apiDoc: historyOpenApiDoc as unknown as OpenApiDescription
}
