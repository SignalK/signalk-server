import { OpenApiDescription } from '../swagger'
import weatherApiDoc from './openApi.json'

export const weatherApiRecord = {
  name: 'weather',
  path: '/signalk/v2/api',
  apiDoc: weatherApiDoc as unknown as OpenApiDescription
}
