import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebSocketService } from './WebSocketService'
import { useStore } from '../store'
import type { PathData } from '../store'

// A minimal stand-in for the global WebSocket used by WebSocketService:
// captures the most recent instance so the test can fire onopen/onmessage
// to drive the public connect()/handleMessage path without a real socket.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static lastInstance(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  }
  static OPEN = 1

  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    FakeWebSocket.instances.push(this)
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  close(): void {}
}

const helloMessage = (
  serverStartId: string | undefined
): Record<string, unknown> => {
  const msg: Record<string, unknown> = {
    name: 'signalk-server',
    version: '0.0.0-test',
    self: 'vessels.urn:mrn:signalk:uuid:test-self',
    roles: ['master', 'main'],
    timestamp: new Date().toISOString()
  }
  if (serverStartId !== undefined) msg.serverStartId = serverStartId
  return msg
}

const seedPath = (path: string): void => {
  const data: PathData = {
    value: 1,
    timestamp: '2024-01-15T10:30:00Z',
    $source: 'nmea0183.0'
  }
  useStore.getState().updatePath('self', `${path}$nmea0183.0`, data)
}

describe('WebSocketService serverStartId tracking', () => {
  let service: WebSocketService
  let ws: FakeWebSocket

  beforeEach(() => {
    // setup.ts's beforeAll installs a different WebSocket stub; reinstall
    // FakeWebSocket here so connect() captures *our* instance.
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    useStore.getState().clearData()
    service = new WebSocketService()
    service.connect()
    ws = FakeWebSocket.lastInstance()
  })

  it('records serverStartId on first hello without clearing data', () => {
    seedPath('navigation.speedOverGround')
    ws.receive(helloMessage('start-1'))

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })

  it('clears signalkData when a subsequent hello carries a new serverStartId', () => {
    ws.receive(helloMessage('start-1'))
    seedPath('navigation.speedOverGround')
    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)

    ws.receive(helloMessage('start-2'))

    expect(useStore.getState().signalkData).toEqual({})
  })

  it('does not clear signalkData when the serverStartId is unchanged', () => {
    ws.receive(helloMessage('start-1'))
    seedPath('navigation.speedOverGround')

    ws.receive(helloMessage('start-1'))

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })

  it('does not clear signalkData when the hello has no serverStartId', () => {
    ws.receive(helloMessage('start-1'))
    seedPath('navigation.speedOverGround')

    ws.receive(helloMessage(undefined))

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })
})
