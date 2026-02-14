import { expect } from 'chai'
import createDummySecurity from '../../src/dummysecurity'

describe('dummysecurity', () => {
  it('returns a permissive security strategy with defaults', () => {
    const strategy = createDummySecurity()
    const strategyAny = strategy as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >

    expect(strategyAny.isDummy()).to.equal(true)
    expect(strategyAny.anyACLs()).to.equal(false)
    expect(strategyAny.allowRestart({} as unknown)).to.equal(false)
    expect(strategyAny.allowConfigure({} as unknown)).to.equal(false)
    expect(strategyAny.shouldAllowWrite({} as unknown, {})).to.equal(true)
    expect(
      strategyAny.shouldAllowPut(
        {} as unknown,
        'vessels.self',
        null,
        'navigation.speedOverGround'
      )
    ).to.equal(true)
    expect(strategyAny.allowReadOnly()).to.equal(true)
    expect(strategyAny.supportsLogin()).to.equal(false)
    expect(strategyAny.getAuthRequiredString()).to.equal('never')

    const loginStatus = strategyAny.getLoginStatus({} as unknown)
    expect(loginStatus).to.deep.equal({
      status: 'notLoggedIn',
      readOnlyAccess: false,
      authenticationRequired: false
    })
  })

  it('passes through config and deltas without filtering', () => {
    const strategy = createDummySecurity()
    const strategyAny = strategy as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >
    const config = { users: [] }
    const delta = { updates: [] }

    expect(strategyAny.getConfig(config)).to.equal(config)
    expect(strategyAny.filterReadDelta({}, delta)).to.equal(delta)
    expect(
      strategyAny.checkACL(
        'id',
        'vessels.self',
        'navigation.speedOverGround',
        null,
        'read'
      )
    ).to.equal(true)
  })
})
