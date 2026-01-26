/**
 * useWebSocket - React hook for reactive WebSocket state
 *
 * Uses useSyncExternalStore for efficient, tear-free updates when
 * WebSocket state changes (connection status, skSelf, etc.)
 */

import { useSyncExternalStore, useCallback, useEffect, useRef } from 'react'
import { webSocketService } from '../services/WebSocketService'
import type {
  WebSocketStatus,
  DeltaMessageHandler
} from '../services/WebSocketService'

interface WebSocketState {
  /** Current connection status */
  status: WebSocketStatus
  /** The vessel self URN from SignalK hello message */
  skSelf: string | null
  /** The raw WebSocket instance (use sparingly) */
  ws: WebSocket | null
  /** Whether the WebSocket is connected and ready */
  isConnected: boolean
}

/**
 * useWebSocket - Main hook for WebSocket access
 *
 * @returns WebSocketState with reactive updates
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, skSelf, isConnected } = useWebSocket()
 *
 *   if (!isConnected) {
 *     return <div>Connecting...</div>
 *   }
 *
 *   return <div>Connected as {skSelf}</div>
 * }
 * ```
 */
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

/**
 * useWebSocketStatus - Hook for connection status only
 *
 * Lighter weight than useWebSocket if you only need status.
 */
export function useWebSocketStatus(): WebSocketStatus {
  const state = useSyncExternalStore(
    webSocketService.subscribe,
    webSocketService.getSnapshot,
    webSocketService.getServerSnapshot
  )
  return state.status
}

/**
 * useSkSelf - Hook for skSelf value only
 *
 * Returns the vessel self URN from the SignalK hello message.
 */
export function useSkSelf(): string | null {
  const state = useSyncExternalStore(
    webSocketService.subscribe,
    webSocketService.getSnapshot,
    webSocketService.getServerSnapshot
  )
  return state.skSelf
}

/**
 * useDeltaMessages - Hook to subscribe to delta messages
 *
 * @param handler - Callback invoked for each delta message
 *
 * @example
 * ```tsx
 * function DataComponent() {
 *   useDeltaMessages((delta) => {
 *     console.log('Received delta:', delta)
 *   })
 * }
 * ```
 */
export function useDeltaMessages(handler: DeltaMessageHandler): void {
  // Store handler in ref to avoid re-subscribing on every render
  const handlerRef = useRef(handler)

  // Update the ref in an effect to avoid mutating during render
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    // Wrapper function calls the current handler ref
    const wrappedHandler: DeltaMessageHandler = (message) => {
      handlerRef.current(message)
    }
    return webSocketService.addDeltaHandler(wrappedHandler)
  }, [])
}

/**
 * useWebSocketActions - Hook for WebSocket control actions
 *
 * @returns Object with connect, close, and reconnect functions
 */
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

/**
 * getWebSocketService - Direct access to the service singleton
 *
 * Use this for imperative code outside of React components.
 * Inside components, prefer useWebSocket hook.
 */
export function getWebSocketService() {
  return webSocketService
}

export default useWebSocket
