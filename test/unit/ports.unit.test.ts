import { expect } from 'chai'
import {
  getExternalPort,
  getHttpPort,
  getPrimaryPort,
  getSecondaryPort,
  getSslPort
} from '../../src/ports'
import type { WithConfig } from '../../src/app'

type TestApp = {
  config: {
    settings: {
      ssl?: boolean
      port?: number
      sslport?: number
      proxy_port?: number
    }
  }
}

describe('ports', () => {
  const envBackup = { ...process.env }

  const makeApp = (settings: TestApp['config']['settings']): WithConfig =>
    ({
      config: { settings }
    }) as WithConfig

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('returns default ports and respects env overrides', () => {
    const app = makeApp({})

    expect(getHttpPort(app)).to.equal(3000)
    expect(getSslPort(app)).to.equal(3443)

    process.env.PORT = '4100'
    process.env.SSLPORT = '4443'

    expect(getHttpPort(app)).to.equal(4100)
    expect(getSslPort(app)).to.equal(4443)
  })

  it('selects primary port based on ssl setting and LISTEN_FDS', () => {
    const app = makeApp({ ssl: false, port: 3010, sslport: 3555 })

    expect(getPrimaryPort(app)).to.equal(3010)

    app.config.settings.ssl = true
    expect(getPrimaryPort(app)).to.equal(3555)

    process.env.LISTEN_FDS = '1'
    expect(getPrimaryPort(app)).to.deep.equal({ fd: 3 })
  })

  it('selects secondary port based on ssl setting and LISTEN_FDS', () => {
    const app = makeApp({ ssl: false, port: 3010, sslport: 3555 })

    expect(getSecondaryPort(app)).to.equal(-7777)

    app.config.settings.ssl = true
    expect(getSecondaryPort(app)).to.equal(3010)

    process.env.LISTEN_FDS = '1'
    expect(getSecondaryPort(app)).to.equal(false)

    process.env.LISTEN_FDS = '2'
    expect(getSecondaryPort(app)).to.deep.equal({ fd: 4 })
  })

  it('resolves external port with env and proxy overrides', () => {
    const app = makeApp({
      ssl: false,
      port: 3001,
      sslport: 3444,
      proxy_port: 7000
    })

    expect(getExternalPort(app)).to.equal(7000)

    delete process.env.EXTERNALPORT
    app.config.settings.proxy_port = undefined
    expect(getExternalPort(app)).to.equal(3001)

    app.config.settings.ssl = true
    expect(getExternalPort(app)).to.equal(3444)

    process.env.EXTERNALPORT = '9000'
    expect(getExternalPort(app)).to.equal(9000)
  })
})
