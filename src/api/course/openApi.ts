import { OpenApiDescription } from '../swagger'
import courseApiDoc from './openApi.json'

export const courseApiRecord = {
  name: 'course',
  path: '/signalk/v2/api/vessels/self/navigation',
  apiDoc: courseApiDoc as unknown as OpenApiDescription
}
