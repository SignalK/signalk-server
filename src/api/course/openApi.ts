import { OpenApiDescription } from '../swagger.js'
import courseApiDoc from './openApi.json' with { type: 'json' }

export const courseApiRecord = {
  name: 'course',
  path: '/signalk/v2/api/vessels/self/navigation',
  apiDoc: courseApiDoc as unknown as OpenApiDescription
}
