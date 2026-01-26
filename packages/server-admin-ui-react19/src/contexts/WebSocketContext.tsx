/**
 * WebSocketContext - React Context for WebSocket access
 *
 * Provides the WebSocketService to the React component tree.
 * Components can use the useWebSocket hook to access WebSocket state reactively.
 */

import { createContext, use, useEffect, ReactNode } from 'react'
import { webSocketService } from '../services/WebSocketService'
import type { WebSocketService } from '../services/WebSocketService'
import { useStore } from '../store'

// Re-export the service type for convenience
export type { WebSocketService }

const WebSocketContext = createContext<typeof webSocketService | null>(null)

interface WebSocketProviderProps {
  children: ReactNode
  autoConnect?: boolean
}

// Wire up Zustand state setter synchronously at module load time
// This ensures the connection is established before any WebSocket messages arrive
webSocketService.setZustandState(useStore.setState)

/**
 * WebSocketProvider - Wraps the app and provides WebSocket access
 *
 * @param autoConnect - Whether to connect automatically on mount (default: true)
 */
export function WebSocketProvider({
  children,
  autoConnect = true
}: WebSocketProviderProps) {
  useEffect(() => {
    // Auto-connect on mount
    if (autoConnect) {
      webSocketService.connect()
    }

    // Cleanup on unmount
    return () => {
      webSocketService.close(true)
    }
  }, [autoConnect])

  return (
    <WebSocketContext value={webSocketService}>{children}</WebSocketContext>
  )
}

/**
 * useWebSocketContext - Low-level hook to get the WebSocket service
 *
 * Most components should use useWebSocket hook instead, which provides
 * reactive state updates via useSyncExternalStore.
 */
export function useWebSocketContext() {
  const context = use(WebSocketContext)
  if (!context) {
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider'
    )
  }
  return context
}

export default WebSocketContext
