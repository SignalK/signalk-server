import { expect } from 'chai'
import DeltaChain from '../src/deltachain'
import { Context, Delta, Path, SKVersion, Value } from '@signalk/server-api'

const delta = (id: string): Delta => ({
  context: 'vessels.self' as Context,
  updates: [{ values: [{ path: id as Path, value: 1 as Value }] }]
})

const now = new Date(0)

const firstValue = (msg: Delta) => {
  const update = msg.updates[0]
  if (!('values' in update)) {
    throw new Error('expected a values update')
  }
  return update.values[0]
}

const collector = () => {
  const dispatched: Delta[] = []
  const dispatch = (msg: Delta) => dispatched.push(msg)
  return { dispatched, dispatch }
}

describe('DeltaChain', function () {
  it('dispatches a delta through to the end when there are no handlers', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    const msg = delta('a')
    chain.process(msg, dispatch, now, SKVersion.v1)
    expect(dispatched).to.deep.equal([msg])
  })

  it('passes the delta along the chain and dispatches it', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    const seen: string[] = []
    chain.register((msg, next) => {
      seen.push('first')
      next(msg)
    })
    chain.register((msg, next) => {
      seen.push('second')
      next(msg)
    })
    const msg = delta('a')
    chain.process(msg, dispatch, now, SKVersion.v1)
    expect(seen).to.deep.equal(['first', 'second'])
    expect(dispatched).to.deep.equal([msg])
  })

  it('lets a handler drop a delta by not calling next', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    chain.register(() => {
      // swallow the delta
    })
    chain.process(delta('a'), dispatch, now, SKVersion.v1)
    expect(dispatched).to.be.empty
  })

  it('skips a throwing handler and still runs later handlers and dispatch', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    const seen: string[] = []
    chain.register(() => {
      throw new Error('boom')
    })
    chain.register((msg, next) => {
      seen.push('after')
      next(msg)
    })
    const msg = delta('a')
    chain.process(msg, dispatch, now, SKVersion.v1)
    expect(seen).to.deep.equal(['after'])
    expect(dispatched).to.deep.equal([msg])
  })

  it('does not continue twice when a handler calls next and then throws', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    const seen: string[] = []
    chain.register((msg, next) => {
      next(msg)
      throw new Error('boom after next')
    })
    chain.register((msg, next) => {
      seen.push('after')
      next(msg)
    })
    const msg = delta('a')
    chain.process(msg, dispatch, now, SKVersion.v1)
    expect(seen).to.deep.equal(['after'])
    expect(dispatched).to.deep.equal([msg])
  })

  it('handles every delta when a handler calls next multiple times', function () {
    const { dispatched, dispatch } = collector()
    const chain = new DeltaChain()
    const seen: Value[] = []
    chain.register((msg, next) => {
      next({
        ...msg,
        updates: [{ values: [{ path: 'foo' as Path, value: 1 as Value }] }]
      })
      next({
        ...msg,
        updates: [{ values: [{ path: 'bar' as Path, value: 2 as Value }] }]
      })
    })
    chain.register((msg, next) => {
      seen.push(firstValue(msg).value)
      next(msg)
    })
    chain.process(delta('a'), dispatch, now, SKVersion.v1)
    expect(seen).to.deep.equal([1, 2])
    expect(dispatched.map((d) => firstValue(d).path)).to.deep.equal([
      'foo',
      'bar'
    ])
  })
})
