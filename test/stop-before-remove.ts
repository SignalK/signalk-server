import { expect } from 'chai'
import { stopBeforeRemove } from '../src/modules'

describe('stopBeforeRemove', () => {
  const originalConsoleError = console.error
  beforeEach(() => {
    console.error = () => {}
  })
  afterEach(() => {
    console.error = originalConsoleError
  })

  it('waits for the plugin to stop', async () => {
    let stopped = false
    await stopBeforeRemove(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      stopped = true
    }, 'some-plugin')
    expect(stopped).to.equal(true)
  })

  it('stops nothing for a package that is not a plugin', async () => {
    let called = false
    await stopBeforeRemove(async () => {
      called = true
    }, undefined)
    expect(called).to.equal(false)
  })

  it('lets the removal go ahead when stop() rejects', async () => {
    await stopBeforeRemove(
      () => Promise.reject(new Error('stop failed')),
      'some-plugin'
    )
  })

  it('lets the removal go ahead when stop() throws synchronously', async () => {
    await stopBeforeRemove(() => {
      throw new Error('stop failed')
    }, 'some-plugin')
  })

  it('lets the removal go ahead when stop() never settles', async () => {
    await stopBeforeRemove(() => new Promise(() => {}), 'some-plugin', 10)
  })
})
