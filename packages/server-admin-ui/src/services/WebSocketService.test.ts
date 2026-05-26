import { describe, it, expect, beforeEach } from 'vitest'
import { WebSocketService } from './WebSocketService'
import { useStore } from '../store'
import type { PathData } from '../store'

// Reach into the service to drive the hello-message path without
// opening a real WebSocket. handleMessage is private, so cast through
// an interface that exposes just what these tests need.
interface ServiceWithHandle {
  handleMessage(msg: unknown): void
}

const dispatchHello = (
  service: WebSocketService,
  bootId: string | undefined
): void => {
  const msg: Record<string, unknown> = {
    name: 'signalk-server',
    version: '0.0.0-test',
    self: 'vessels.urn:mrn:signalk:uuid:test-self',
    roles: ['master', 'main'],
    timestamp: new Date().toISOString()
  }
  if (bootId !== undefined) msg.bootId = bootId
  ;(service as unknown as ServiceWithHandle).handleMessage(msg)
}

const seedPath = (path: string): void => {
  const data: PathData = {
    value: 1,
    timestamp: '2024-01-15T10:30:00Z',
    $source: 'nmea0183.0'
  }
  useStore.getState().updatePath('self', `${path}$nmea0183.0`, data)
}

describe('WebSocketService bootId tracking', () => {
  beforeEach(() => {
    useStore.getState().clearData()
  })

  it('records bootId on first hello without clearing data', () => {
    const service = new WebSocketService()
    seedPath('navigation.speedOverGround')
    dispatchHello(service, 'boot-1')

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })

  it('clears signalkData when a subsequent hello carries a new bootId', () => {
    const service = new WebSocketService()
    dispatchHello(service, 'boot-1')
    seedPath('navigation.speedOverGround')
    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)

    dispatchHello(service, 'boot-2')

    expect(useStore.getState().signalkData).toEqual({})
  })

  it('does not clear signalkData when the bootId is unchanged', () => {
    const service = new WebSocketService()
    dispatchHello(service, 'boot-1')
    seedPath('navigation.speedOverGround')

    dispatchHello(service, 'boot-1')

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })

  it('does not clear signalkData when the hello has no bootId', () => {
    const service = new WebSocketService()
    dispatchHello(service, 'boot-1')
    seedPath('navigation.speedOverGround')

    dispatchHello(service, undefined)

    expect(
      Object.keys(useStore.getState().signalkData.self ?? {})
    ).toHaveLength(1)
  })
})
