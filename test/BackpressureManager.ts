import { expect } from 'chai'
import type { Delta } from '@signalk/server-api'
import {
  BackpressureManager,
  BackpressureOptions,
  BackpressureTransport,
  parseBackpressureThresholds
} from '../dist/BackpressureManager'

interface MockTransport extends BackpressureTransport {
  _bufferLength: number
  _writes: Delta[]
  _destroyed: boolean
  _bufferLengthCalls: number
}

function createMockTransport(bufferLength = 0): MockTransport {
  return {
    id: 'test-transport',
    _bufferLength: bufferLength,
    _writes: [],
    _destroyed: false,
    _bufferLengthCalls: 0,
    getBufferLength() {
      this._bufferLengthCalls++
      return this._bufferLength
    },
    write(delta: Delta) {
      this._writes.push(delta)
    },
    destroy() {
      this._destroyed = true
    }
  }
}

function createDelta(path: string, value: unknown, source?: string): Delta {
  return {
    context: 'vessels.self',
    updates: [
      {
        $source: source || 'test',
        timestamp: '2024-01-15T10:30:00.000Z',
        values: [{ path, value }]
      }
    ]
  } as Delta
}

const defaultOptions: BackpressureOptions = {
  enterThreshold: 1000,
  exitThreshold: 100,
  maxBufferSize: 5000,
  maxBufferCheckTime: 1000
}

describe('BackpressureManager', function () {
  describe('initial state', function () {
    it('should start inactive with empty accumulator', function () {
      const transport = createMockTransport()
      const manager = new BackpressureManager(transport, defaultOptions)
      expect(manager.isActive).to.be.false
      expect(manager.accumulatorSize).to.equal(0)
    })
  })

  describe('send', function () {
    it('should write directly when buffer is below threshold', function () {
      const transport = createMockTransport(0)
      const manager = new BackpressureManager(transport, defaultOptions)
      const delta = createDelta('navigation.speedOverGround', 5.0)

      manager.send(delta)

      expect(transport._writes.length).to.equal(1)
      expect(transport._writes[0]).to.equal(delta)
      expect(manager.isActive).to.be.false
    })

    it('should call beforeWrite hook when writing directly', function () {
      const transport = createMockTransport(0)
      const beforeWriteCalls: Delta[] = []
      const manager = new BackpressureManager(transport, {
        ...defaultOptions,
        beforeWrite: (delta: Delta) => beforeWriteCalls.push(delta)
      })
      const delta = createDelta('navigation.speedOverGround', 5.0)

      manager.send(delta)

      expect(beforeWriteCalls.length).to.equal(1)
      expect(beforeWriteCalls[0]).to.equal(delta)
    })

    it('should accumulate when buffer exceeds enter threshold', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)
      const delta = createDelta('navigation.speedOverGround', 5.0)

      manager.send(delta)

      expect(transport._writes.length).to.equal(0)
      expect(manager.isActive).to.be.true
      expect(manager.accumulatorSize).to.equal(1)
    })

    it('should keep only latest value per context:path:source', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0))
      manager.send(createDelta('navigation.speedOverGround', 5.5))
      manager.send(createDelta('navigation.speedOverGround', 6.0))

      expect(manager.accumulatorSize).to.equal(1)
    })

    it('should read transport buffer length only once per send', function () {
      const transport = createMockTransport(0)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0))

      expect(transport._bufferLengthCalls).to.equal(1)
    })

    it('should work without beforeWrite hook', function () {
      const transport = createMockTransport(0)
      const manager = new BackpressureManager(transport, defaultOptions)
      const delta = createDelta('navigation.speedOverGround', 5.0)

      manager.send(delta)

      expect(transport._writes.length).to.equal(1)
    })
  })

  describe('onDrain', function () {
    it('should flush when buffer drops below exit threshold', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0))
      expect(manager.isActive).to.be.true

      transport._bufferLength = 50
      manager.onDrain()

      expect(manager.isActive).to.be.false
      expect(manager.accumulatorSize).to.equal(0)
      expect(transport._writes.length).to.equal(1)
    })

    it('should not flush when buffer is still above exit threshold', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0))

      transport._bufferLength = 500
      manager.onDrain()

      expect(manager.isActive).to.be.true
      expect(manager.accumulatorSize).to.equal(1)
    })

    it('should be a no-op when not in backpressure', function () {
      const transport = createMockTransport(0)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.onDrain()

      expect(transport._writes.length).to.equal(0)
    })
  })

  describe('flush', function () {
    it('should write accumulated deltas and clear state', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0, 'gps'))
      manager.send(createDelta('navigation.courseOverGroundTrue', 1.57, 'gps'))

      transport._bufferLength = 0
      manager.flush()

      expect(transport._writes.length).to.equal(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const written = transport._writes[0] as any
      expect(written.$backpressure).to.exist
      expect(written.$backpressure.accumulated).to.equal(2)
      expect(manager.isActive).to.be.false
      expect(manager.accumulatorSize).to.equal(0)
    })

    it('should call beforeWrite hook for each flushed delta', function () {
      const transport = createMockTransport(2000)
      const beforeWriteCalls: Delta[] = []
      const manager = new BackpressureManager(transport, {
        ...defaultOptions,
        beforeWrite: (delta: Delta) => beforeWriteCalls.push(delta)
      })

      manager.send(createDelta('navigation.speedOverGround', 5.0))
      manager.flush()

      expect(beforeWriteCalls.length).to.equal(1)
    })

    it('should be a no-op with empty accumulator', function () {
      const transport = createMockTransport(0)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.flush()

      expect(transport._writes.length).to.equal(0)
    })
  })

  describe('assertBufferSize', function () {
    it('should destroy connection when buffer exceeded for too long', function (done) {
      const transport = createMockTransport(6000)
      const manager = new BackpressureManager(transport, {
        ...defaultOptions,
        maxBufferCheckTime: 10
      })

      manager.assertBufferSize()
      expect(transport._destroyed).to.be.false

      setTimeout(() => {
        manager.assertBufferSize()
        expect(transport._destroyed).to.be.true
        done()
      }, 15)
    })

    it('should not destroy when buffer drops below max', function () {
      const transport = createMockTransport(6000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.assertBufferSize()
      transport._bufferLength = 100
      manager.assertBufferSize()

      expect(transport._destroyed).to.be.false
    })

    it('should be a no-op when maxBufferSize is 0', function () {
      const transport = createMockTransport(999999)
      const manager = new BackpressureManager(transport, {
        ...defaultOptions,
        maxBufferSize: 0,
        maxBufferCheckTime: 0
      })

      manager.assertBufferSize()

      expect(transport._destroyed).to.be.false
    })
  })

  describe('clear', function () {
    it('should reset all state', function () {
      const transport = createMockTransport(2000)
      const manager = new BackpressureManager(transport, defaultOptions)

      manager.send(createDelta('navigation.speedOverGround', 5.0))
      expect(manager.isActive).to.be.true

      manager.clear()

      expect(manager.isActive).to.be.false
      expect(manager.accumulatorSize).to.equal(0)
    })
  })
})

describe('parseBackpressureThresholds', function () {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(function () {
    ;[
      'BACKPRESSURE_ENTER',
      'BACKPRESSURE_EXIT',
      'MAXSENDBUFFERSIZE',
      'MAXSENDBUFFERCHECKTIME'
    ].forEach((key) => {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    })
  })

  afterEach(function () {
    Object.entries(savedEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    })
  })

  it('should return defaults when no env vars set', function () {
    const thresholds = parseBackpressureThresholds()
    expect(thresholds.enterThreshold).to.equal(512 * 1024)
    expect(thresholds.exitThreshold).to.equal(1024)
    expect(thresholds.maxBufferSize).to.equal(4 * 512 * 1024)
    expect(thresholds.maxBufferCheckTime).to.equal(30 * 1000)
  })

  it('should respect env vars', function () {
    process.env.BACKPRESSURE_ENTER = '1000'
    process.env.BACKPRESSURE_EXIT = '500'
    process.env.MAXSENDBUFFERSIZE = '2000'
    process.env.MAXSENDBUFFERCHECKTIME = '5000'

    const thresholds = parseBackpressureThresholds()
    expect(thresholds.enterThreshold).to.equal(1000)
    expect(thresholds.exitThreshold).to.equal(500)
    expect(thresholds.maxBufferSize).to.equal(2000)
    expect(thresholds.maxBufferCheckTime).to.equal(5000)
  })

  it('should use config fallbacks for maxBuffer settings', function () {
    const thresholds = parseBackpressureThresholds({
      maxSendBufferSize: 8192,
      maxSendBufferCheckTime: 60000
    })
    expect(thresholds.maxBufferSize).to.equal(8192)
    expect(thresholds.maxBufferCheckTime).to.equal(60000)
  })

  it('should prefer env vars over config fallbacks', function () {
    process.env.MAXSENDBUFFERSIZE = '2000'
    process.env.MAXSENDBUFFERCHECKTIME = '5000'

    const thresholds = parseBackpressureThresholds({
      maxSendBufferSize: 8192,
      maxSendBufferCheckTime: 60000
    })
    expect(thresholds.maxBufferSize).to.equal(2000)
    expect(thresholds.maxBufferCheckTime).to.equal(5000)
  })
})
