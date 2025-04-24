import { Position } from './schema/resources'

export * from './plugin'
export * from './serverapi'
export * from './deltas'
export * from './coursetypes'
export * from './resourcesapi'
export * from './features'
export * from './course'
export * from './autopilotapi'
export * from './autopilotapi.guard'
export * from './propertyvalues'
export * from './brand'
export * from './streambundle'
export * from './subscriptionmanager'
export * from './schema/index.js'

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

/**
 * A type of all of the key paths in the given object type
 *
 * @example
 * ```ts
 * const obj = {
 *   a: {
 *     b: {
 *       c: true
 *     }
 *     d: 1
 *   }
 *   e: "hi"
 * }
 *
 * const validKeys: Paths<typeof obj> = [
 *   "a",
 *   "a.b",
 *   "a.b.c",
 *   "a.d",
 *   "e"
 * ]
 *
 * // This will be a TypeScript error
 * const invalidKeys: Paths<typeof obj> = [
 *   "a.b.c.d"
 *   "a.f",
 *   "f",
 * ]
 */
export type Paths<T> = T extends object
  ? {
    [K in keyof T]-?: K extends string | number
    ? `${K}` | Join<K, Paths<T[K]>>
    : never
  }[keyof T]
  : '';

export type Join<K, P> = K extends string | number
  ? P extends string | number
  ? `${K}.${P}`
  : never
  : never
