import { OpenApiDescription } from '../swagger'
import appsApiDoc from './openApi.json'

export const appsApiRecord = {
  name: 'apps',
  path: '/',
  apiDoc: appsApiDoc as unknown as OpenApiDescription
}
