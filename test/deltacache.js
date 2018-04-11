var chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const WebSocket = require('ws')
const rp = require('request-promise')
const startServerP = require('./servertestutilities').startServerP

const testDelta = {
  context: 'vessels.self',
  updates: [
    {
      timestamp: '2014-05-03T09:14:11.100Z',
      values: [
        {
          path: 'navigation.trip.log',
          value: 43374
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.099Z',
      values: [
        {
          path: 'navigation.log',
          value: 17404540
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.098Z',
      values: [
        {
          path: 'navigation.courseOverGroundTrue',
          value: 172.9
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.097Z',
      values: [
        {
          path: 'navigation.speedOverGround',
          value: 3.85
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.096Z',
      values: [
        {
          path: '',
          value: { name: 'TestBoat' }
        }
      ]
    }
  ]
}

describe('deltacache', () => {
  var serverP, port, deltaUrl, deltaP

  function sendDelta (delta) {
    return rp({ url: deltaUrl, method: 'POST', json: delta })
  }

  before(() => {
    serverP = freeport().then(p => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta'
      return startServerP(p)
    })
    deltaP = serverP.then(() => {
      return sendDelta(testDelta)
    })
  })

  after(() => {
    serverP.then(server => server.stop())
  })

  it('returns valid full true', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        var fullTree = server.app.deltaCache.buildFull(null, [])
        fullTree.should.be.validSignalK

        var self = _.get(fullTree, fullTree.self)
        self.should.have.nested.property('navigation.trip.log.value', 43374)
        self.should.have.nested.property('navigation.log.value', 17404540)
        self.should.have.nested.property(
          'navigation.courseOverGroundTrue.value',
          172.9
        )
        self.should.have.nested.property(
          'navigation.speedOverGround.value',
          3.85
        )
        self.should.have.nested.property('name', 'TestBoat')
      })
    })
  })

  /*
  it('deltas ordered properly', function () {
    return serverP
      .then(server => {
        return deltaP.then(() => {
          var deltas = server.app.deltaCache.getCachedDeltas(null, delta => true)
        })
      })
  })
  */
})
