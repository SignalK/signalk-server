import { OpenApiDescription } from '../swagger'
import notificationsApiDoc from './openApi.json'

export const notificationsApiRecord = {
  name: 'notifications',
  path: '/signalk/v1/api/vessels/self/notifications',
  apiDoc: notificationsApiDoc as unknown as OpenApiDescription
}
