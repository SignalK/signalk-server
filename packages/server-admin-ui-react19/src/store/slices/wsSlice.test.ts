import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useStore } from '../index'
import type { WebSocketStatus } from './wsSlice'

describe('wsSlice', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      wsStatus: 'initial',
      skSelf: null,
      ws: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have initial status', () => {
      expect(useStore.getState().wsStatus).toBe('initial')
    })

    it('should have null skSelf', () => {
      expect(useStore.getState().skSelf).toBeNull()
    })

    it('should have null ws', () => {
      expect(useStore.getState().ws).toBeNull()
    })
  })

  describe('setWsStatus', () => {
    it('should update wsStatus to connecting', () => {
      useStore.getState().setWsStatus('connecting')
      expect(useStore.getState().wsStatus).toBe('connecting')
    })

    it('should update wsStatus to open', () => {
      useStore.getState().setWsStatus('open')
      expect(useStore.getState().wsStatus).toBe('open')
    })

    it('should update wsStatus to closed', () => {
      useStore.getState().setWsStatus('closed')
      expect(useStore.getState().wsStatus).toBe('closed')
    })

    it('should update wsStatus to error', () => {
      useStore.getState().setWsStatus('error')
      expect(useStore.getState().wsStatus).toBe('error')
    })

    it.each<WebSocketStatus>([
      'initial',
      'connecting',
      'open',
      'closed',
      'error'
    ])('should accept %s as valid status', (status) => {
      useStore.getState().setWsStatus(status)
      expect(useStore.getState().wsStatus).toBe(status)
    })
  })

  describe('setSkSelf', () => {
    it('should set skSelf to a vessel URN', () => {
      const selfUrn =
        'vessels.urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
      useStore.getState().setSkSelf(selfUrn)
      expect(useStore.getState().skSelf).toBe(selfUrn)
    })

    it('should set skSelf to null', () => {
      useStore.getState().setSkSelf('vessels.self')
      useStore.getState().setSkSelf(null)
      expect(useStore.getState().skSelf).toBeNull()
    })
  })

  describe('delta handlers', () => {
    it('should add a delta handler', () => {
      const handler = vi.fn()
      const unsubscribe = useStore.getState().addDeltaHandler(handler)

      // Handler should be called when message is handled
      useStore.getState().handleWsMessage({ updates: [] })
      expect(handler).toHaveBeenCalledWith({ updates: [] })

      unsubscribe()
    })

    it('should remove a delta handler via unsubscribe', () => {
      const handler = vi.fn()
      const unsubscribe = useStore.getState().addDeltaHandler(handler)

      unsubscribe()

      useStore.getState().handleWsMessage({ updates: [] })
      expect(handler).not.toHaveBeenCalled()
    })

    it('should remove a delta handler via removeDeltaHandler', () => {
      const handler = vi.fn()
      useStore.getState().addDeltaHandler(handler)

      useStore.getState().removeDeltaHandler(handler)

      useStore.getState().handleWsMessage({ updates: [] })
      expect(handler).not.toHaveBeenCalled()
    })

    it('should call multiple handlers', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const unsubscribe1 = useStore.getState().addDeltaHandler(handler1)
      const unsubscribe2 = useStore.getState().addDeltaHandler(handler2)

      useStore.getState().handleWsMessage({ updates: [] })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()

      unsubscribe1()
      unsubscribe2()
    })

    it('should catch errors from handlers and continue', () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const goodHandler = vi.fn()

      const unsubscribe1 = useStore.getState().addDeltaHandler(errorHandler)
      const unsubscribe2 = useStore.getState().addDeltaHandler(goodHandler)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      useStore.getState().handleWsMessage({ updates: [] })

      expect(errorHandler).toHaveBeenCalled()
      expect(goodHandler).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()

      unsubscribe1()
      unsubscribe2()
    })
  })

  describe('handleWsMessage', () => {
    it('should set skSelf from hello message', () => {
      const helloMessage = {
        name: 'signalk-server',
        version: '2.0.0',
        self: 'vessels.urn:mrn:signalk:uuid:test-uuid'
      }

      useStore.getState().handleWsMessage(helloMessage)

      expect(useStore.getState().skSelf).toBe(
        'vessels.urn:mrn:signalk:uuid:test-uuid'
      )
    })

    it('should route delta messages to handlers', () => {
      const handler = vi.fn()
      const unsubscribe = useStore.getState().addDeltaHandler(handler)

      const deltaMessage = {
        context: 'vessels.self',
        updates: [
          {
            source: { label: 'test' },
            values: [{ path: 'navigation.speedOverGround', value: 5.5 }]
          }
        ]
      }

      useStore.getState().handleWsMessage(deltaMessage)

      expect(handler).toHaveBeenCalledWith(deltaMessage)

      unsubscribe()
    })

    it('should route server events (messages with type) to handlers', () => {
      const handler = vi.fn()
      const unsubscribe = useStore.getState().addDeltaHandler(handler)

      const serverEvent = {
        type: 'SERVEREVENT',
        from: 'plugins',
        data: { pluginId: 'test-plugin' }
      }

      useStore.getState().handleWsMessage(serverEvent)

      expect(handler).toHaveBeenCalledWith(serverEvent)

      unsubscribe()
    })
  })

  describe('closeWebSocket', () => {
    it('should set status to closed and ws to null', () => {
      // Simulate having an open connection
      const mockWs = {
        close: vi.fn(),
        onclose: null as (() => void) | null
      }
      useStore.setState({
        wsStatus: 'open',
        ws: mockWs as unknown as WebSocket
      })

      useStore.getState().closeWebSocket()

      expect(useStore.getState().wsStatus).toBe('closed')
      expect(useStore.getState().ws).toBeNull()
      expect(mockWs.close).toHaveBeenCalled()
    })

    it('should clear onclose handler when skipReconnect is true', () => {
      const mockWs = {
        close: vi.fn(),
        onclose: vi.fn()
      }
      useStore.setState({
        wsStatus: 'open',
        ws: mockWs as unknown as WebSocket
      })

      useStore.getState().closeWebSocket(true)

      expect(mockWs.onclose).toBeNull()
      expect(mockWs.close).toHaveBeenCalled()
    })

    it('should handle null ws gracefully', () => {
      useStore.setState({ wsStatus: 'initial', ws: null })

      expect(() => {
        useStore.getState().closeWebSocket()
      }).not.toThrow()
    })
  })
})
