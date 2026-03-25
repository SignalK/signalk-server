import '@testing-library/jest-dom/vitest'
import { beforeAll, vi } from 'vitest'

// Mock WebSocket for tests that interact with WebSocket connections
beforeAll(() => {
  vi.stubGlobal(
    'WebSocket',
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      readyState = MockWebSocket.CONNECTING
      url: string
      onopen: ((event: Event) => void) | null = null
      onclose: ((event: CloseEvent) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: Event) => void) | null = null

      constructor(url: string) {
        this.url = url
      }

      send(): void {
        // Mock send
      }

      close(): void {
        this.readyState = MockWebSocket.CLOSED
      }
    }
  )

  // Mock matchMedia for components that use media queries
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )

  // Mock ResizeObserver for components that observe size changes
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe(): void {
        // Mock observe
      }
      unobserve(): void {
        // Mock unobserve
      }
      disconnect(): void {
        // Mock disconnect
      }
    }
  )
})
