import { OpenApiDescription } from '../swagger'
import autopilotApiDoc from './openApi.json'

export const autopilotApiRecord = {
  name: 'autopilot',
  path: '/signalk/v2/api/vessels/self/autopilot',
  apiDoc: autopilotApiDoc as unknown as OpenApiDescription
}
