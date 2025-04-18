import { OpenApiDescription } from '../swagger.js'
import discoveryApiDoc from './openApi.json' with { type: 'json' }

export const discoveryApiRecord = {
  name: 'discovery',
  path: '',
  apiDoc: discoveryApiDoc as unknown as OpenApiDescription
}
