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

  it('stores HISTORYPROVIDERS serverevents as a full snapshot', () => {
    // handleServerEvent no-ops until the zustand setter is registered
    // (done by the app bootstrap in production).
    service.setZustandState(useStore.setState)
    useStore.setState({ historyProviders: null })

    ws.receive({
      type: 'HISTORYPROVIDERS',
      data: {
        ids: ['questdb', 'influx'],
        defaultId: 'influx',
        configuredId: 'questdb',
        configuredAvailable: false
      }
    })
    expect(useStore.getState().historyProviders).toEqual({
      ids: ['questdb', 'influx'],
      defaultId: 'influx',
      configuredId: 'questdb',
      configuredAvailable: false
    })

    // A later snapshot replaces the previous state entirely.
    ws.receive({
      type: 'HISTORYPROVIDERS',
      data: {
        ids: ['questdb'],
        defaultId: 'questdb',
        configuredId: 'questdb',
        configuredAvailable: true
      }
    })
    expect(useStore.getState().historyProviders).toEqual({
      ids: ['questdb'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredAvailable: true
    })
  })

  it('stores RESTART_REQUIRED and DEFAULT_PACKAGES serverevents', () => {
    service.setZustandState(useStore.setState)
    ws.receive({
      type: 'RESTART_REQUIRED',
      data: { reason: 'defaultPackagesInstalled', packages: ['@mxtommy/kip'] }
    })
    ws.receive({
      type: 'DEFAULT_PACKAGES',
      data: { status: 'failed', packages: { '@mxtommy/kip': '^4.8.0' } }
    })
    expect(useStore.getState().installedPackagesNeedingRestart).toEqual([
      '@mxtommy/kip'
    ])
    expect(useStore.getState().defaultPackages).toEqual({
      status: 'failed',
      packages: { '@mxtommy/kip': '^4.8.0' }
    })
  })

  it('forgets the restart reminder once the server has restarted', () => {
    service.setZustandState(useStore.setState)
    ws.receive(helloMessage('start-1'))
    ws.receive({
      type: 'RESTART_REQUIRED',
      data: { reason: 'defaultPackagesInstalled', packages: ['@mxtommy/kip'] }
    })

    useStore.getState().setRestartRequired(true)

    ws.receive(helloMessage('start-2'))

    expect(useStore.getState().installedPackagesNeedingRestart).toEqual([])
    expect(useStore.getState().defaultPackages).toBeNull()
    expect(useStore.getState().restartRequired).toBe(false)
  })

  it('ignores a DEFAULT_PACKAGES serverevent it cannot read', () => {
    service.setZustandState(useStore.setState)
    ws.receive({ type: 'DEFAULT_PACKAGES', data: { status: 'unknown' } })
    expect(useStore.getState().defaultPackages).toBeNull()
    ws.receive({
      type: 'DEFAULT_PACKAGES',
      data: { status: 'offer', packages: { a: '1.0.0', b: 2 } }
    })
    expect(useStore.getState().defaultPackages).toEqual({
      status: 'offer',
      packages: { a: '1.0.0' }
    })
  })

  it('keeps the failed packages that come with an offer', () => {
    service.setZustandState(useStore.setState)
    ws.receive({
      type: 'DEFAULT_PACKAGES',
      data: {
        status: 'offer',
        packages: { a: '1.0.0' },
        failed: { b: '^2.0.0', c: 3 }
      }
    })
    expect(useStore.getState().defaultPackages).toEqual({
      status: 'offer',
      packages: { a: '1.0.0' },
      failed: { b: '^2.0.0' }
    })
  })
})
