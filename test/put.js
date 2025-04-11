const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const assert = require('assert')
const freeport = require('freeport-promise')
const Server = require('../dist')
const fetch = require('node-fetch')
const { registerActionHandler } = require('../dist/put')
const WebSocket = require('ws')
const _ = require('lodash')
// const { WsPromiser } = require('./servertestutilities')

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

describe('Put Requests', () => {
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
          }
        },
        defaults: {}
      }
    })
    server = await serverApp.start()

    function switch2Handler(context, path, value, cb) {
      if (typeof value !== 'number') {
        return { state: 'COMPLETED', statusCode: 400, message: 'invalid value' }
      } else {
        setTimeout(() => {
          server.app.handleMessage('test', {
            updates: [
              {
                values: [{ path: 'electrical.switches.switch2.state', value: value }]
              }
            ]
          })
          cb({ state: 'COMPLETED', statusCode: 200 })
        }, 100)
        return { state: 'PENDING' }
      }
    }

    registerActionHandler('vessels.self', 'electrical.switches.switch2.state', null, switch2Handler)

    server.app.handleMessage('test', {
      updates: [
        {
          values: [
            {
              path: 'notifications.testNotification',
              value: {
                state: 'alarm',
                method: ['visual', 'sound']
              }
            }
          ]
        }
      ]
    })
  })

  after(async function () {
    await server.stop()
  })

  it('HTTP put to unhandled path fails', async function () {
    const result = await fetch(
      `${url}/signalk/v1/api/vessels/self/electrical/switches/switch1.state`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 1
        })
      }
    )

    result.status.should.equal(405)
  })

  it('HTTP successful PUT', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/electrical/switches/switch2.state`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 1
        })
      }
    )

    result.status.should.equal(202)

    let response = await result.json()
    response.should.have.property('state')
    response.state.should.equal('PENDING')
    response.statusCode.should.equal(202)
    response.should.have.property('href')

    await sleep(200)

    result = await fetch(`${url}${response.href}`)

    result.status.should.equal(200)

    response = await result.json()
    response.should.have.property('state')
    response.state.should.equal('COMPLETED')
  })

  it('HTTP successfull meta put', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/electrical/switches/switch2.meta.units`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 'number'
        })
      }
    )

    result.status.should.equal(202)

    let json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('PENDING')
    json.should.have.property('href')

    await sleep(200)

    result = await fetch(`${url}${json.href}`)

    result.status.should.equal(200)

    json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')

    result = await fetch(
      `${url}/signalk/v1/api/vessels/self/electrical/switches/switch2/meta/units`
    )
    result.status.should.equal(200)
    let units = await result.json()
    units.should.equal('number')
  })

  it('HTTP failing put', async function () {
    const result = await fetch(
      `${url}/signalk/v1/api/vessels/self/electrical/switches/switch2/state`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 'dummy'
        })
      }
    )

    result.status.should.equal(400)

    const json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')
    json.should.have.property('message')
    json.message.should.equal('invalid value')
  })

  it('HTTP successful PUT notication state', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/notifications/testNotification/state`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: 'normal'
        })
      }
    )

    result.status.should.equal(200)

    console.log(result.href)

    result = await fetch(`${url}/signalk/v1/api/vessels/self/notifications/testNotification/value`)

    result.status.should.equal(200)

    let response = await result.json()
    response.should.have.property('state')
    response.state.should.equal('normal')
  })

  it('HTTP successful PUT notication method', async function () {
    let result = await fetch(
      `${url}/signalk/v1/api/vessels/self/notifications/testNotification/method`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: ['visual']
        })
      }
    )

    result.status.should.equal(200)

    console.log(result.href)

    result = await fetch(`${url}/signalk/v1/api/vessels/self/notifications/testNotification/value`)

    result.status.should.equal(200)

    let response = await result.json()
    response.should.have.property('method')
    assert(response.method.length === 1, 'one method')
    response.method[0].should.equal('visual')
  })

  it('WS put to unhandled path fails', async function () {
    const ws = new WsPromiser(`ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=none`)
    let msg = await ws.nextMsg()

    ws.clear()
    await ws.send({
      context: 'vessels.self',
      put: {
        path: 'electrical.switches.switch1.state',
        value: 1
      }
    })

    const readPromise = ws.nextMsg()
    msg = await readPromise
    msg.should.not.equal('timeout')
    const response = JSON.parse(msg)
    // console.log(msg)
    response.should.have.property('statusCode')
    response.statusCode.should.equal(405)
  })

  it('WS successfull put', async function () {
    const ws = new WsPromiser(`ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=none`)
    let msg = await ws.nextMsg()

    ws.clear()
    await ws.send({
      context: 'vessels.self',
      put: {
        path: 'electrical.switches.switch2.state',
        value: 1
      }
    })

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    let response = JSON.parse(msg)
    response.should.have.property('state')
    response.state.should.equal('PENDING')
    response.should.have.property('href')

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    response = JSON.parse(msg)
    response.should.have.property('state')
    response.state.should.equal('COMPLETED')
    response.should.have.property('statusCode')
    response.statusCode.should.equal(200)
  })

  it('WS failing put', async function () {
    const ws = new WsPromiser(`ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=none`)
    let msg = await ws.nextMsg()

    ws.clear()
    await ws.send({
      context: 'vessels.self',
      put: {
        path: 'electrical.switches.switch2.state',
        value: 'dummy'
      }
    })

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    const response = JSON.parse(msg)
    response.should.have.property('state')
    response.state.should.equal('COMPLETED')
    response.should.have.property('statusCode')
    response.statusCode.should.equal(400)
    response.should.have.property('message')
    response.message.should.equal('invalid value')
  })
})

function WsPromiser(url) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
  this.messages = []
}

WsPromiser.prototype.clear = function () {
  this.messages = []
}

WsPromiser.prototype.nextMsg = function () {
  const callees = this.callees
  return new Promise((resolve) => {
    if (this.messages.length > 0) {
      const message = this.messages[0]
      this.messages = this.messages.slice(1)
      resolve(message)
    } else {
      callees.push(resolve)
      setTimeout((_) => {
        resolve('timeout')
      }, 250)
    }
  })
}

WsPromiser.prototype.onMessage = function (message) {
  const theCallees = this.callees
  this.callees = []
  if (theCallees.length > 0) {
    theCallees.forEach((callee) => callee(message))
  } else {
    this.messages.push(message)
  }
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}
