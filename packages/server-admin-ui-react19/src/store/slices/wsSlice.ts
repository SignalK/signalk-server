import type { StateCreator } from 'zustand'

export type WebSocketStatus =
  | 'initial'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error'

export type DeltaMessageHandler = (message: unknown) => void

export interface WsSliceState {
  wsStatus: WebSocketStatus
  skSelf: string | null
  ws: WebSocket | null
}

export interface WsSliceActions {
  connectWebSocket: (isReconnect?: boolean) => void
  closeWebSocket: (skipReconnect?: boolean) => void
  reconnectWebSocket: () => void
  setWsStatus: (status: WebSocketStatus) => void
  setSkSelf: (skSelf: string | null) => void
  addDeltaHandler: (handler: DeltaMessageHandler) => () => void
  removeDeltaHandler: (handler: DeltaMessageHandler) => void
  handleWsMessage: (message: unknown) => void
}

export type WsSlice = WsSliceState & WsSliceActions

// Store handlers outside Zustand state to avoid serialization issues
const deltaHandlers = new Set<DeltaMessageHandler>()
let reconnectTimer: ReturnType<typeof setInterval> | null = null
let reconnectAttempts = 0
const maxReconnectAttempts = Infinity
const reconnectInterval = 5000

// Store reference for reconnection logic
let storeRef: {
  getState: () => WsSlice
  setState: (partial: Partial<WsSlice>) => void
} | null = null

function stopReconnectTimer(): void {
  if (reconnectTimer) {
    clearInterval(reconnectTimer)
    reconnectTimer = null
  }
}

function startReconnectTimer(): void {
  if (reconnectTimer) {
    return
  }

  reconnectTimer = setInterval(() => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      stopReconnectTimer()
      return
    }
    console.log('retry...')
    reconnectAttempts++
    storeRef?.getState().connectWebSocket(true)
  }, reconnectInterval)
}

const initialWsState: WsSliceState = {
  wsStatus: 'initial',
  skSelf: null,
  ws: null
}

export const createWsSlice: StateCreator<WsSlice, [], [], WsSlice> = (
  set,
  get
) => {
  // Store reference for reconnection timer
  storeRef = { getState: get, setState: set }

  return {
    ...initialWsState,

    connectWebSocket: (isReconnect = false) => {
      const { ws } = get()
      if (ws?.readyState === WebSocket.OPEN) {
        return
      }

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url =
        proto +
        '://' +
        window.location.host +
        `/signalk/v1/stream?serverevents=all&subscribe=none&sendMeta=all`

      set({ wsStatus: 'connecting' })

      const newWs = new WebSocket(url)

      newWs.onopen = () => {
        console.log('connected')
        reconnectAttempts = 0
        stopReconnectTimer()
        set({ wsStatus: 'open', ws: newWs })

        if (isReconnect) {
          window.location.reload()
        }
      }

      newWs.onmessage = (event: MessageEvent) => {
        const message = JSON.parse(event.data)
        get().handleWsMessage(message)
      }

      newWs.onclose = () => {
        console.log('closed')
        set({ wsStatus: 'closed', ws: null })
        startReconnectTimer()
      }

      newWs.onerror = () => {
        set({ wsStatus: 'error' })
      }
    },

    closeWebSocket: (skipReconnect = false) => {
      const { ws } = get()
      if (skipReconnect) {
        stopReconnectTimer()
        // Prevent onclose from triggering reconnect
        if (ws) {
          ws.onclose = null
        }
      }
      ws?.close()
      set({ wsStatus: 'closed', ws: null })
    },

    reconnectWebSocket: () => {
      get().closeWebSocket(true)
      get().connectWebSocket()
    },

    setWsStatus: (wsStatus) => {
      set({ wsStatus })
    },

    setSkSelf: (skSelf) => {
      set({ skSelf })
    },

    addDeltaHandler: (handler) => {
      deltaHandlers.add(handler)
      return () => {
        deltaHandlers.delete(handler)
      }
    },

    removeDeltaHandler: (handler) => {
      deltaHandlers.delete(handler)
    },

    handleWsMessage: (message) => {
      const msg = message as Record<string, unknown>
      const state = get()

      // Check for backpressure indicator
      if (msg.$backpressure) {
        const bp = msg.$backpressure as {
          accumulated: number
          duration: number
        }
        // This will be handled by the store's setBackpressureWarning
        // We need access to the full store here
        if ('setBackpressureWarning' in state) {
          const fullState = state as WsSlice & {
            setBackpressureWarning: (
              warning: {
                accumulated: number
                duration: number
                timestamp: number
              } | null
            ) => void
          }
          fullState.setBackpressureWarning({
            accumulated: bp.accumulated,
            duration: bp.duration,
            timestamp: Date.now()
          })
          setTimeout(() => {
            fullState.setBackpressureWarning(null)
          }, 10000)
        }
      }

      // Server event (has type property) - handle internally
      if (msg.type) {
        // Server events will be processed by the app slice via subscription
        // For now, we just route them to delta handlers
        deltaHandlers.forEach((handler) => {
          try {
            handler(message)
          } catch (e) {
            console.error('Delta handler error:', e)
          }
        })
        return
      }

      // Hello message (has name property) - extract skSelf
      if (msg.name) {
        set({ skSelf: msg.self as string })
        return
      }

      // Delta message - route to handlers
      deltaHandlers.forEach((handler) => {
        try {
          handler(message)
        } catch (e) {
          console.error('Delta handler error:', e)
        }
      })
    }
  }
}
