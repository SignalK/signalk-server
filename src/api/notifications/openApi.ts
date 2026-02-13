import { OpenApiDescription } from '../swagger'
import { notificationsOpenApiDoc } from './openApi.gen'

export const notificationsApiRecord = {
  name: 'notifications',
  path: '/signalk/v1/api/vessels/self/notifications',
  apiDoc: notificationsOpenApiDoc as unknown as OpenApiDescription
}
