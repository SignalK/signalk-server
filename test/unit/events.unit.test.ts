import { expect } from 'chai'
import { EventEmitter } from 'events'
import { startEvents, startServerEvents, wrapEmitter } from '../../src/events'

type Spark = {
  request: Record<string, unknown>
  onDisconnects: Array<() => void>
  writes: unknown[]
  write: (payload: unknown) => void
}

type EventApp = EventEmitter & {
  config?: {
    vesselName?: string
    vesselMMSI?: string
    vesselUUID?: string
    settings?: { sourcePriorities?: Record<string, number> }
  }
  lastServerEvents?: Record<string, { type: string }>
  logging?: {
    getDebugSettings: () => { debugEnabled: string; rememberDebug: boolean }
  }
  securityStrategy: {
    isDummy?: () => boolean
    hasAdminAccess?: () => boolean
    canAuthorizeWS?: () => boolean
    getLoginStatus?: () => unknown
  }
}

const makeSpark = (): Spark => ({
  request: {},
  onDisconnects: [],
  writes: [],
  write(payload: unknown) {
    this.writes.push(payload)
  }
})

describe('events', () => {
  it('streams named events for allowed connections', () => {
    const app = new EventEmitter() as EventApp
    app.securityStrategy = {
      isDummy: () => true
    }

    const spark = makeSpark()
    const received: Array<{ event: string; data: unknown }> = []

    startEvents(app, spark, (data) => received.push(data), 'alpha,beta')

    app.emit('alpha', { value: 1 })
    app.emit('beta', { value: 2 })

    expect(received).to.deep.equal([
      { event: 'alpha', data: { value: 1 } },
      { event: 'beta', data: { value: 2 } }
    ])

    spark.onDisconnects.forEach((handler) => handler())
    app.emit('alpha', { value: 3 })
    expect(received).to.have.length(3)
  })

  it('skips events when not admin and security is enabled', () => {
    const app = new EventEmitter() as EventApp
    app.securityStrategy = {
      isDummy: () => false,
      hasAdminAccess: () => false
    }

    const spark = makeSpark()
    const received: Array<{ event: string; data: unknown }> = []

    startEvents(app, spark, (data) => received.push(data), 'alpha')
    app.emit('alpha', { value: 1 })

    expect(received).to.have.length(0)
  })

  it('sends server events and settings on connect', () => {
    const app = new EventEmitter() as EventApp
    app.config = {
      vesselName: 'Vessel',
      vesselMMSI: '123',
      vesselUUID: 'uuid',
      settings: { sourcePriorities: { test: 1 } }
    }
    app.lastServerEvents = {
      a: { type: 'TEST_A' },
      b: { type: 'TEST_B' }
    }
    app.logging = {
      getDebugSettings: () => ({ debugEnabled: 'x', rememberDebug: true })
    }
    app.securityStrategy = {
      hasAdminAccess: () => true,
      canAuthorizeWS: () => true,
      getLoginStatus: () => ({ status: 'ok' })
    }

    const spark = makeSpark()

    startServerEvents(app, spark, (payload: unknown) => spark.write(payload))

    expect(app.listenerCount('serverevent')).to.equal(1)
    expect(app.listenerCount('serverAdminEvent')).to.equal(1)

    const types = spark.writes.map((entry) => (entry as { type?: string }).type)
    expect(types).to.include('VESSEL_INFO')
    expect(types).to.include('DEBUG_SETTINGS')
    expect(types).to.include('RECEIVE_LOGIN_STATUS')
    expect(types).to.include('SOURCEPRIORITIES')
    expect(types).to.include('TEST_A')
    expect(types).to.include('TEST_B')
  })

  it('wraps emitters and tracks routing metadata', () => {
    const base = new EventEmitter()
    const wrapped = wrapEmitter(base)

    const listener = () => undefined
    wrapped.addListener('alpha', listener)

    const emitted = wrapped.emit('alpha', { value: 1 })
    expect(emitted).to.equal(true)
    expect(wrapped.getEmittedCount()).to.equal(1)

    const routing = wrapped.getEventRoutingData()
    expect(routing.events[0].event).to.equal('alpha')
  })
})
