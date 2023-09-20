import { OpenApiDescription } from '../swagger'
import featuresApiDoc from './openApi.json'

export const featuresApiRecord = {
  name: 'features',
  path: '/signalk/v2/api/features',
  apiDoc: featuresApiDoc as unknown as OpenApiDescription
}
