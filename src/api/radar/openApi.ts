import { OpenApiDescription } from '../swagger'
import radarApiDoc from './openApi.json'

export const radarApiRecord = {
  name: 'radar',
  path: '/signalk/v2/api/vessels/self/radars',
  apiDoc: radarApiDoc as unknown as OpenApiDescription
}
