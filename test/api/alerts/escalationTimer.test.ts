import { expect } from 'chai'
import {
  EscalationTimer,
  type EscalationEvent,
  type EscalationTimerConfig
} from '../../../src/api/alerts/escalationTimer'
import { FakeTimerFunctions } from './helpers/fakeTimerFunctions'

const MILLISECONDS_PER_SECOND = 1000

/** The window every test in this suite escalates after, unless it says otherwise. */
const DEFAULT_TIMEOUT_SECONDS = 300
const DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND

describe('EscalationTimer', () => {
  let timer: EscalationTimer
  let fakeTimers: FakeTimerFunctions
  let escalationEvents: EscalationEvent[]
  let defaultConfig: EscalationTimerConfig

  beforeEach(() => {
    fakeTimers = new FakeTimerFunctions()
    escalationEvents = []
    defaultConfig = { enabled: true, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS }
    timer = new EscalationTimer(
      defaultConfig,
      (event) => escalationEvents.push(event),
      fakeTimers
    )
  })

  afterEach(() => {
    timer.stop()
  })

  describe('startTimer', () => {
    it('should start timer for warning priority', () => {
      timer.startTimer('alert-1', 'warning')

      expect(timer.hasTimer('alert-1')).to.equal(true)
      expect(timer.getActiveTimerCount()).to.equal(1)
    })

    it('should not start timer for alarm priority', () => {
      timer.startTimer('alert-1', 'alarm')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should not start timer for emergency priority', () => {
      timer.startTimer('alert-1', 'emergency')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should not start timer for caution priority', () => {
      timer.startTimer('alert-1', 'caution')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should not start timer when escalation is disabled', () => {
      timer = new EscalationTimer(
        { enabled: false, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS },
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should be idempotent - starting timer twice does not create duplicate', () => {
      timer.startTimer('alert-1', 'warning')
      timer.startTimer('alert-1', 'warning')

      expect(timer.getActiveTimerCount()).to.equal(1)
      expect(fakeTimers.getPendingCount()).to.equal(1)
    })

    it('should track multiple alerts independently', () => {
      timer.startTimer('alert-1', 'warning')
      timer.startTimer('alert-2', 'warning')
      timer.startTimer('alert-3', 'warning')

      expect(timer.getActiveTimerCount()).to.equal(3)
      expect(timer.hasTimer('alert-1')).to.equal(true)
      expect(timer.hasTimer('alert-2')).to.equal(true)
      expect(timer.hasTimer('alert-3')).to.equal(true)
    })
  })

  it('should fire at a resumed remaining window, not the configured one', () => {
    // What a restart uses: an alert part-way through its escalation window
    // gets the remainder, not a fresh 300 s.
    timer.startTimer('alert-1', 'warning', 30 * 1000)

    fakeTimers.advanceTime(29 * 1000)
    expect(escalationEvents).to.have.lengthOf(0)

    fakeTimers.advanceTime(1000)
    expect(escalationEvents).to.have.lengthOf(1)
    expect(timer.getActiveTimerCount()).to.equal(0)
  })

  describe('escalation callback', () => {
    it('should fire escalation callback after timeout', () => {
      timer.startTimer('alert-1', 'warning')

      expect(escalationEvents).to.have.lengthOf(0)

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(escalationEvents).to.have.lengthOf(1)
      expect(escalationEvents[0].alertId).to.equal('alert-1')
      expect(escalationEvents[0].fromPriority).to.equal('warning')
      expect(escalationEvents[0].toPriority).to.equal('alarm')
    })

    it('should include timestamp in escalation event', () => {
      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      const { timestamp } = escalationEvents[0]
      expect(timestamp).to.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
      expect(Number.isFinite(Date.parse(timestamp))).to.equal(true)
    })

    it('should remove timer after escalation fires', () => {
      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should not fire callback before timeout', () => {
      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(299 * 1000) // 1 second before timeout

      expect(escalationEvents).to.have.lengthOf(0)
      expect(timer.hasTimer('alert-1')).to.equal(true)
    })

    it('should use configured timeout duration', () => {
      timer = new EscalationTimer(
        { enabled: true, timeoutSeconds: 60 },
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(59 * 1000)
      expect(escalationEvents).to.have.lengthOf(0)

      fakeTimers.advanceTime(1 * 1000) // Now at 60 seconds
      expect(escalationEvents).to.have.lengthOf(1)
    })

    it('should escalate multiple alerts independently', () => {
      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(100 * 1000)
      timer.startTimer('alert-2', 'warning')

      fakeTimers.advanceTime(200 * 1000) // 300s for alert-1, 200s for alert-2
      expect(escalationEvents).to.have.lengthOf(1)
      expect(escalationEvents[0].alertId).to.equal('alert-1')

      fakeTimers.advanceTime(100 * 1000) // 300s for alert-2
      expect(escalationEvents).to.have.lengthOf(2)
      expect(escalationEvents[1].alertId).to.equal('alert-2')
    })
  })

  describe('cancelTimer', () => {
    it('should prevent escalation callback when cancelled', () => {
      timer.startTimer('alert-1', 'warning')
      timer.cancelTimer('alert-1')

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(escalationEvents).to.have.lengthOf(0)
    })

    it('should remove timer from tracking', () => {
      timer.startTimer('alert-1', 'warning')

      expect(timer.hasTimer('alert-1')).to.equal(true)

      timer.cancelTimer('alert-1')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should be idempotent - cancelling non-existent timer is safe', () => {
      expect(() => {
        timer.cancelTimer('non-existent')
      }).to.not.throw()
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should only cancel the specified timer', () => {
      timer.startTimer('alert-1', 'warning')
      timer.startTimer('alert-2', 'warning')

      timer.cancelTimer('alert-1')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.hasTimer('alert-2')).to.equal(true)
      expect(timer.getActiveTimerCount()).to.equal(1)

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(escalationEvents).to.have.lengthOf(1)
      expect(escalationEvents[0].alertId).to.equal('alert-2')
    })
  })

  describe('stop', () => {
    it('should cancel all active timers', () => {
      timer.startTimer('alert-1', 'warning')
      timer.startTimer('alert-2', 'warning')
      timer.startTimer('alert-3', 'warning')

      timer.stop()

      expect(timer.getActiveTimerCount()).to.equal(0)
      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should not fire callbacks after stop', () => {
      timer.startTimer('alert-1', 'warning')

      timer.stop()
      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(escalationEvents).to.have.lengthOf(0)
    })

    it('should prevent new timers from starting after stop', () => {
      timer.stop()

      timer.startTimer('alert-1', 'warning')

      expect(timer.hasTimer('alert-1')).to.equal(false)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should be idempotent - multiple stop calls are safe', () => {
      timer.startTimer('alert-1', 'warning')

      expect(() => {
        timer.stop()
        timer.stop()
        timer.stop()
      }).to.not.throw()
    })
  })

  describe('hasTimer', () => {
    it('should return true for active timer', () => {
      timer.startTimer('alert-1', 'warning')

      expect(timer.hasTimer('alert-1')).to.equal(true)
    })

    it('should return false for non-existent timer', () => {
      expect(timer.hasTimer('non-existent')).to.equal(false)
    })

    it('should return false after timer fires', () => {
      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(timer.hasTimer('alert-1')).to.equal(false)
    })

    it('should return false after timer is cancelled', () => {
      timer.startTimer('alert-1', 'warning')
      timer.cancelTimer('alert-1')

      expect(timer.hasTimer('alert-1')).to.equal(false)
    })
  })

  describe('getActiveTimerCount', () => {
    it('should return 0 when no timers active', () => {
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should return correct count of active timers', () => {
      timer.startTimer('alert-1', 'warning')
      expect(timer.getActiveTimerCount()).to.equal(1)

      timer.startTimer('alert-2', 'warning')
      expect(timer.getActiveTimerCount()).to.equal(2)

      timer.cancelTimer('alert-1')
      expect(timer.getActiveTimerCount()).to.equal(1)
    })

    it('should decrease when timer fires', () => {
      timer.startTimer('alert-1', 'warning')
      timer.startTimer('alert-2', 'warning')

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)

      expect(timer.getActiveTimerCount()).to.equal(0)
    })
  })

  describe('edge cases', () => {
    it('falls back to the default window when the timeout is not a number', () => {
      const logged = console.error
      console.error = () => {}
      try {
        timer = new EscalationTimer(
          { enabled: true, timeoutSeconds: Number.NaN },
          (event) => escalationEvents.push(event),
          fakeTimers
        )
      } finally {
        console.error = logged
      }

      timer.startTimer('alert-1', 'warning')

      // Unvalidated, NaN reaches setTimeout and fires on the next tick, which
      // would escalate every warning the moment it is raised.
      fakeTimers.advanceTime(0)
      expect(escalationEvents).to.have.lengthOf(0)

      fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)
      expect(escalationEvents).to.have.lengthOf(1)
    })

    it('should escalate a zero timeout through a timer, not inline', () => {
      timer = new EscalationTimer(
        { enabled: true, timeoutSeconds: 0 },
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      // The caller must be able to finish raising the alert first, so a spent
      // window escalates on the next tick rather than within startTimer.
      expect(escalationEvents).to.have.lengthOf(0)
      expect(timer.getActiveTimerCount()).to.equal(1)

      fakeTimers.advanceTime(0)

      expect(escalationEvents).to.have.lengthOf(1)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should handle very large timeout values', () => {
      timer = new EscalationTimer(
        { enabled: true, timeoutSeconds: 86400 }, // 24 hours
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      fakeTimers.advanceTime(86400 * 1000)

      expect(escalationEvents).to.have.lengthOf(1)
    })

    it('should treat a negative timeout as a spent window', () => {
      timer = new EscalationTimer(
        { enabled: true, timeoutSeconds: -10 },
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      expect(escalationEvents).to.have.lengthOf(0)

      fakeTimers.advanceTime(0)

      expect(escalationEvents).to.have.lengthOf(1)
      expect(timer.getActiveTimerCount()).to.equal(0)
    })

    it('should let a spent window be cancelled before it fires', () => {
      timer = new EscalationTimer(
        { enabled: true, timeoutSeconds: 0 },
        (event) => escalationEvents.push(event),
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')
      timer.cancelTimer('alert-1')

      fakeTimers.advanceTime(0)

      expect(escalationEvents).to.have.lengthOf(0)
    })

    it('should use default timer functions when not provided', () => {
      const timerWithDefaults = new EscalationTimer(defaultConfig, (event) =>
        escalationEvents.push(event)
      )

      expect(() => {
        timerWithDefaults.stop()
      }).to.not.throw()
    })

    it('should propagate callback exceptions to caller', () => {
      const error = new Error('Callback failed')
      timer = new EscalationTimer(
        defaultConfig,
        () => {
          throw error
        },
        fakeTimers
      )

      timer.startTimer('alert-1', 'warning')

      // Exception should propagate - caller is responsible for handling
      expect(() => {
        fakeTimers.advanceTime(DEFAULT_TIMEOUT_MS)
      }).to.throw(error)

      // Timer should still be removed from tracking (cleanup happens before callback)
      expect(timer.hasTimer('alert-1')).to.equal(false)
    })
  })
})

describe('FakeTimerFunctions', () => {
  let fakeTimers: FakeTimerFunctions

  beforeEach(() => {
    fakeTimers = new FakeTimerFunctions()
  })

  it('should track pending timers', () => {
    const noop = (): void => {
      /* no-op for testing */
    }
    fakeTimers.setTimeout(noop, 1000)
    fakeTimers.setTimeout(noop, 2000)

    expect(fakeTimers.getPendingCount()).to.equal(2)
  })

  it('should fire timers in order of expiration', () => {
    const order: number[] = []

    fakeTimers.setTimeout(() => order.push(2), 2000)
    fakeTimers.setTimeout(() => order.push(1), 1000)
    fakeTimers.setTimeout(() => order.push(3), 3000)

    fakeTimers.advanceTime(3000)

    expect(order).to.deep.equal([1, 2, 3])
  })

  it('should allow clearing timers', () => {
    let called = false
    const handle = fakeTimers.setTimeout(() => {
      called = true
    }, 1000)

    fakeTimers.clearTimeout(handle)
    fakeTimers.advanceTime(1000)

    expect(called).to.equal(false)
    expect(fakeTimers.getPendingCount()).to.equal(0)
  })

  it('should not fire a timer cancelled by an earlier callback', () => {
    let secondFired = false

    const second = fakeTimers.setTimeout(() => {
      secondFired = true
    }, 2000)
    fakeTimers.setTimeout(() => fakeTimers.clearTimeout(second), 1000)

    fakeTimers.advanceTime(2000)

    expect(secondFired).to.equal(false)
  })

  it('should give a nested timer the delay it asked for', () => {
    let nestedAt: number | undefined

    fakeTimers.setTimeout(() => {
      fakeTimers.setTimeout(() => {
        nestedAt = fakeTimers.getCurrentTime()
      }, 1000)
    }, 1000)

    fakeTimers.advanceTime(2000)

    // The outer timer runs at 1000, so the inner one is due at 2000. Moving
    // straight to the target before firing would have made it due at 3000.
    expect(nestedAt).to.equal(2000)
  })

  it('should run a callback at its own expiry, not at the target', () => {
    let ranAt: number | undefined

    fakeTimers.setTimeout(() => {
      ranAt = fakeTimers.getCurrentTime()
    }, 1000)

    fakeTimers.advanceTime(5000)

    expect(ranAt).to.equal(1000)
    expect(fakeTimers.getCurrentTime()).to.equal(5000)
  })

  it('should track current time', () => {
    expect(fakeTimers.getCurrentTime()).to.equal(0)

    fakeTimers.advanceTime(1000)
    expect(fakeTimers.getCurrentTime()).to.equal(1000)

    fakeTimers.advanceTime(500)
    expect(fakeTimers.getCurrentTime()).to.equal(1500)
  })

  it('should reset all state', () => {
    fakeTimers.setTimeout(() => {
      /* no-op for testing */
    }, 1000)
    fakeTimers.advanceTime(500)

    fakeTimers.reset()

    expect(fakeTimers.getPendingCount()).to.equal(0)
    expect(fakeTimers.getCurrentTime()).to.equal(0)
  })
})
