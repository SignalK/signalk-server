import { expect } from 'chai'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { isInternetAddress } from '../src/internetAddress'
import { EXPOSURE_STATUS_ID } from '../src/exposureWarning'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

describe('isInternetAddress', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '172.31.255.255',
    '192.168.1.20',
    '100.101.102.103',
    '169.254.1.1',
    '::1',
    'fd7a:115c:a1e0::1',
    'fe80::1',
    '::ffff:192.168.1.20'
  ]) {
    it(`treats ${address} as local`, () => {
      expect(isInternetAddress(address)).to.equal(false)
    })
  }

  for (const address of [
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8'
  ]) {
    it(`treats ${address} as an internet address`, () => {
      expect(isInternetAddress(address)).to.equal(true)
    })
  }

  it('treats a missing or malformed address as local', () => {
    expect(isInternetAddress(undefined)).to.equal(false)
    expect(isInternetAddress('not-an-address')).to.equal(false)
  })
})

describe('Warning about a server without security on the internet', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let url: string

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    const port = await freeport()
    url = `http://127.0.0.1:${port}`
    server = new Server({
      config: {
        settings: { port, trustProxy: true, interfaces: { plugins: false } }
      }
    })
    await server.start()
  })

  after(async function () {
    await server.stop()
  })

  const requestFrom = (address: string) =>
    fetch(`${url}/signalk`, { headers: { 'X-Forwarded-For': address } })

  it('stays quiet for requests from the local network', async () => {
    await requestFrom('192.168.1.20')
    expect(server.app.providerStatus[EXPOSURE_STATUS_ID]).to.equal(undefined)
  })

  it('warns once a request arrives from the internet', async () => {
    await requestFrom('203.0.113.7')
    const status = server.app.providerStatus[EXPOSURE_STATUS_ID]
    expect(status.type).to.equal('error')
    expect(status.message).to.contain('203.0.113.7')
  })
})
