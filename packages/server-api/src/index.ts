export * from './plugin'
export * from './serverapi'
export * from './deltas'
export * from './coursetypes'
export * from './resourcetypes'
export * from './resourcesapi'
export * from './features'
export * from './course'
export * from './autopilotapi'
export * from './autopilotapi.guard'
export * from './propertyvalues'
export * from './brand'
export * from './streambundle'
export * from './subscriptionmanager'

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
