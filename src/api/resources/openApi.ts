import { OpenApiDescription } from '../swagger'
import { resourcesOpenApiDoc } from './openApi.gen'

export const resourcesApiRecord = {
  name: 'resources',
  path: '/signalk/v2/api',
  apiDoc: resourcesOpenApiDoc as unknown as OpenApiDescription
}
