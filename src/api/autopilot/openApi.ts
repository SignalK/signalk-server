import { OpenApiDescription } from '../swagger'
import { autopilotOpenApiDoc } from './openApi.gen'

export const autopilotApiRecord = {
  name: 'autopilot',
  path: '/signalk/v2/api/vessels/self/autopilots',
  apiDoc: autopilotOpenApiDoc as unknown as OpenApiDescription
}
