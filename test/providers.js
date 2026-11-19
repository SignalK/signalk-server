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

  it('Omitting nmea0183eventSentences via PUT removes the list', async function () {
    const put = (options) =>
      fetch(`${url}/skServer/providers/testProvider`, {
        method: 'put',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'testProvider',
          enabled: false,
          type: 'simple',
          options: { type: 'NMEA0183', device: '/dev/usb0', ...options }
        })
      })
    const savedOptions = () =>
      server.app.config.settings.pipedProviders.find(
        (p) => p.id === 'testProvider'
      ).pipeElements[0].options.subOptions

    let res = await put({ nmea0183eventSentences: ['VDM', 'VDO'] })
    res.status.should.equal(200)
    savedOptions().nmea0183eventSentences.should.deep.equal(['VDM', 'VDO'])

    res = await put({ suppress0183event: false })
    res.status.should.equal(200)
    savedOptions().should.not.have.property('nmea0183eventSentences')
  })
})

describe('Providers that run shell commands', () => {
  let server, url

  const savedExecute = {
    id: 'savedExecute',
    pipeElements: [
      {
        type: 'providers/simple',
        options: {
          logging: false,
          type: 'Execute',
          subOptions: { command: 'cat /dev/null' }
        }
      }
    ],
    enabled: false
  }

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    const serverApp = new Server({
      config: {
        settings: {
          port,
          interfaces: { plugins: false },
          pipedProviders: [savedExecute]
        }
      }
    })
    server = await serverApp.start()
  })

  after(async function () {
    delete process.env.ALLOW_EXECUTE_CONNECTIONS
    await server.stop()
  })

  const send = (method, path, body) =>
    fetch(`${url}/skServer/providers${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const ids = () => server.app.config.settings.pipedProviders.map((p) => p.id)
  const savedCommand = (id) =>
    server.app.config.settings.pipedProviders.find((p) => p.id === id)
      .pipeElements[0].options.subOptions.command

  it('refuses a new Execute connection', async function () {
    const res = await send('post', '', {
      id: 'planted',
      enabled: true,
      type: 'Execute',
      options: { command: 'touch /tmp/planted', dataType: 'NMEA0183' }
    })
    res.status.should.equal(400)
    ids().should.not.include('planted')
  })

  it('refuses turning a connection into an Execute connection', async function () {
    let res = await send('post', '', {
      id: 'plain',
      enabled: false,
      type: 'NMEA0183',
      options: { type: 'tcp', host: 'localhost', port: 10110 }
    })
    res.status.should.equal(200)
    res = await send('put', '/plain', {
      id: 'plain',
      enabled: false,
      type: 'Execute',
      options: { command: 'touch /tmp/planted' }
    })
    res.status.should.equal(400)
    server.app.config.settings.pipedProviders
      .find((p) => p.id === 'plain')
      .pipeElements[0].options.type.should.equal('NMEA0183')
  })

  it('refuses changing the command of a saved Execute connection', async function () {
    const res = await send('put', '/savedExecute', {
      id: 'savedExecute',
      enabled: false,
      type: 'Execute',
      options: { command: 'touch /tmp/planted' }
    })
    res.status.should.equal(400)
    savedCommand('savedExecute').should.equal('cat /dev/null')
  })

  it('updates a saved Execute connection whose command stays the same', async function () {
    const res = await send('put', '/savedExecute', {
      id: 'savedExecute',
      enabled: false,
      logging: true,
      type: 'Execute',
      options: { command: 'cat /dev/null' }
    })
    res.status.should.equal(200)
    server.app.config.settings.pipedProviders
      .find((p) => p.id === 'savedExecute')
      .pipeElements[0].options.logging.should.equal(true)
  })

  it('accepts Execute connections when the environment allows them', async function () {
    process.env.ALLOW_EXECUTE_CONNECTIONS = 'true'
    try {
      const res = await send('put', '/savedExecute', {
        id: 'savedExecute',
        enabled: false,
        type: 'Execute',
        options: { command: 'cat /dev/zero' }
      })
      res.status.should.equal(200)
      savedCommand('savedExecute').should.equal('cat /dev/zero')
    } finally {
      delete process.env.ALLOW_EXECUTE_CONNECTIONS
    }
  })

  for (const [type, options] of [
    ['NMEA2000', { type: 'ngt-1', device: '/dev/ttyUSB0;touch /tmp/planted' }],
    [
      'NMEA2000',
      { type: 'ngt-1', device: '/dev/ttyUSB0', baudrate: '1 $(id)' }
    ],
    ['NMEA2000', { type: 'canbus', interface: 'can0|sh' }],
    ['Seatalk', { type: 'gpiod', gpio: '4`id`' }],
    ['Seatalk', { gpio: '4', gpioInvert: "false' x" }]
  ]) {
    it(`refuses shell syntax in ${type} ${JSON.stringify(options)}`, async function () {
      const res = await send('post', '', {
        id: 'injected',
        enabled: false,
        type,
        options
      })
      res.status.should.equal(400)
      ids().should.not.include('injected')
    })
  }

  it('accepts ordinary device, interface and pin values', async function () {
    let res = await send('post', '', {
      id: 'ngt',
      enabled: false,
      type: 'NMEA2000',
      options: {
        type: 'ngt-1',
        device: '/dev/serial/by-id/usb-Actisense_NGT-1_1A2B-if00-port0',
        baudrate: 115200
      }
    })
    res.status.should.equal(200)
    res = await send('post', '', {
      id: 'can',
      enabled: false,
      type: 'NMEA2000',
      options: { type: 'canbus', interface: 'can0' }
    })
    res.status.should.equal(200)
    res = await send('post', '', {
      id: 'stalk',
      enabled: false,
      type: 'Seatalk',
      options: { type: 'gpiod', gpio: 'GPIO4', gpioInvert: false }
    })
    res.status.should.equal(200)
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
