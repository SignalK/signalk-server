import { getPathFromKey } from './pathUtils'

// Only subscribes to visible paths for continuous updates, but uses
// announceNewPaths: true so the server announces all existing/new paths once.
// State machine: IDLE -> SUBSCRIBED <-> RESUBSCRIBING

const STATE = {
  IDLE: 'idle',
  SUBSCRIBED: 'subscribed',
  RESUBSCRIBING: 'resubscribing'
} as const

type SubscriptionState = (typeof STATE)[keyof typeof STATE]

// Debug logging - can be disabled by setting to false
const DEBUG = false
const log = (...args: unknown[]) =>
  DEBUG && console.log('[GranularSub]', ...args)

interface SubscriptionMessage {
  context: string
  announceNewPaths?: boolean
  subscribe?: Array<{ path: string }>
  unsubscribe?: Array<{ path: string }>
}

type MessageHandler = (msg: unknown) => void

interface WebSocketLike {
  send: (data: string) => void
  readyState?: number
}

class GranularSubscriptionManager {
  private webSocket: WebSocketLike | null = null
  private state: SubscriptionState = STATE.IDLE
  private currentPaths: Set<string> = new Set()
  private pendingPaths: Set<string> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private messageHandler: MessageHandler | null = null

  // Configuration
  private readonly DEBOUNCE_MS = 350
  private readonly OVERSCAN = 20
  private readonly SIMILARITY_THRESHOLD = 0.8

  setWebSocket(ws: WebSocketLike | null): void {
    this.webSocket = ws
  }

  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  /**
   * Start subscription - immediately subscribe with announceNewPaths
   * The server will announce all existing paths (once) and any new paths as they appear
   */
  startDiscovery(): void {
    if (!this.webSocket) {
      return
    }

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
  requestPaths(visiblePathKeys: string[], allPathKeys: string[]): void {
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
  private _expandWithOverscan(
    visiblePathKeys: string[],
    allPathKeys: string[]
  ): Set<string> {
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
  private _pathsAreSimilar(
    currentPaths: Set<string>,
    newPaths: Set<string>
  ): boolean {
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
  private _executeResubscription(newPaths: Set<string>): void {
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

      const subMsg: SubscriptionMessage = {
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
   * When context is "all", keys are prefixed: "context\0path$source" -> strip context prefix first
   */
  private _extractUniquePaths(path$SourceKeys: Set<string>): string[] {
    const paths = new Set<string>()
    for (const pk of path$SourceKeys) {
      const nullIdx = pk.indexOf('\0')
      const key = nullIdx >= 0 ? pk.slice(nullIdx + 1) : pk
      const path = getPathFromKey(key)
      if (path) {
        paths.add(path)
      }
    }
    return [...paths]
  }

  /**
   * Handle incoming WebSocket message - forward to external handler
   */
  handleMessage(msg: unknown): void {
    if (this.messageHandler) {
      this.messageHandler(msg)
    }
  }

  /**
   * Unsubscribe from all paths - used during pause/cleanup
   */
  unsubscribeAll(): void {
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
      } catch {
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
  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingPaths = null
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    state: SubscriptionState
    currentPathsCount: number
    hasPending: boolean
    hasDebounceTimer: boolean
  } {
    return {
      state: this.state,
      currentPathsCount: this.currentPaths.size,
      hasPending: this.pendingPaths !== null,
      hasDebounceTimer: this.debounceTimer !== null
    }
  }

  private _send(msg: SubscriptionMessage): void {
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
      } catch {
        // WebSocket may not be ready
      }
    }
  }
}

const granularSubscriptionManager = new GranularSubscriptionManager()

export default granularSubscriptionManager
export { GranularSubscriptionManager, STATE }
