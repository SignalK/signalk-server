const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const freeport = require('freeport-promise')
const Server = require('../lib')
const fetch = require('node-fetch')
const { registerActionHandler } = require('../lib/put')
const WebSocket = require('ws')
// const { WsPromiser } = require('./servertestutilities')

const sleep = ms => new Promise(res => setTimeout(res, ms))

describe('Put Requests', () => {
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
          }
        }
      }
    })
    server = await serverApp.start()

    function switch2Handler (context, path, value, cb) {
      if (typeof value !== 'number') {
        return { state: 'COMPLETED', statusCode: 400, message: 'invalid value' }
      } else {
        setTimeout(() => {
          server.app.handleMessage('test', {
            updates: [
              {
                values: [
                  { path: 'electrical.switches.switch2.state', value: value }
                ]
              }
            ]
          })
          cb({ state: 'COMPLETED', statusCode: 200 })
        }, 100)
        return { state: 'PENDING' }
      }
    }

    registerActionHandler(
      'vessels.self',
      'electrical.switches.switch2.state',
      null,
      switch2Handler
    )
  })

  after(async function () {
    await server.stop()
  })

  it('HTTP put to unhandled path fails', async function () {
    var result = await fetch(
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

  it('HTTP successfull put', async function () {
    var result = await fetch(
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

    var json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('PENDING')
    json.should.have.property('href')

    await sleep(200)

    var result = await fetch(`${url}${json.href}`)

    result.status.should.equal(200)

    var json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')
  })

  it('HTTP failing put', async function () {
    var result = await fetch(
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

    var json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')
    json.should.have.property('message')
    json.message.should.equal('invalid value')
  })

  it('WS put to unhandled path fails', async function () {
    var ws = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none`
    )
    var msg = await ws.nextMsg()

    ws.clear()
    let something = await ws.send({
      context: 'vessels.self',
      put: {
        path: 'electrical.switches.switch1.state',
        value: 1
      }
    })

    let readPromise = ws.nextMsg()
    msg = await readPromise
    msg.should.not.equal('timeout')
    let response = JSON.parse(msg)
    // console.log(msg)
    response.should.have.property('statusCode')
    response.statusCode.should.equal(405)
  })

  it('WS successfull put', async function () {
    var ws = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none`
    )
    var msg = await ws.nextMsg()

    ws.clear()
    let something = await ws.send({
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

    msg = await ws.nextMsg() // skip the update

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    response = JSON.parse(msg)
    response.should.have.property('state')
    response.state.should.equal('COMPLETED')
    response.should.have.property('statusCode')
    response.statusCode.should.equal(200)
  })

  it('WS failing put', async function () {
    var ws = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none`
    )
    var msg = await ws.nextMsg()

    ws.clear()
    let something = await ws.send({
      context: 'vessels.self',
      put: {
        path: 'electrical.switches.switch2.state',
        value: 'dummy'
      }
    })

    msg = await ws.nextMsg()
    msg.should.not.equal('timeout')
    let response = JSON.parse(msg)
    response.should.have.property('state')
    response.state.should.equal('COMPLETED')
    response.should.have.property('statusCode')
    response.statusCode.should.equal(400)
    response.should.have.property('message')
    response.message.should.equal('invalid value')
  })
})

function WsPromiser (url) {
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
  return new Promise((resolve, reject) => {
    if (this.messages.length > 0) {
      const message = this.messages[0]
      this.messages = this.messages.slice(1)
      resolve(message)
    } else {
      callees.push(resolve)
      setTimeout(_ => {
        resolve('timeout')
      }, 250)
    }
  })
}

WsPromiser.prototype.onMessage = function (message) {
  const theCallees = this.callees
  this.callees = []
  if (theCallees.length > 0) {
    theCallees.forEach(callee => callee(message))
  } else {
    this.messages.push(message)
  }
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve, reject) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}
