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
})
