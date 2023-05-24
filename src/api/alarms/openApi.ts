import { OpenApiDescription } from '../swagger'
import alarmsApiDoc from './openApi.json'

export const alarmsApiRecord = {
  name: 'alarms',
  path: '/signalk/v2/api/notifications',
  apiDoc: alarmsApiDoc as unknown as OpenApiDescription
}
