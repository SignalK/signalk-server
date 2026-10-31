const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const { freeport } = require('./ts-servertestutilities')
const Server = require('../dist')

const nullIdText = 'Please enter a provider ID'

describe('Providers', (_) => {
  let server, url, port

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
          pipedProviders: [
            {
              id: 'existing',
              pipeElements: [
                {
                  type: 'providers/simple',
                  options: {
                    logging: false,
                    type: 'FileStream',
                    subOptions: {
                      dataType: 'Multiplexed',
                      filename: 'somefile.log'
                    }
                  }
                }
              ],
              enabled: false
            }
          ]
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
    let result = await fetch(`${url}/skServer/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
    let text = await result.text()
    text.should.equal(nullIdText)

    delete provider.id
    result = await fetch(`${url}/skServer/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
    text = await result.text()
    text.should.equal(nullIdText)
  })

  it('New provider works', async function () {
    const result = await fetch(`${url}/skServer/providers`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: true,
        options: {
          type: 'NMEA0183'
        }
      })
    })
    result.status.should.equal(200)
    const text = await result.text()
    text.should.equal('Connection added')
    const pipedProviders = server.app.config.settings.pipedProviders
    pipedProviders.length.should.equal(2)
    checkExistingProvider(pipedProviders[0])
    pipedProviders[1].id.should.equal('testProvider')
    pipedProviders[1].enabled.should.equal(true)
    pipedProviders[1].pipeElements.length.should.equal(1)
    pipedProviders[1].pipeElements[0].type.should.equal('providers/simple')
    pipedProviders[1].pipeElements[0].options.subOptions.type.should.equal(
      'NMEA0183'
    )
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
    let result = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
    let text = await result.text()
    text.should.equal(nullIdText)
    const pipedProviders = server.app.config.settings.pipedProviders
    pipedProviders[1].id.should.equal('testProvider')

    delete provider.id
    result = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(401)
    text = await result.text()
    text.should.equal(nullIdText)
    pipedProviders[1].id.should.equal('testProvider')
  })

  it('Update provider properties works', async function () {
    const provider = {
      id: 'testProvider',
      enabled: false,
      type: 'simple',
      options: {
        type: 'NMEA0183',
        device: '/dev/usb0'
      }
    }
    const result = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    })
    result.status.should.equal(200)
    const text = await result.text()
    text.should.equal('Connection updated')
    const pipedProviders = server.app.config.settings.pipedProviders
    pipedProviders.length.should.equal(2)
    checkExistingProvider(pipedProviders[0])
    pipedProviders[1].id.should.equal('testProvider')
    pipedProviders[1].enabled.should.equal(false)
    pipedProviders[1].pipeElements.length.should.equal(1)
    pipedProviders[1].pipeElements[0].type.should.equal('providers/simple')
    pipedProviders[1].pipeElements[0].options.subOptions.type.should.equal(
      'NMEA0183'
    )
    pipedProviders[1].pipeElements[0].options.subOptions.device.should.equal(
      '/dev/usb0'
    )
  })

  it('Clearing talkerGroups via PUT actually removes them', async function () {
    // First save: provider with a talkerGroups entry.
    let res = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: false,
        type: 'simple',
        options: {
          type: 'NMEA0183',
          device: '/dev/usb0',
          talkerGroups: { gps: ['GP', 'GL'] }
        }
      })
    })
    res.status.should.equal(200)
    let saved = server.app.config.settings.pipedProviders.find(
      (p) => p.id === 'testProvider'
    )
    saved.pipeElements[0].options.subOptions.talkerGroups.should.deep.equal({
      gps: ['GP', 'GL']
    })

    // Second save: provider with talkerGroups omitted (regression: this
    // is what the admin UI used to send when the user deleted the last
    // entry — the merge kept the previous saved groups).
    res = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: false,
        type: 'simple',
        options: {
          type: 'NMEA0183',
          device: '/dev/usb0'
        }
      })
    })
    res.status.should.equal(200)
    saved = server.app.config.settings.pipedProviders.find(
      (p) => p.id === 'testProvider'
    )
    // eslint-disable-next-line chai/no-unused-expressions
    chai.expect(saved.pipeElements[0].options.subOptions.talkerGroups).to.be
      .undefined
  })

  it('Empty talkerGroups object via PUT clears them', async function () {
    // Reset with a populated entry first.
    let res = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: false,
        type: 'simple',
        options: {
          type: 'NMEA0183',
          device: '/dev/usb0',
          talkerGroups: { gps: ['GP'] }
        }
      })
    })
    res.status.should.equal(200)

    // Send an empty talkerGroups object — what the fixed admin UI submits
    // when the user deletes the last entry.
    res = await fetch(`${url}/skServer/providers/testProvider`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testProvider',
        enabled: false,
        type: 'simple',
        options: {
          type: 'NMEA0183',
          device: '/dev/usb0',
          talkerGroups: {}
        }
      })
    })
    res.status.should.equal(200)
    const saved = server.app.config.settings.pipedProviders.find(
      (p) => p.id === 'testProvider'
    )
    saved.pipeElements[0].options.subOptions.talkerGroups.should.deep.equal({})
  })
})

function checkExistingProvider(existing) {
  existing.id.should.equal('existing')
  existing.enabled.should.equal(false)
  existing.pipeElements.length.should.equal(1)
  existing.pipeElements[0].type.should.equal('providers/simple')
  existing.pipeElements[0].options.type.should.equal('FileStream')
  existing.pipeElements[0].options.subOptions.dataType.should.equal(
    'Multiplexed'
  )
  existing.pipeElements[0].options.subOptions.filename.should.equal(
    'somefile.log'
  )
}
