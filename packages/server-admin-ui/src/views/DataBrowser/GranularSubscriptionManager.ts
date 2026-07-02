import { getPathFromKey } from './pathUtils'

interface SubscriptionMessage {
  context: string
  announceNewPaths?: boolean
  sourcePolicy?: 'preferred' | 'all'
  subscribe?: Array<{ path: string }>
  unsubscribe?: Array<{ path: string }>
}

interface WebSocketLike {
  send: (data: string) => void
  readyState?: number
}

class GranularSubscriptionManager {
  private webSocket: WebSocketLike | null = null
  private ready = false
  private currentPaths: Set<string> = new Set()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private sourcePolicy: 'preferred' | 'all' = 'preferred'

  private readonly DEBOUNCE_MS = 350
  private readonly SIMILARITY_THRESHOLD = 0.8

  setWebSocket(ws: WebSocketLike | null): void {
    this.webSocket = ws
  }

  setSourcePolicy(policy: 'preferred' | 'all'): void {
    if (this.sourcePolicy === policy) return
    this.sourcePolicy = policy
    // The user just flipped the toggle — re-issue discovery so the
    // server starts honouring the new policy immediately, instead of
    // waiting for an unrelated path change to trigger resubscription.
    if (this.ready && this.webSocket) {
      this.startDiscovery()
    }
  }

  startDiscovery(): void {
    if (!this.webSocket) return

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this._send({
      context: '*',
      announceNewPaths: true,
      sourcePolicy: this.sourcePolicy,
      subscribe: []
    })

    this.currentPaths = new Set()
    this.ready = true
  }

  requestPaths(pathKeys: string[]): void {
    // An empty set is a valid request — e.g. the user filtered every path
    // out. Fall through so _executeResubscription can drop stale
    // subscriptions instead of keeping the previous traffic flowing.
    const targetPaths = new Set(pathKeys ?? [])

    if (!this.ready) return

    if (this._pathsAreSimilar(this.currentPaths, targetPaths)) return

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this._executeResubscription(targetPaths)
    }, this.DEBOUNCE_MS)
  }

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
      } catch (err) {
        // WebSocket may already be closed — surface at debug level so
        // a stuck unsubscribe is at least visible in the browser console
        // when somebody is hunting it down.
        console.debug('GranularSubscriptionManager unsubscribeAll failed', err)
      }
    }

    this.currentPaths = new Set()
    this.ready = false
  }

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  private _executeResubscription(newPaths: Set<string>): void {
    if (!this.webSocket) return

    const uniquePaths = this._extractUniquePaths(newPaths)

    // Always unsubscribe existing paths first — the server accumulates
    // listeners so a new subscribe message does not replace the old one.
    this._send({
      context: '*',
      unsubscribe: [{ path: '*' }]
    })

    if (uniquePaths.length === 0) {
      this.currentPaths = new Set()
      return
    }

    this._send({
      context: '*',
      announceNewPaths: true,
      sourcePolicy: this.sourcePolicy,
      subscribe: uniquePaths.map((path) => ({ path }))
    })

    this.currentPaths = newPaths
  }

  private _pathsAreSimilar(
    currentPaths: Set<string>,
    newPaths: Set<string>
  ): boolean {
    if (currentPaths.size === 0 && newPaths.size === 0) return true
    if (currentPaths.size === 0 || newPaths.size === 0) return false

    // Every requested path must already be subscribed; otherwise we have to
    // resubscribe regardless of similarity.
    for (const path of newPaths) {
      if (!currentPaths.has(path)) return false
    }

    // currentPaths is a superset of newPaths here, so overlap = newPaths.size
    // and Math.max(currentPaths.size, newPaths.size) = currentPaths.size.
    const overlapPercent = newPaths.size / currentPaths.size
    return overlapPercent >= this.SIMILARITY_THRESHOLD
  }

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

  private _send(msg: SubscriptionMessage): void {
    if (
      this.webSocket &&
      this.webSocket.readyState !== undefined &&
      this.webSocket.readyState === WebSocket.OPEN
    ) {
      this.webSocket.send(JSON.stringify(msg))
    } else if (this.webSocket && this.webSocket.send) {
      try {
        this.webSocket.send(JSON.stringify(msg))
      } catch (err) {
        // WebSocket may not be ready — log at debug for diagnostics.
        console.debug('GranularSubscriptionManager _send failed', err)
      }
    }
  }
}

const granularSubscriptionManager = new GranularSubscriptionManager()

export default granularSubscriptionManager
export { GranularSubscriptionManager }
