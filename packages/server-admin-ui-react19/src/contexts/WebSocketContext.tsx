import { createContext, use, useEffect, ReactNode } from 'react'
import { webSocketService } from '../services/WebSocketService'
import type { WebSocketService } from '../services/WebSocketService'
import { useStore } from '../store'

export type { WebSocketService }

const WebSocketContext = createContext<typeof webSocketService | null>(null)

interface WebSocketProviderProps {
  children: ReactNode
  autoConnect?: boolean
}

// Must wire up before connect() so server events reach the store
webSocketService.setZustandState(useStore.setState)

export function WebSocketProvider({
  children,
  autoConnect = true
}: WebSocketProviderProps) {
  useEffect(() => {
    if (autoConnect) {
      webSocketService.connect()
    }
    return () => {
      webSocketService.close(true)
    }
  }, [autoConnect])

  return (
    <WebSocketContext value={webSocketService}>{children}</WebSocketContext>
  )
}

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
