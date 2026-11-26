import { expect } from 'chai'
import TimestampThrottle from './timestamp-throttle'

describe('TimestampThrottle', () => {
  it('passes through a past-timestamp message immediately', (done) => {
    const throttle = new TimestampThrottle({
      getMilliseconds: (msg) => Number(msg.timestamp)
    })

    throttle.once('data', () => {
      done()
    })

    const now = Date.now()
    throttle.write({ timestamp: String(now - 1000) })
  })

  it('delays messages with future timestamps', function (done) {
    this.timeout(5000)
    const throttle = new TimestampThrottle({
      getMilliseconds: (msg) => Number(msg.timestamp)
    })
    let count = 0
    throttle.on('data', () => {
      count++
      if (count === 1) {
        // first message (current time) should arrive immediately
        // second message (50ms future) should not be here yet
        setImmediate(() => {
          expect(count).to.equal(1)
        })
      } else if (count === 2) {
        done()
      }
    })

    const now = Date.now()
    throttle.write({ timestamp: String(now) })
    throttle.write({ timestamp: String(now + 50) })
  })

  it('does not let invalid timestamps alter later replay scheduling', () => {
    const originalNow = Date.now
    const originalSetTimeout = global.setTimeout
    const delays: number[] = []
    Date.now = () => 10000
    global.setTimeout = ((callback: () => void, delay?: number) => {
      delays.push(delay ?? 0)
      callback()
      return undefined as unknown as NodeJS.Timeout
    }) as typeof setTimeout

    try {
      const throttle = new TimestampThrottle({
        getMilliseconds: (msg) => Number(msg.timestamp)
      })
      throttle.on('data', () => {})

      for (const timestamp of ['100', 'invalid', '50', '75']) {
        throttle.write({ timestamp })
      }

      expect(delays).to.deep.equal([25])
    } finally {
      Date.now = originalNow
      global.setTimeout = originalSetTimeout
    }
  })
})
