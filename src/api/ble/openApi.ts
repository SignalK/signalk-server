import { OpenApiDescription } from '../swagger'
import bleApiDoc from './openApi.json'

export const bleApiRecord = {
  name: 'ble',
  path: '/signalk/v2/api/vessels/self/ble',
  apiDoc: bleApiDoc as unknown as OpenApiDescription
}
