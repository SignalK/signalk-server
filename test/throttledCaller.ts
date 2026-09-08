import { expect } from 'chai'
import { ThrottledCaller } from '../dist/throttledCaller'

const INTERVAL_MS = 40
// Long enough for a zero-delay timer to fire, short against INTERVAL_MS.
const SETTLE_MS = 5
const BURST_SIZE = 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function burst(caller: ThrottledCaller) {
  for (let i = 0; i < BURST_SIZE; i++) {
    caller.request()
  }
}

describe('ThrottledCaller', function () {
  it('folds a burst into one prompt call and one more when the interval expires', async function () {
    let calls = 0
    const caller = new ThrottledCaller(() => calls++, INTERVAL_MS)

    burst(caller)
    await sleep(SETTLE_MS)
    expect(calls).to.equal(1)

    burst(caller)
    await sleep(INTERVAL_MS / 2)
    expect(calls).to.equal(1)
    await sleep(INTERVAL_MS)
    expect(calls).to.equal(2)

    caller.cancel()
  })

  it('calls promptly when the last call is older than the interval', async function () {
    let calls = 0
    const caller = new ThrottledCaller(() => calls++, INTERVAL_MS)

    caller.request()
    await sleep(SETTLE_MS)
    expect(calls).to.equal(1)

    await sleep(INTERVAL_MS + SETTLE_MS)
    caller.request()
    await sleep(SETTLE_MS)
    expect(calls).to.equal(2)

    caller.cancel()
  })

  it('callNow drops a pending request instead of calling twice', async function () {
    let calls = 0
    const caller = new ThrottledCaller(() => calls++, INTERVAL_MS)

    caller.callNow()
    caller.request()
    expect(calls).to.equal(1)
    caller.callNow()
    expect(calls).to.equal(2)
    await sleep(INTERVAL_MS + SETTLE_MS)
    expect(calls).to.equal(2)
  })

  it('cancel discards a pending request', async function () {
    let calls = 0
    const caller = new ThrottledCaller(() => calls++, INTERVAL_MS)

    caller.callNow()
    caller.request()
    caller.cancel()
    await sleep(INTERVAL_MS + SETTLE_MS)
    expect(calls).to.equal(1)
  })
})
