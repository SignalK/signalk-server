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
  private zustandSetState: ZustandStateSetter | null = null

  setZustandState(setState: ZustandStateSetter): void {
    this.zustandSetState = setState
  }

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
        // Dynamic import avoids circular dependency with actions.ts
        import('../actions').then(({ fetchAllData }) => fetchAllData())
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

  close(skipReconnect = false): void {
    if (skipReconnect) {
      this.stopReconnectTimer()
      if (this.state.ws) {
        this.state.ws.onclose = null
      }
    }
    this.state.ws?.close()
    this.updateState({ status: 'closed', ws: null })
  }

  reconnect(): void {
    this.close(true)
    this.connect()
  }

  getWebSocket(): WebSocket | null {
    return this.state.ws
  }

  getSkSelf(): string | null {
    return this.state.skSelf
  }

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

  addDeltaHandler(handler: DeltaMessageHandler): () => void {
    this.deltaHandlers.add(handler)
    return () => {
      this.deltaHandlers.delete(handler)
    }
  }

  addStatusHandler(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler)
    return () => {
      this.statusHandlers.delete(handler)
    }
  }

  private handleMessage(message: unknown): void {
    const msg = message as Record<string, unknown>

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

    if (msg.type) {
      this.handleServerEvent(msg)
      return
    }

    // Hello message — extract skSelf
    if (msg.name) {
      this.updateState({ skSelf: msg.self as string })
      return
    }

    this.dispatchDelta(message)
  }

  private dispatchDelta(message: unknown): void {
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
          log: {
            ...state.log,
            debugEnabled:
              (data as { debugEnabled?: string })?.debugEnabled ?? '',
            rememberDebug:
              (data as { rememberDebug?: boolean })?.rememberDebug ?? false
          }
        }))
        break
      case 'LOG':
        // Dynamic import avoids circular dependency with store
        import('../store').then(({ useStore }) => {
          const logData = msg.data as {
            isError?: boolean
            ts: string
            row: string
          }
          useStore.getState().addLogEntry(logData)
        })
        break
      case 'ACCESS_REQUEST':
        this.zustandSetState({ accessRequests: data } as Partial<SignalKStore>)
        break
      case 'RECEIVE_LOGIN_STATUS':
        this.zustandSetState({ loginStatus: data } as Partial<SignalKStore>)
        break
      case 'DISCOVERY_CHANGED':
        this.zustandSetState({
          discoveredProviders: data
        } as Partial<SignalKStore>)
        break
      case 'RESTORESTATUS':
        this.zustandSetState({ restoreStatus: data } as Partial<SignalKStore>)
        break
      case 'VESSEL_INFO':
        import('../store').then(({ useStore }) => {
          useStore
            .getState()
            .setVesselInfo(data as Parameters<SignalKStore['setVesselInfo']>[0])
        })
        break
      case 'RECEIVE_APPSTORE_LIST':
      case 'APP_STORE_CHANGED':
        // Dynamic import avoids circular dependency with store
        import('../store').then(({ useStore }) => {
          useStore
            .getState()
            .setAppStore(data as Parameters<SignalKStore['setAppStore']>[0])
        })
        break
      default:
        console.debug('Unhandled server event:', eventType)
    }
  }

  private updateState(updates: Partial<WebSocketServiceState>): void {
    const prevStatus = this.state.status
    this.state = { ...this.state, ...updates }

    this.listeners.forEach((listener) => listener())

    if (updates.status && updates.status !== prevStatus) {
      this.statusHandlers.forEach((handler) => {
        try {
          handler(this.state.status)
        } catch (e) {
          console.error('Status handler error:', e)
        }
      })
    }

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

export const webSocketService = new WebSocketService()

export default webSocketService
