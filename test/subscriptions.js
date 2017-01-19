const _ = require('lodash')
const assert = require('assert');
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const rp = require('request-promise');

function getDelta(overwrite) {
  const delta = {
    "updates": [
      {
        "source": {
          "pgn": 128275,
          "label": "/dev/actisense",
          "timestamp": "2014-05-03T09:14:11.000Z",
          "src": "115"
        },
        "values": [
          {
            "path": "navigation.logTrip",
            "value": 43374
          }, {
            "path": "navigation.log",
            "value": 17404540
          }
        ]
      }, {
        "source": {
          "label": "/dev/actisense",
          "timestamp": "2014-05-03T09:14:11.000Z",
          "src": "115",
          "pgn": 128267
        },
        "values": [
          {
            "path": "navigation.courseOverGroundTrue",
            "value": 172.9
          }, {
            "path": "navigation.speedOverGround",
            "value": 1.85
          }
        ]
      }
    ]
  }

  return _.assign(delta, overwrite)
}

describe('Subscriptions', _ => {
  var serverP,
    port,
    deltaUrl

  before(() => {
    serverP = freeport().then(p => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta';
      return startServerP(p)
    })
  })

  function sendDelta(delta) {
    return rp({url: deltaUrl, method: 'POST', json: delta})
  }

  it('?subscribe=self subscription serves self data', function() {
    var self,
      wsPromiser;

    return serverP.then(_ => {
      wsPromiser = new WsPromiser('ws://localhost:' + port + '/signalk/v1/stream?subscribe=self')
      return wsPromiser.nextMsg()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({
          context: 'vessels.' + self
        }))
      ])
    }).then(results => {
      console.log(JSON.stringify(JSON.parse(results[0]), null, 2))
      assert(JSON.parse(results[0]).updates[0].source.pgn === 128275)

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({context: 'vessels.othervessel'}))
      ])
    }).then(results => {
      // assert(results[0] === "timeout")
    })
  })

  it('default subscription serves self data', function() {
    var self,
      wsPromiser;

    return serverP.then(_ => {
      wsPromiser = new WsPromiser('ws://localhost:' + port + '/signalk/v1/stream')
      return wsPromiser.nextMsg()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({
          context: 'vessels.' + self
        }))
      ])
    }).then(results => {
      assert(JSON.parse(results[0]).updates[0].source.pgn === 128275)

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({context: 'vessels.othervessel'}))
      ])
    }).then(results => {
      assert(results[0] === "timeout")
    })
  })

  it('?subscribe=all subscription serves all data', function() {
    var self,
      wsPromiser;

    return serverP.then(_ => {
      wsPromiser = new WsPromiser('ws://localhost:' + port + '/signalk/v1/stream?subscribe=all')
      return wsPromiser.nextMsg()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({
          context: 'vessels.' + self
        }))
      ])
    }).then(results => {
      assert(JSON.parse(results[0]).updates[0].source.pgn === 128275)

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({context: 'vessels.othervessel'}))
      ])
    }).then(results => {
      assert(JSON.parse(results[0]).context === 'vessels.othervessel', "Sends other vessel data")
    })
  })

  it('?subscribe=none subscription serves no data', function() {
    var self,
      wsPromiser;

    return serverP.then(_ => {
      wsPromiser = new WsPromiser('ws://localhost:' + port + '/signalk/v1/stream?subscribe=none')
      return wsPromiser.nextMsg()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({
          context: 'vessels.' + self
        }))
      ])
    }).then(results => {
      assert(results[0] === "timeout")

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({context: 'vessels.othervessel'}))
      ])
    }).then(results => {
      assert(results[0] === "timeout")
    })
  })

  it('navigation.logTrip subscription serves correct data', function() {
    var self,
      wsPromiser;

    return serverP.then(_ => {
      wsPromiser = new WsPromiser('ws://localhost:' + port + '/signalk/v1/stream?subsribe=none')
      return wsPromiser.nextMsg()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      return wsPromiser.send({
        "context": "vessels.*",
        "subscribe": [
          {
            "path": "navigation.logTrip"
          }
        ]
      })
    }).then( () => {
      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({
          context: 'vessels.' + self
        }))
      ])
    }).then(results => {
      const delta = JSON.parse(results[0])
      assert(delta.updates[0].values[0].path === 'navigation.logTrip', "Receives navigation.logTrip")
      assert(delta.updates.length === 1, "Receives just one update")
      assert(delta.updates[0].values.length === 1, "Receives just one value")
      assert(delta.context === 'vessels.' + self)

      return Promise.all([
        wsPromiser.nextMsg(),
        sendDelta(getDelta({context: 'vessels.othervessel'}))
      ])
    }).then(results => {
      const delta = JSON.parse(results[0])
      assert(delta.updates.length === 1, "Receives just one update")
      assert(delta.updates[0].values.length === 1, "Receives just one value")
      assert(delta.updates[0].values[0].path === 'navigation.logTrip', "Receives just navigation.logTrip")
      assert(delta.context === 'vessels.othervessel')
    })
  })

})

//Connects to the url via ws
//and provides Promises that are either resolved within
//timeout period as the next message from the ws or
//the string "timeout" in case timeout fires
function WsPromiser(url) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
}

WsPromiser.prototype.nextMsg = function() {
  const callees = this.callees
  return new Promise((resolve, reject) => {
    callees.push(resolve)
    setTimeout(_ => {
      resolve("timeout")
    }, 250)
  })
}

WsPromiser.prototype.onMessage = function(message) {
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach(callee => callee(message))
}

WsPromiser.prototype.send = function(message) {
  const that = this
  return new Promise((resolve, reject) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve("wait over"), 100)
  })
}

function startServerP(port) {
  const Server = require('../lib');
  const server = new Server({settings: './test/server-test-settings.json', port: port});
  return server.start();
}
