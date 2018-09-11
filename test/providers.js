const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const freeport = require('freeport-promise')
const Server = require('../lib')
const fetch = require('node-fetch')

describe('Providers', _ => {
  var server, url, port

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`
    const serverApp = new Server({
      config: {
        settings: {
          port,
          interfaces: {
            plugins: false
          },
          pipedProviders: []
        }
      }
    })
    server = await serverApp.start()
  })

  after(async function () {
    await server.stop()
  })

  it('New provider with empty or null id fails', async function () {
    const provider = {
      id: '',
      enabled: true,
      type: 'simple'
    }
    var result = await fetch(`${url}/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)

    delete provider.id
    var result = await fetch(`${url}/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
  })

  it('New provider works', async function () {
    var result = await fetch(`${url}/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: true,
        type: 'simple',
        options: {
          type: 'NMEA0183'
        }
      })
    })
    result.status.should.equal(200)
  })

  it('Update provider with empty or null id fails', async function () {
    const provider = {
      id: '',
      enabled: true,
      type: 'simple',
      options: {
        type: 'NMEA0183'
      }
    }
    var result = await fetch(`${url}/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)

    delete provider.id
    var result = await fetch(`${url}/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
  })
})
