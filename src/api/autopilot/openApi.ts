import { OpenApiDescription } from '../swagger.js'
import autopilotApiDoc from './openApi.json' with { type: 'json' }

export const autopilotApiRecord = {
  name: 'autopilot',
  path: '/signalk/v2/api/vessels/self/autopilots',
  apiDoc: autopilotApiDoc as unknown as OpenApiDescription
}
