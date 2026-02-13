import { OpenApiDescription } from '../swagger'
import { securityOpenApiDoc } from './openApi.gen'

export const securityApiRecord = {
  name: 'security',
  path: '/signalk/v1',
  apiDoc: securityOpenApiDoc as unknown as OpenApiDescription
}
