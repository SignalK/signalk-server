import { expect } from 'chai'
import { ProviderStatusEmitter } from '../dist/providerStatusEmitter'

const INTERVAL_MS = 40
// Long enough for a zero-delay timer to fire, short against INTERVAL_MS.
const SETTLE_MS = 5
const BURST_SIZE = 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function burst(emitter: ProviderStatusEmitter) {
  for (let i = 0; i < BURST_SIZE; i++) {
    emitter.request()
  }
}

describe('ProviderStatusEmitter', function () {
  it('folds a burst into one prompt emit and one more when the interval expires', async function () {
    let emits = 0
    const emitter = new ProviderStatusEmitter(() => emits++, INTERVAL_MS)

    burst(emitter)
    await sleep(SETTLE_MS)
    expect(emits).to.equal(1)

    burst(emitter)
    await sleep(INTERVAL_MS / 2)
    expect(emits).to.equal(1)
    await sleep(INTERVAL_MS)
    expect(emits).to.equal(2)

    emitter.cancel()
  })

  it('emits promptly when the last emit is older than the interval', async function () {
    let emits = 0
    const emitter = new ProviderStatusEmitter(() => emits++, INTERVAL_MS)

    emitter.request()
    await sleep(SETTLE_MS)
    expect(emits).to.equal(1)

    await sleep(INTERVAL_MS + SETTLE_MS)
    emitter.request()
    await sleep(SETTLE_MS)
    expect(emits).to.equal(2)

    emitter.cancel()
  })

  it('emitNow drops a pending request instead of emitting twice', async function () {
    let emits = 0
    const emitter = new ProviderStatusEmitter(() => emits++, INTERVAL_MS)

    emitter.emitNow()
    emitter.request()
    expect(emits).to.equal(1)
    emitter.emitNow()
    expect(emits).to.equal(2)
    await sleep(INTERVAL_MS + SETTLE_MS)
    expect(emits).to.equal(2)
  })

  it('cancel discards a pending request', async function () {
    let emits = 0
    const emitter = new ProviderStatusEmitter(() => emits++, INTERVAL_MS)

    emitter.emitNow()
    emitter.request()
    emitter.cancel()
    await sleep(INTERVAL_MS + SETTLE_MS)
    expect(emits).to.equal(1)
  })
})
