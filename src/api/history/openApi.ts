import { OpenApiDescription } from '../swagger'
import historyApiDoc from './openApi.json'

export const historyApiRecord = {
  name: 'history',
  path: '/signalk/v2/api/history',
  apiDoc: historyApiDoc as unknown as OpenApiDescription
}

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
historyApiDoc.paths['/values'].get.parameters[0].example =
  yesterday.toISOString()
historyApiDoc.paths['/values'].get.parameters[1].example =
  new Date().toISOString()
