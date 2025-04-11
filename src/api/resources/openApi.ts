import { OpenApiDescription } from '../swagger.js'
import resourcesApiDoc from './openApi.json' with { type: 'json' }

export const resourcesApiRecord = {
  name: 'resources',
  path: '/signalk/v2/api',
  apiDoc: resourcesApiDoc as unknown as OpenApiDescription
}
