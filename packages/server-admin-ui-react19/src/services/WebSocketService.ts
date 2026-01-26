/**
 * WebSocketService - Manages SignalK WebSocket connection
 *
 * This service handles:
 * - WebSocket connection lifecycle (connect, reconnect, close)
 * - Storing skSelf from the SignalK hello message
 * - Delta message routing to registered handlers
 * - Connection status tracking with useSyncExternalStore support
 */

import type { SignalKStore } from '../store'

export type WebSocketStatus =
  | 'initial'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error'

export type DeltaMessageHandler = (message: unknown) => void
export type StatusChangeHandler = (status: WebSocketStatus) => void

interface WebSocketServiceState {
  status: WebSocketStatus
  skSelf: string | null
  ws: WebSocket | null
}

type Listener = () => void
type ZustandStateSetter = (
  partial:
    | Partial<SignalKStore>
    | ((state: SignalKStore) => Partial<SignalKStore>)
) => void

export class WebSocketService {
  private state: WebSocketServiceState = {
    status: 'initial',
    skSelf: null,
    ws: null
  }

  private listeners = new Set<Listener>()
  private deltaHandlers = new Set<DeltaMessageHandler>()
  private statusHandlers = new Set<StatusChangeHandler>()
  private reconnectTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = Infinity
  private reconnectInterval = 5000

  // Buffer for delta messages received before hello message (skSelf)
  // This prevents race condition where deltas arrive before we know which vessel is "self"
  private earlyDeltaBuffer: unknown[] = []

  // Buffer for delta messages received before any handlers are registered
  // This prevents race condition where deltas are replayed but no components have subscribed yet
  private pendingDeltaBuffer: unknown[] = []

  // Zustand state setter, set by store initialization
  private zustandSetState: ZustandStateSetter | null = null

  /**
   * Set the Zustand state setter for direct state updates
   */
  setZustandState(setState: ZustandStateSetter): void {
    this.zustandSetState = setState
  }

  /**
   * Connect to the SignalK WebSocket stream
   */
  connect(isReconnect = false): void {
    if (this.state.ws?.readyState === WebSocket.OPEN) {
      return
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url =
      proto +
      '://' +
      window.location.host +
      `/signalk/v1/stream?serverevents=all&subscribe=none&sendMeta=all`

    this.updateState({ status: 'connecting' })

    const ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('connected')
      this.reconnectAttempts = 0
      this.stopReconnectTimer()
      this.updateState({ status: 'open', ws })

      if (isReconnect) {
        window.location.reload()
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }

    ws.onclose = () => {
      console.log('closed')
      this.updateState({ status: 'closed', ws: null })
      this.startReconnectTimer()
    }

    ws.onerror = () => {
      this.updateState({ status: 'error' })
    }

    this.state.ws = ws
  }

  /**
   * Close the WebSocket connection
   */
  close(skipReconnect = false): void {
    if (skipReconnect) {
      this.stopReconnectTimer()
      // Prevent onclose from triggering reconnect
      if (this.state.ws) {
        this.state.ws.onclose = null
      }
    }
    this.state.ws?.close()
    // Clear delta buffers on close
    this.earlyDeltaBuffer = []
    this.pendingDeltaBuffer = []
    this.updateState({ status: 'closed', ws: null })
  }

  /**
   * Reconnect the WebSocket (close and open new connection)
   */
  reconnect(): void {
    this.close(true)
    this.connect()
  }

  /**
   * Get the current WebSocket instance
   */
  getWebSocket(): WebSocket | null {
    return this.state.ws
  }

  /**
   * Get the skSelf value from the SignalK hello message
   */
  getSkSelf(): string | null {
    return this.state.skSelf
  }

  /**
   * Get current connection status
   */
  getStatus(): WebSocketStatus {
    return this.state.status
  }

  // useSyncExternalStore support
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): WebSocketServiceState => {
    return this.state
  }

  getServerSnapshot = (): WebSocketServiceState => {
    return this.state
  }

  /**
   * Register a delta message handler
   * When the first handler is registered, replay any pending deltas
   */
  addDeltaHandler(handler: DeltaMessageHandler): () => void {
    const wasEmpty = this.deltaHandlers.size === 0
    this.deltaHandlers.add(handler)

    // Replay pending deltas to the first handler that registers
    if (wasEmpty && this.pendingDeltaBuffer.length > 0) {
      const buffered = this.pendingDeltaBuffer
      this.pendingDeltaBuffer = []
      buffered.forEach((deltaMsg) => {
        this.deltaHandlers.forEach((h) => {
          try {
            h(deltaMsg)
          } catch (e) {
            console.error('Delta handler error (pending replay):', e)
          }
        })
      })
    }

    return () => {
      this.deltaHandlers.delete(handler)
    }
  }

  /**
   * Register a status change handler
   */
  addStatusHandler(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler)
    return () => {
      this.statusHandlers.delete(handler)
    }
  }

  private handleMessage(message: unknown): void {
    const msg = message as Record<string, unknown>

    // Check for backpressure indicator
    if (msg.$backpressure) {
      const bp = msg.$backpressure as {
        accumulated: number
        duration: number
      }
      if (this.zustandSetState) {
        this.zustandSetState({
          backpressureWarning: {
            accumulated: bp.accumulated,
            duration: bp.duration,
            timestamp: Date.now()
          }
        } as Partial<SignalKStore>)
        setTimeout(() => {
          if (this.zustandSetState) {
            this.zustandSetState({
              backpressureWarning: null
            } as Partial<SignalKStore>)
          }
        }, 10000)
      }
    }

    // Server event (has type property) - dispatch to Zustand
    if (msg.type) {
      this.handleServerEvent(msg)
      return
    }

    // Hello message (has name property) - extract skSelf
    if (msg.name) {
      this.updateState({ skSelf: msg.self as string })

      // Replay any buffered delta messages now that we know skSelf
      if (this.earlyDeltaBuffer.length > 0) {
        const buffered = this.earlyDeltaBuffer
        this.earlyDeltaBuffer = []
        buffered.forEach((deltaMsg) => {
          this.dispatchDelta(deltaMsg)
        })
      }
      return
    }

    // Delta message - route to handlers (or buffer if skSelf not yet known)
    if (!this.state.skSelf) {
      // Buffer delta messages until we receive the hello message with skSelf
      // This prevents the race condition where deltas are dropped because
      // DataBrowser can't determine which context is "self"
      this.earlyDeltaBuffer.push(message)
      return
    }

    this.dispatchDelta(message)
  }

  /**
   * Dispatch a delta message to handlers, or buffer if no handlers registered
   */
  private dispatchDelta(message: unknown): void {
    // If no handlers are registered yet, buffer the delta
    if (this.deltaHandlers.size === 0) {
      this.pendingDeltaBuffer.push(message)
      return
    }

    this.deltaHandlers.forEach((handler) => {
      try {
        handler(message)
      } catch (e) {
        console.error('Delta handler error:', e)
      }
    })
  }

  private handleServerEvent(msg: Record<string, unknown>): void {
    if (!this.zustandSetState) return

    const eventType = msg.type as string
    const data = msg.data as Record<string, unknown> | undefined

    switch (eventType) {
      case 'SERVERSTATISTICS':
        this.zustandSetState({
          serverStatistics: data
        } as Partial<SignalKStore>)
        break
      case 'PROVIDERSTATUS':
        this.zustandSetState({ providerStatus: data } as Partial<SignalKStore>)
        break
      case 'DEBUG_SETTINGS':
        this.zustandSetState((state) => ({
          log: { ...state.log, debugEnabled: String(data ?? '') }
        }))
        break
      case 'REMEMBERME_SETTINGS':
        this.zustandSetState((state) => ({
          log: { ...state.log, rememberDebug: Boolean(data) }
        }))
        break
      case 'DEBUG':
        this.zustandSetState((state) => {
          const entries = [...(state.log?.entries || []), msg.data as string]
          // Keep last 500 entries
          if (entries.length > 500) {
            entries.splice(0, entries.length - 500)
          }
          return { log: { ...state.log, entries } } as Partial<SignalKStore>
        })
        break
      case 'SERVERLOGS':
        this.zustandSetState(
          (state) =>
            ({
              log: {
                ...state.log,
                entries: [
                  ...(msg.data as string[]),
                  ...(state.log?.entries || [])
                ]
              }
            }) as Partial<SignalKStore>
        )
        break
      case 'ACCESS_REQUEST':
        this.zustandSetState({ accessRequests: data } as Partial<SignalKStore>)
        break
      case 'DISCOVERED_PROVIDER':
        this.zustandSetState(
          (state) =>
            ({
              discoveredProviders: [...(state.discoveredProviders || []), data]
            }) as Partial<SignalKStore>
        )
        break
      case 'RESTORESTATUS':
        this.zustandSetState({ restoreStatus: data } as Partial<SignalKStore>)
        break
      case 'RECEIVE_APPSTORE_LIST':
        this.zustandSetState({ appStore: data } as Partial<SignalKStore>)
        break
      default:
        // Unknown event type, log for debugging
        console.debug('Unhandled server event:', eventType)
    }
  }

  private updateState(updates: Partial<WebSocketServiceState>): void {
    const prevStatus = this.state.status
    this.state = { ...this.state, ...updates }

    // Notify useSyncExternalStore listeners
    this.listeners.forEach((listener) => listener())

    // Notify status handlers if status changed
    if (updates.status && updates.status !== prevStatus) {
      this.statusHandlers.forEach((handler) => {
        try {
          handler(this.state.status)
        } catch (e) {
          console.error('Status handler error:', e)
        }
      })
    }

    // Sync to Zustand store
    if (this.zustandSetState) {
      const zustandUpdates: Record<string, unknown> = {}
      if (updates.status !== undefined) {
        zustandUpdates.wsStatus = updates.status
      }
      if (updates.skSelf !== undefined) {
        zustandUpdates.skSelf = updates.skSelf
      }
      if (updates.ws !== undefined) {
        zustandUpdates.ws = updates.ws
      }
      if (Object.keys(zustandUpdates).length > 0) {
        this.zustandSetState(zustandUpdates as Partial<SignalKStore>)
      }
    }
  }

  private startReconnectTimer(): void {
    if (this.reconnectTimer) return

    this.reconnectTimer = setInterval(() => {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.stopReconnectTimer()
        return
      }
      console.log('retry...')
      this.reconnectAttempts++
      this.connect(true)
    }, this.reconnectInterval)
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// Singleton instance
export const webSocketService = new WebSocketService()

export default webSocketService
