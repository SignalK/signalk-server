import { expect } from 'chai'
import { createDebug, listKnownDebugs } from '../../src/debug'

describe('debug', () => {
  it('tracks known debug namespaces', () => {
    createDebug('signalk-test:one')
    createDebug('signalk-test:two')

    const list = listKnownDebugs()

    expect(list).to.include('signalk-test:one')
    expect(list).to.include('signalk-test:two')
  })

  it('does not duplicate known debug namespaces', () => {
    createDebug('signalk-test:unique')
    createDebug('signalk-test:unique')

    const list = listKnownDebugs().filter(
      (name) => name === 'signalk-test:unique'
    )
    expect(list).to.have.length(1)
  })
})
