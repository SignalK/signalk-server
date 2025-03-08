import { OpenApiDescription } from '../swagger'
import alertsApiDoc from './openApi.json'

export const alertsApiRecord = {
  name: 'alerts',
  path: '/signalk/v2/api/alerts',
  apiDoc: alertsApiDoc as unknown as OpenApiDescription
}
