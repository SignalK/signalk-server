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
            "value": 3.85
          }
        ]
      }
    ]
  }

  return _.assign(delta, overwrite)
}

describe('Subscriptions', _ => {
  it('default subscription serves self data', function() {
    var server,
      port,
      deltaUrl,
      self,
      ws,
      nextMessageCaller = new NextMessageCaller();

    return freeport().then(p => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta';

      return startServerP(p)
    }).then(startedServer => {
      server = startedServer

      ws = new WebSocket('ws://localhost:' + port + '/signalk/v1/stream');
      ws.on('message', nextMessageCaller.onMessage.bind(nextMessageCaller))
      return nextMessageCaller.nextMessagePromise()
    }).then(wsHello => {
      self = JSON.parse(wsHello).self

      const nextWs = nextMessageCaller.nextMessagePromise()
      const sendDelta = rp({
        url: deltaUrl,
        method: 'POST',
        json: getDelta({
          context: 'vessels.' + self
        })
      })
      return Promise.all([nextWs, sendDelta])
    }).then(results => {
      assert(JSON.parse(results[0]).updates[0].source.pgn === 128275)

      const nextWs = nextMessageCaller.nextMessagePromise()
      const sendDelta = rp({
        url: deltaUrl,
        method: 'POST',
        json: getDelta({
          context: 'vessels.othervessel'
        })
      })
      return Promise.all([nextWs, sendDelta])
    }).then(results => {
      assert(results[0] === "timeout")
    })
  })
})

function NextMessageCaller() {
  this.callees = []
}
NextMessageCaller.prototype.nextMessagePromise = function() {
  const callees = this.callees
  return new Promise((resolve, reject) => {
    callees.push(resolve)
    setTimeout(_ => {
      resolve("timeout")
    }, 500)
  })
}

NextMessageCaller.prototype.onMessage = function(message) {
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach(callee => callee(message))
}

function startServerP(port) {
  const Server = require('../lib');
  const server = new Server({settings: './test/server-test-settings.json', port: port});
  return server.start();
}
