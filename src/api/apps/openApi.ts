import { OpenApiDescription } from '../swagger.js'
import appsApiDoc from './openApi.json' with { type: 'json' }

export const appsApiRecord = {
  name: 'apps',
  path: '/',
  apiDoc: appsApiDoc as unknown as OpenApiDescription
}
