const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const _ = require('lodash')
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const Server = require('../lib')
const fetch = require('node-fetch')

let testDelta = {
  updates: [
    {
      timestamp: '2018-08-09T14:07:29.695Z',
      values: [
        { path: 'performance.velocityMadeGood', value: 0.16641505293384623 },
        {
          path: 'performance.beatAngleVelocityMadeGood',
          value: 0.16641505293384623
        }
      ],
      $source: 'test-source'
    }
  ]
}

let dummyHistoryProvider = app => {
  return {
    streamHistory: (cookie, query, onDelta) => {
      setTimeout(() => {
        testDelta.context = `vessels.${app.selfId}`
        onDelta(testDelta)
      }, 100)
    },
    stopStreaming: cookie => {},
    addSubscription: (cookie, msg) => {},
    getHistory: (date, path, cb) => {
      testDelta.context = `vessels.${app.selfId}`
      cb([testDelta])
    }
  }
}

describe('History', _ => {
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
    server.app.registerHistoryProvider(dummyHistoryProvider(server.app))
  })

  after(async function () {
    await server.stop()
  })

  it('startTime subscription works', async function () {
    var wsPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=self&startTime=2018-08-23T12:39:48Z`
    )
    var msg = await wsPromiser.nextMsg()
    msg.should.not.equal('timeout')
    JSON.parse(msg)

    msg = await wsPromiser.nextMsg()
    msg.should.not.equal('timeout')
    let delta = JSON.parse(msg)
    delta.updates[0].values[0].path.should.equal('performance.velocityMadeGood')
  })

  it('REST time request works', async function () {
    var result = await fetch(
      `${url}/signalk/v1/api/vessels/self?time=2018-08-23T12:39:48Z`
    )
    result.status.should.equal(200)
    var json = await result.json()
    json.should.have.nested.property('performance.velocityMadeGood')
  })
})

// Connects to the url via ws
// and provides Promises that are either resolved within
// timeout period as the next message from the ws or
// the string "timeout" in case timeout fires
function WsPromiser (url) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
}

WsPromiser.prototype.nextMsg = function () {
  const callees = this.callees
  return new Promise((resolve, reject) => {
    callees.push(resolve)
    setTimeout(_ => {
      resolve('timeout')
    }, 250)
  })
}

WsPromiser.prototype.onMessage = function (message) {
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach(callee => callee(message))
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve, reject) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}
