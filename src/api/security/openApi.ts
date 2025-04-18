import { OpenApiDescription } from '../swagger.js'
import securityApiDoc from './openApi.json' with { type: 'json' }

export const securityApiRecord = {
  name: 'security',
  path: '/signalk/v1',
  apiDoc: securityApiDoc as unknown as OpenApiDescription
}
