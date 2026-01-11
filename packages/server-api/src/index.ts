export * from './plugin'
export * from './serverapi'
export * from './deltas'
export * from './coursetypes'
export * from './resourcetypes'
export * from './resourcesapi'
export * from './features'
export * from './course'
export * from './autopilotapi'
export * from './mmsi/mmsi'
export * from './propertyvalues'
export * from './brand'
export * from './weatherapi'
export * as radar from './radarapi'
export * from './streambundle'
export * from './subscriptionmanager'
/** @category History API */
export * as history from './history'

/** @category  Server API */
export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

/** @category  Server API */
export interface RelativePositionOrigin {
  radius: number
  position: Position
}

/** @category  Server API */
export enum SKVersion {
  v1 = 'v1',
  v2 = 'v2'
}
