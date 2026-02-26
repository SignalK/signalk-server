import { OpenApiDescription } from '../swagger'
import { discoveryOpenApiDoc } from './openApi.gen'

export const discoveryApiRecord = {
  name: 'discovery',
  path: '',
  apiDoc: discoveryOpenApiDoc as unknown as OpenApiDescription
}
