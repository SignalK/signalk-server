import { OpenApiDescription } from '../swagger.js'
import notificationsApiDoc from './openApi.json' with { type: 'json' }

export const notificationsApiRecord = {
  name: 'notifications',
  path: '/signalk/v1/api/vessels/self/notifications',
  apiDoc: notificationsApiDoc as unknown as OpenApiDescription
}
