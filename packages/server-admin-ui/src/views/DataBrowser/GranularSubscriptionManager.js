import { getPathFromKey } from './pathUtils'

/**
 * GranularSubscriptionManager - Manages visible-only WebSocket subscriptions
 *
 * Strategy:
 * 1. Subscribe to visible paths with announceNewPaths: true
 *    - Server announces ALL existing paths matching context (once each)
 *    - Server announces NEW paths as they appear (once each)
 * 2. Only receive continuous updates for explicitly subscribed (visible) paths
 * 3. Debounce subscription changes during scroll (350ms)
 * 4. Handle "unsubscribe all, resubscribe new set" atomically
 *
 * State machine: IDLE -> SUBSCRIBED <-> RESUBSCRIBING
 */

const STATE = {
  IDLE: 'idle',
  SUBSCRIBED: 'subscribed',
  RESUBSCRIBING: 'resubscribing'
}

// Debug logging - can be disabled by setting to false
const DEBUG = false
const log = (...args) => DEBUG && console.log('[GranularSub]', ...args)

class GranularSubscriptionManager {
  constructor() {
    this.webSocket = null
    this.state = STATE.IDLE
    this.currentPaths = new Set()
    this.pendingPaths = null
    this.debounceTimer = null
    this.messageHandler = null

    // Configuration
    this.DEBOUNCE_MS = 350
    this.OVERSCAN = 20
    this.SIMILARITY_THRESHOLD = 0.8
  }

  setWebSocket(ws) {
    this.webSocket = ws
  }

  setMessageHandler(handler) {
    this.messageHandler = handler
  }

  /**
   * Start subscription - immediately subscribe with announceNewPaths
   * The server will announce all existing paths (once) and any new paths as they appear
   */
  startDiscovery() {
    if (!this.webSocket) return

    log('Starting subscription with announceNewPaths')

    // Subscribe with announceNewPaths to discover all paths
    // Server will send cached values for ALL paths matching context (once each)
    // and announce any new paths that appear later
    this._send({
      context: '*',
      announceNewPaths: true,
      subscribe: [] // Empty initially, will be populated by requestPaths
    })

    this.state = STATE.SUBSCRIBED

    // If there are pending paths from before WebSocket was ready, apply them now
    if (this.pendingPaths && this.pendingPaths.size > 0) {
      const pending = this.pendingPaths
      this.pendingPaths = null
      this._executeResubscription(pending)
    }
  }

  /**
   * Request subscription to specific paths (debounced)
   * Called by VirtualizedDataTable when visible range changes
   */
  requestPaths(visiblePathKeys, allPathKeys) {
    if (!visiblePathKeys || visiblePathKeys.length === 0 || !allPathKeys) {
      return
    }

    // Calculate paths with overscan
    const targetPaths = this._expandWithOverscan(visiblePathKeys, allPathKeys)

    // If not yet connected, queue the request
    if (this.state === STATE.IDLE) {
      this.pendingPaths = targetPaths
      log('Queued paths (not yet connected):', targetPaths.size)
      return
    }

    // If paths haven't changed significantly, skip
    if (this._pathsAreSimilar(this.currentPaths, targetPaths)) {
      return
    }

    log(
      'Paths changed, scheduling resubscription. Target:',
      targetPaths.size,
      'Current:',
      this.currentPaths.size
    )

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Debounce the subscription change
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this._executeResubscription(targetPaths)
    }, this.DEBOUNCE_MS)
  }

  /**
   * Expand visible paths with overscan buffer for smooth scrolling
   */
  _expandWithOverscan(visiblePathKeys, allPathKeys) {
    if (!visiblePathKeys || visiblePathKeys.length === 0) {
      return new Set()
    }

    // Find indices of first and last visible paths in the full list
    const firstVisible = allPathKeys.indexOf(visiblePathKeys[0])
    const lastVisible = allPathKeys.indexOf(
      visiblePathKeys[visiblePathKeys.length - 1]
    )

    if (firstVisible === -1 || lastVisible === -1) {
      // Fallback: just use visible paths
      return new Set(visiblePathKeys)
    }

    // Expand range with overscan
    const startIdx = Math.max(0, firstVisible - this.OVERSCAN)
    const endIdx = Math.min(allPathKeys.length - 1, lastVisible + this.OVERSCAN)

    return new Set(allPathKeys.slice(startIdx, endIdx + 1))
  }

  /**
   * Check if two path sets are similar enough to skip resubscription
   * This prevents unnecessary churn during small scroll movements
   */
  _pathsAreSimilar(currentPaths, newPaths) {
    if (currentPaths.size === 0 && newPaths.size === 0) return true
    if (currentPaths.size === 0 || newPaths.size === 0) return false

    // Check overlap percentage
    let overlap = 0
    for (const path of newPaths) {
      if (currentPaths.has(path)) overlap++
    }

    const overlapPercent = overlap / Math.max(currentPaths.size, newPaths.size)
    return overlapPercent >= this.SIMILARITY_THRESHOLD
  }

  /**
   * Execute the resubscription - unsubscribe all, then subscribe to new set
   */
  _executeResubscription(newPaths) {
    if (!this.webSocket) return

    if (this.state === STATE.RESUBSCRIBING) {
      // Already resubscribing, queue this request
      this.pendingPaths = newPaths
      log('Already resubscribing, queued request')
      return
    }

    this.state = STATE.RESUBSCRIBING
    log('Executing resubscription for', newPaths.size, 'paths')

    // Step 1: Unsubscribe all
    this._send({
      context: '*',
      unsubscribe: [{ path: '*' }]
    })

    // Step 2: Subscribe to new paths (with small delay to ensure order)
    setTimeout(() => {
      if (!newPaths || newPaths.size === 0) {
        this.currentPaths = new Set()
        this.state = STATE.SUBSCRIBED
        return
      }

      // Extract unique paths (remove source suffix from path$SourceKeys)
      const uniquePaths = this._extractUniquePaths(newPaths)

      if (uniquePaths.length === 0) {
        this.currentPaths = new Set()
        this.state = STATE.SUBSCRIBED
        return
      }

      const subMsg = {
        context: '*',
        announceNewPaths: true, // Continue discovering new paths
        subscribe: uniquePaths.map((path) => ({ path }))
      }

      this._send(subMsg)
      this.currentPaths = newPaths
      this.state = STATE.SUBSCRIBED

      // Check if there's a pending request that came in during resubscription
      if (this.pendingPaths) {
        const pending = this.pendingPaths
        this.pendingPaths = null
        // Debounce the pending request
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null
          this._executeResubscription(pending)
        }, this.DEBOUNCE_MS)
      }
    }, 10)
  }

  /**
   * Extract unique paths from path$SourceKeys
   * path$SourceKey format: "navigation.position$sourceId" -> extract "navigation.position"
   */
  _extractUniquePaths(path$SourceKeys) {
    const paths = new Set()
    for (const pk of path$SourceKeys) {
      const path = getPathFromKey(pk)
      if (path) {
        paths.add(path)
      }
    }
    return [...paths]
  }

  /**
   * Handle incoming WebSocket message - forward to external handler
   */
  handleMessage(msg) {
    if (this.messageHandler) {
      this.messageHandler(msg)
    }
  }

  /**
   * Unsubscribe from all paths - used during pause/cleanup
   */
  unsubscribeAll() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.webSocket) {
      try {
        this._send({
          context: '*',
          unsubscribe: [{ path: '*' }]
        })
      } catch (_e) {
        // WebSocket may already be closed
      }
    }

    this.currentPaths = new Set()
    this.pendingPaths = null
    this.state = STATE.IDLE
  }

  /**
   * Cancel pending subscription changes
   */
  cancelPending() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingPaths = null
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      state: this.state,
      currentPathsCount: this.currentPaths.size,
      hasPending: this.pendingPaths !== null,
      hasDebounceTimer: this.debounceTimer !== null
    }
  }

  _send(msg) {
    if (
      this.webSocket &&
      this.webSocket.readyState !== undefined &&
      this.webSocket.readyState === WebSocket.OPEN
    ) {
      this.webSocket.send(JSON.stringify(msg))
    } else if (this.webSocket && this.webSocket.send) {
      // For WebSocket implementations without readyState check
      try {
        this.webSocket.send(JSON.stringify(msg))
      } catch (_e) {
        // WebSocket may be closed
      }
    }
  }
}

// Singleton instance
const granularSubscriptionManager = new GranularSubscriptionManager()

export default granularSubscriptionManager
export { GranularSubscriptionManager, STATE }
