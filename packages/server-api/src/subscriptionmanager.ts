import { RelativePositionOrigin } from '.'
import { Context, Delta, Path, SourceRef } from './deltas'

/** @category Server API  */
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

/** @category Server API  */
export type SubscribeCallback = (delta: Delta) => void

/** @category Server API  */
export type Unsubscribes = Array<() => void>

/**
 * A message to allow a client to subscribe for data updates from a signalk server
 *
 * @see [SignalK Specification: Subscription Protocol](https://signalk.org/specification/1.7.0/doc/subscription_protocol.html?highlight=subscribe#introduction)
 * @category Server API
 */
export interface SubscribeMessage {
  /**
   * The context path for all subsequent paths, usually a vessel's path.
   */
  context: Context | RelativePositionOrigin

  /**
   * An array of paths to subscribe to, with optional criteria.
   *
   * On a WebSocket or TCP connection, a row identical to one the connection
   * already receives, by the criteria an {@link UnsubscribeMessage} matches
   * on, adds no second delivery; its cached values are replayed all the same.
   * Each plugin subscribe call keeps rows of its own.
   */
  subscribe: SubscriptionOptions[]

  /**
   * When true, the server will send cached values for ALL paths matching the context
   * filter once (for discovery), plus announce any new paths that appear later.
   * This allows clients using granular subscriptions to discover available paths
   * without subscribing to everything continuously.
   *
   * Repeating it on a connection replays the existing paths again but adds
   * no second listener for new ones. The listener lasts until unsubscribe-all.
   */
  announceNewPaths?: boolean

  /**
   * Controls which sources are included in deltas.
   * - `preferred` (default): only the preferred source per path (based on source priorities)
   * - `all`: all sources for every path, useful for source comparison and diagnostics
   */
  sourcePolicy?: 'preferred' | 'all'

  /**
   * Drop the listed source refs from the candidate set used by the
   * priority cascade. The subscription still receives the
   * priority-resolved single winner per path, just computed over the
   * remaining sources. Use this to let a derived-data plugin subscribe
   * to upstream sources with the user's priority ranking applied,
   * without seeing its own output in the cascade.
   *
   * Effective only when `sourcePolicy` is `'preferred'` (the default).
   * Ignored under `sourcePolicy: 'all'`, which already bypasses
   * priority resolution.
   *
   * When combined with `excludeSelf`, the union of both sets is
   * excluded.
   */
  excludeSources?: SourceRef[]

  /**
   * Plugin-API shorthand for `excludeSources: [<this plugin's id>]`.
   * Resolved on the server side, so plugins don't need to know their
   * own id. Useful for plugins that publish on the same path they
   * consume — without the exclude their own output would dominate the
   * priority cascade and they'd never see any other source.
   *
   * Only meaningful for subscriptions made through
   * `app.subscriptionmanager.subscribe()` from inside a plugin. On
   * WebSocket subscriptions there is no plugin identity to resolve
   * against, and `excludeSelf` is ignored — WebSocket clients should
   * use the explicit `excludeSources` form.
   *
   * Effective only when `sourcePolicy` is `'preferred'` (the default).
   */
  excludeSelf?: boolean
}

/** @inline
 */
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

/** @inline docs inherited from above
 */
type InstantPolicyOptions = {
  policy?: 'instant'
  minPeriod?: number
  period?: never
}

/**
 * A path object with optional criteria to control output
 * @inline
 * @category Server API
 */
export type SubscriptionOptions = (
  FixedPolicyOptions | InstantPolicyOptions
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
 * A message to allow a client to unsubscribe from data updates from a signalk server.
 *
 * `{"context": "*", "unsubscribe": [{"path": "*"}]}` ends every subscription.
 * Any other message ends the subscription rows it echoes: a row ends when
 * the context, its path, period, minPeriod and policy, and the message's
 * sourcePolicy and excludeSources are the same as when it was subscribed.
 * A row that matches nothing is ignored, and a row subscribed with context
 * `*` and path `*` ends only with every other subscription. For a plugin,
 * this ends the matching rows of every subscribe call made with the same
 * `unsubscribes` array.
 *
 * Servers without this accept only unsubscribe-all: their WebSocket and
 * TCP interfaces close the connection on any other unsubscribe, and their
 * plugin API throws. WebSocket and TCP clients can check for
 * `granularUnsubscribe` in the `capabilities` of the hello message.
 * @category Server API
 */
export interface UnsubscribeMessage {
  /**
   * The context the rows were subscribed with, or `*`.
   */
  context: Context | RelativePositionOrigin | '*'

  /**
   * The rows to unsubscribe, each as it was subscribed.
   */
  unsubscribe: UnsubscribeOptions[]

  /**
   * The `sourcePolicy` the rows were subscribed with.
   */
  sourcePolicy?: 'preferred' | 'all'

  /**
   * The `excludeSources` the rows were subscribed with.
   */
  excludeSources?: SourceRef[]

  /**
   * The `excludeSelf` the rows were subscribed with, for plugin subscriptions.
   */
  excludeSelf?: boolean
}

/**
 * A subscription row to end, with the criteria it was subscribed with.
 * @inline
 * @category Server API
 */
export type UnsubscribeOptions = (FixedPolicyOptions | InstantPolicyOptions) & {
  /**
   * The path pattern the row was subscribed with. A literal path does not
   * end a row subscribed with a wildcard pattern. An entry without a path
   * is ignored, as is a subscribe row without one.
   */
  path?: Path | '*'
}
