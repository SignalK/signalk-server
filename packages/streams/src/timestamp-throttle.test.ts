import { expect } from 'chai'
import TimestampThrottle from './timestamp-throttle'

describe('TimestampThrottle', () => {
  it('passes through a past-timestamp message immediately', (done) => {
    const throttle = new TimestampThrottle({
      getMilliseconds: (msg) => Number(msg.timestamp)
    })
    const results: unknown[] = []
    throttle.on('data', (d: unknown) => results.push(d))

    const now = Date.now()
    throttle.write({ timestamp: String(now - 1000) })

    setTimeout(() => {
      expect(results).to.have.length(1)
      done()
    }, 50)
  })

  it('delays messages with future timestamps', function (done) {
    this.timeout(5000)
    const throttle = new TimestampThrottle({
      getMilliseconds: (msg) => Number(msg.timestamp)
    })
    const results: unknown[] = []
    throttle.on('data', (d: unknown) => results.push(d))

    const now = Date.now()
    throttle.write({ timestamp: String(now) })
    throttle.write({ timestamp: String(now + 500) })

    setTimeout(() => {
      expect(results).to.have.length(1)
    }, 100)

    setTimeout(() => {
      expect(results).to.have.length(2)
      done()
    }, 700)
  })
})
