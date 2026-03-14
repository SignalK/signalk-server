import { useSyncExternalStore, useCallback, useEffect, useRef } from 'react'
import { webSocketService } from '../services/WebSocketService'
import type {
  WebSocketStatus,
  DeltaMessageHandler
} from '../services/WebSocketService'

interface WebSocketState {
  status: WebSocketStatus
  skSelf: string | null
  ws: WebSocket | null
  isConnected: boolean
}

export function useWebSocket(): WebSocketState {
  const state = useSyncExternalStore(
    webSocketService.subscribe,
    webSocketService.getSnapshot,
    webSocketService.getServerSnapshot
  )

  return {
    status: state.status,
    skSelf: state.skSelf,
    ws: state.ws,
    isConnected: state.status === 'open'
  }
}

export function useWebSocketStatus(): WebSocketStatus {
  const state = useSyncExternalStore(
    webSocketService.subscribe,
    webSocketService.getSnapshot,
    webSocketService.getServerSnapshot
  )
  return state.status
}

export function useSkSelf(): string | null {
  const state = useSyncExternalStore(
    webSocketService.subscribe,
    webSocketService.getSnapshot,
    webSocketService.getServerSnapshot
  )
  return state.skSelf
}

export function useDeltaMessages(handler: DeltaMessageHandler): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const wrappedHandler: DeltaMessageHandler = (message) => {
      handlerRef.current(message)
    }
    return webSocketService.addDeltaHandler(wrappedHandler)
  }, [])
}

export function useWebSocketActions() {
  return {
    connect: useCallback((isReconnect?: boolean) => {
      webSocketService.connect(isReconnect)
    }, []),
    close: useCallback((skipReconnect?: boolean) => {
      webSocketService.close(skipReconnect)
    }, []),
    reconnect: useCallback(() => {
      webSocketService.reconnect()
    }, [])
  }
}

export function getWebSocketService() {
  return webSocketService
}

export default useWebSocket
