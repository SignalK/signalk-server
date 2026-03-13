import { OpenApiDescription } from '../swagger'
import { weatherOpenApiDoc } from './openApi.gen'

export const weatherApiRecord = {
  name: 'weather',
  path: '/signalk/v2/api',
  apiDoc: weatherOpenApiDoc as unknown as OpenApiDescription
}
