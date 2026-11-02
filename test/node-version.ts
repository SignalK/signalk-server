import { expect } from 'chai'
import { isTestedNodeVersion, testedNodeVersions } from '../src/version'
import { startServer } from './ts-servertestutilities'

describe('Node version check', () => {
  it('accepts every tested major', () => {
    expect(isTestedNodeVersion('v24.11.0')).to.equal(true)
    expect(isTestedNodeVersion('v26.12.1')).to.equal(true)
  })

  it('flags an untested major', () => {
    expect(isTestedNodeVersion('v25.2.0')).to.equal(false)
    expect(isTestedNodeVersion('v27.0.0')).to.equal(false)
  })

  it('reports the tested majors on the nodeInfo endpoint', async () => {
    const { host, stop } = await startServer()
    try {
      const res = await fetch(`${host}/skServer/nodeInfo`)
      const body = await res.json()
      expect(body.nodeVersion).to.equal(process.version)
      expect(body.testedNodeVersions).to.deep.equal(testedNodeVersions)
    } finally {
      await stop()
    }
  })
})
