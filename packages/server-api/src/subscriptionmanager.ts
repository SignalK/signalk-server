import { RelativePositionOrigin } from '.'
import { Context, Delta, Path } from './deltas'

export interface SubscriptionManager {
  subscribe(
    command: SubscribeMessage,
    unsubscribes: Unsubscribes,
    errorCallback: (err: unknown) => void,
    callback: SubscribeCallback,
    user?: string
  ): void

  unsubscribe(msg: UnsubscribeMessage, unsubscribes: Unsubscribes): void
}

export type SubscribeCallback = (delta: Delta) => void

export type Unsubscribes = Array<() => void>

/**
 * A message to allow a client to subscribe for data updates from a signalk server
 *
 * @see [SignalK Specification: Subscription Protocol](https://signalk.org/specification/1.7.0/doc/subscription_protocol.html?highlight=subscribe#introduction)
 */
export interface SubscribeMessage {
  /**
   * The context path for all subsequent paths, usually a vessel's path.
   */
  context: Context | RelativePositionOrigin

  /**
   * An array of paths to subscribe to, with optional criteria
   */
  subscribe: SubscriptionOptions[]
}

/** @inline */
type FixedPolicyOptions = {
  /**
   * - `fixed` - Send the last known values every `period`.
   * - `inline` - Send all changes as fast as they are received, but no faster than `minPeriod`. With this policy the client has an immediate copy of the current state of the server.
   */
  policy?: 'fixed'

  /**
   * The subscription will be sent every period millisecs.
   */
  period?: number

  /**
   * If policy=immediate or ideal, consecutive messages will be buffered until minPeriod has expired so the receiver is not swamped.
   */
  minPeriod?: never
}

/** @inline docs inherited from above */
type InstantPolicyOptions = {
  policy?: 'instant'
  minPeriod?: number
  period?: never
}

/**
 * A path object with optional criteria to control output
 * @inline
 */
export type SubscriptionOptions = (
  | FixedPolicyOptions
  | InstantPolicyOptions
) & {
  /**
   * The path to subscribe to.
   */
  path?: Path

  /**
   * The signal K format to use for the message. Only `delta` is currently supported. See [Signal K Data Model](https://signalk.org/specification/1.7.0/doc/data_model.html)
   */
  format?: 'delta'
}

/**
 * A message to allow a client to unsubscribe from data updates from a signalk server
 */
export interface UnsubscribeMessage {
  /**
   * The root path for all subsequent paths, usually a vessel's path.
   *
   * > [!NOTE]
   * > Currently only `*` is supported for the context.
   */
  context: '*'

  /**
   * An array of paths to unsubscribe from.

  * > [!NOTE]
   * > Currently only one entry is supported, and it must have `"path": "*"`.
   */
  unsubscribe: [
    {
      path: '*'
    }
  ]
}
