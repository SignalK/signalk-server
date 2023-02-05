import { OpenApiDescription } from '../swagger'
import resourcesApiDoc from './openApi.json'

export const resourcesApiRecord = {
  name: 'resources',
  path: '/signalk/v2/api',
  apiDoc: resourcesApiDoc as unknown as OpenApiDescription
}
