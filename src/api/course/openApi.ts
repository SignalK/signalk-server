import { OpenApiDescription } from '../swagger'
import { courseOpenApiDoc } from './openApi.gen'

export const courseApiRecord = {
  name: 'course',
  path: '/signalk/v2/api/vessels/self/navigation',
  apiDoc: courseOpenApiDoc as unknown as OpenApiDescription
}
