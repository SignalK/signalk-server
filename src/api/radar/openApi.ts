import { OpenApiDescription } from '../swagger'
import { radarOpenApiDoc } from './openApi.gen'

export const radarApiRecord = {
  name: 'radar',
  path: '/signalk/v2/api/vessels/self/radars',
  apiDoc: radarOpenApiDoc as unknown as OpenApiDescription
}
