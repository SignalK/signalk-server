import { OpenApiDescription } from '../swagger'
import courseApiDoc from './openApi.json'

export const historyApiRecord = {
  name: 'history',
  path: '/signalk/v2/api/history',
  apiDoc: courseApiDoc as unknown as OpenApiDescription
}

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
courseApiDoc.paths['/values'].get.parameters[0].example =
  yesterday.toISOString()
courseApiDoc.paths['/values'].get.parameters[1].example =
  new Date().toISOString()
