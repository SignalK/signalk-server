import { OpenApiDescription } from '../swagger'
import discoveryApiDoc from './openApi.json'

export const discoveryApiRecord = {
  name: 'discovery',
  path: '',
  apiDoc: discoveryApiDoc as unknown as OpenApiDescription
}
