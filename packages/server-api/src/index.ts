export * from './plugin.js'
export * from './serverapi.js'
export * from './deltas.js'
export * from './coursetypes.js'
export * from './resourcetypes.js'
export * from './resourcesapi.js'
export * from './features.js'
export * from './course.js'
export * from './autopilotapi.js'
export * from './autopilotapi.guard.js'
export * from './propertyvalues.js'
export * from './brand.js'
export * from './streambundle.js'
export * from './subscriptionmanager.js'

export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

export interface RelativePositionOrigin {
  radius: number
  position: Position
}

export interface ActionResult {
  state: 'COMPLETED' | 'PENDING' | 'FAILED'
  statusCode: number
  message?: string
  resultStatus?: number
}

export enum SKVersion {
  v1 = 'v1',
  v2 = 'v2'
}
