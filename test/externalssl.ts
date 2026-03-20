import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

describe('EXTERNALSSL', function () {
  this.timeout(10000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  const savedExternalSsl = process.env.EXTERNALSSL

  afterEach(async function () {
    if (savedExternalSsl === undefined) {
      delete process.env.EXTERNALSSL
    } else {
      process.env.EXTERNALSSL = savedExternalSsl
    }
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('without EXTERNALSSL advertises non-ssl mDNS names', async function () {
    delete process.env.EXTERNALSSL
    const port = await freeport()
    server = await startServerP(port)
    expect(server.app.interfaces.ws.mdns.name).to.equal('_signalk-ws')
    expect(server.app.interfaces.rest.mdns.name).to.equal('_signalk-http')
  })

  it('with EXTERNALSSL=1 advertises ssl mDNS names', async function () {
    process.env.EXTERNALSSL = '1'
    const port = await freeport()
    server = await startServerP(port)
    expect(server.app.interfaces.ws.mdns.name).to.equal('_signalk-wss')
    expect(server.app.interfaces.rest.mdns.name).to.equal('_signalk-https')
  })

  it('with EXTERNALSSL=true advertises ssl mDNS names', async function () {
    process.env.EXTERNALSSL = 'true'
    const port = await freeport()
    server = await startServerP(port)
    expect(server.app.interfaces.ws.mdns.name).to.equal('_signalk-wss')
    expect(server.app.interfaces.rest.mdns.name).to.equal('_signalk-https')
  })

  it('with proxy_ssl setting advertises ssl mDNS names', async function () {
    delete process.env.EXTERNALSSL
    const port = await freeport()
    server = await startServerP(port, false, {
      settings: { proxy_ssl: true }
    })
    expect(server.app.interfaces.ws.mdns.name).to.equal('_signalk-wss')
    expect(server.app.interfaces.rest.mdns.name).to.equal('_signalk-https')
  })

  it('EXTERNALSSL=false does not advertise ssl mDNS names', async function () {
    process.env.EXTERNALSSL = 'false'
    const port = await freeport()
    server = await startServerP(port)
    expect(server.app.interfaces.ws.mdns.name).to.equal('_signalk-ws')
    expect(server.app.interfaces.rest.mdns.name).to.equal('_signalk-http')
  })
})
