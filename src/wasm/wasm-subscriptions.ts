/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Plugin Delta Subscription Management
 *
 * Manages delta subscriptions for WASM plugins, including:
 * - Subscription pattern matching
 * - Buffering during hot-reload
 * - Subscription state preservation across reloads
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:subscriptions')

export interface DeltaSubscription {
  pluginId: string
  pattern: string // Path pattern like "navigation.*" or "*"
  callback: (delta: any) => void
}

export interface Delta {
  context: string
  updates: Array<{
    source: any
    timestamp: string
    values: Array<{
      path: string
      value: any
    }>
  }>
}

export class WasmSubscriptionManager {
  // Active subscriptions by plugin ID
  private subscriptions: Map<string, DeltaSubscription[]> = new Map()

  // Buffered deltas during reload
  private buffers: Map<string, Delta[]> = new Map()

  // Buffering state
  private buffering: Set<string> = new Set()

  /**
   * Register a delta subscription for a plugin
   */
  register(
    pluginId: string,
    pattern: string,
    callback: (delta: any) => void
  ): void {
    if (!this.subscriptions.has(pluginId)) {
      this.subscriptions.set(pluginId, [])
    }

    const subscription: DeltaSubscription = {
      pluginId,
      pattern,
      callback
    }

    this.subscriptions.get(pluginId)!.push(subscription)
    debug(`Registered subscription for ${pluginId}: ${pattern}`)
  }

  /**
   * Unregister all subscriptions for a plugin
   */
  unregister(pluginId: string): void {
    const count = this.subscriptions.get(pluginId)?.length || 0
    this.subscriptions.delete(pluginId)
    debug(`Unregistered ${count} subscriptions for ${pluginId}`)
  }

  /**
   * Get all subscriptions for a plugin
   */
  getSubscriptions(pluginId: string): DeltaSubscription[] {
    return this.subscriptions.get(pluginId) || []
  }

  /**
   * Check if a delta path matches a subscription pattern
   */
  private matchesPattern(path: string, pattern: string): boolean {
    if (pattern === '*') {
      return true
    }

    // Simple glob-style matching
    // "navigation.*" matches "navigation.position", "navigation.courseOverGroundTrue", etc.
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(path)
  }

  /**
   * Route a delta to subscribed plugins
   */
  routeDelta(delta: Delta): void {
    for (const [pluginId, subs] of this.subscriptions) {
      // Check if buffering for this plugin
      if (this.buffering.has(pluginId)) {
        this.bufferDelta(pluginId, delta)
        continue
      }

      // Check if any subscription matches delta paths
      for (const sub of subs) {
        let matches = false

        for (const update of delta.updates) {
          for (const pathValue of update.values) {
            if (this.matchesPattern(pathValue.path, sub.pattern)) {
              matches = true
              break
            }
          }
          if (matches) break
        }

        if (matches) {
          try {
            sub.callback(delta)
          } catch (error) {
            debug(`Error in subscription callback for ${pluginId}:`, error)
          }
          break // Only call once per plugin per delta
        }
      }
    }
  }

  /**
   * Start buffering deltas for a plugin (during reload)
   */
  startBuffering(pluginId: string): void {
    debug(`Started buffering deltas for ${pluginId}`)
    this.buffering.add(pluginId)
    this.buffers.set(pluginId, [])
  }

  /**
   * Stop buffering and return buffered deltas
   */
  stopBuffering(pluginId: string): Delta[] {
    debug(`Stopped buffering deltas for ${pluginId}`)
    this.buffering.delete(pluginId)

    const buffered = this.buffers.get(pluginId) || []
    this.buffers.delete(pluginId)

    debug(`Returning ${buffered.length} buffered deltas for ${pluginId}`)
    return buffered
  }

  /**
   * Buffer a delta for a plugin
   */
  private bufferDelta(pluginId: string, delta: Delta): void {
    if (!this.buffers.has(pluginId)) {
      this.buffers.set(pluginId, [])
    }

    const buffer = this.buffers.get(pluginId)!
    buffer.push(delta)

    // Limit buffer size to prevent memory issues
    const MAX_BUFFER_SIZE = 1000
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift() // Remove oldest
      debug(`Buffer overflow for ${pluginId}, dropped oldest delta`)
    }
  }

  /**
   * Redirect delta routing to buffer for a plugin
   */
  redirectToBuffer(pluginId: string): void {
    this.startBuffering(pluginId)
  }

  /**
   * Restore normal delta routing for a plugin
   */
  restore(pluginId: string): void {
    this.stopBuffering(pluginId)
  }

  /**
   * Replay buffered deltas to a plugin's callback
   */
  replayBuffered(pluginId: string, callback: (delta: Delta) => void): void {
    const buffered = this.buffers.get(pluginId) || []
    debug(`Replaying ${buffered.length} buffered deltas to ${pluginId}`)

    for (const delta of buffered) {
      try {
        callback(delta)
      } catch (error) {
        debug(`Error replaying delta to ${pluginId}:`, error)
      }
    }

    // Clear buffer after replay
    this.buffers.delete(pluginId)
  }

  /**
   * Get statistics about subscriptions
   */
  getStats(): {
    totalSubscriptions: number
    activePlugins: number
    bufferingPlugins: number
    bufferedDeltas: number
  } {
    let totalSubscriptions = 0
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length
    }

    let bufferedDeltas = 0
    for (const buffer of this.buffers.values()) {
      bufferedDeltas += buffer.length
    }

    return {
      totalSubscriptions,
      activePlugins: this.subscriptions.size,
      bufferingPlugins: this.buffering.size,
      bufferedDeltas
    }
  }

  /**
   * Clear all subscriptions and buffers
   */
  clear(): void {
    this.subscriptions.clear()
    this.buffers.clear()
    this.buffering.clear()
    debug('Cleared all subscriptions and buffers')
  }
}

// Global singleton instance
let subscriptionManager: WasmSubscriptionManager | null = null

/**
 * Get the global subscription manager
 */
export function getSubscriptionManager(): WasmSubscriptionManager {
  if (!subscriptionManager) {
    subscriptionManager = new WasmSubscriptionManager()
  }
  return subscriptionManager
}

/**
 * Initialize the subscription manager
 */
export function initializeSubscriptionManager(): WasmSubscriptionManager {
  if (subscriptionManager) {
    debug('Subscription manager already initialized')
    return subscriptionManager
  }

  subscriptionManager = new WasmSubscriptionManager()
  debug('Subscription manager initialized')
  return subscriptionManager
}

/**
 * Reset the subscription manager singleton (for hotplug support)
 * This should be called after shutdown to allow re-initialization
 */
export function resetSubscriptionManager(): void {
  debug('Resetting subscription manager singleton')
  subscriptionManager = null
}
