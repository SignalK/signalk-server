const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
const assert = require('assert')
const freeport = require('freeport-promise')
const { startServerP, sendDelta } = require('./servertestutilities')

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
          path: 'imaginary.path',
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

const expectedOrder = [
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.096Z',
        values: [
          {
            path: '',
            value: {
              name: 'TestBoat'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.097Z',
        values: [
          {
            path: 'navigation.speedOverGround',
            value: 3.85
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.098Z',
        values: [
          {
            path: 'navigation.courseOverGroundTrue',
            value: 172.9
          }
        ]
      }
    ]
  },
  {
    "context": "vessels.urn:mrn:signalk:uuid:db826a2c-c80a-4f69-8199-a83e41f45127",
    "updates": [
      {
        "$source": "deltaFromHttp",
        "timestamp": "2014-05-03T09:14:11.099Z",
        "values": [
          {
            "path": "imaginary.path",
            "value": 17404540
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.100Z',
        values: [
          {
            path: 'navigation.trip.log',
            value: 43374
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'defaults',
        timestamp: '2018-06-14T18:19:39.083Z',
        values: [
          {
            path: '',
            value: {
              uuid: 'urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e'
            }
          }
        ]
      }
    ]
  }
]

describe('deltacache', () => {
  let serverP, port, deltaUrl, deltaP

  before(() => {
    serverP = freeport().then(p => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta'
      return startServerP(p)
    })
    deltaP = serverP.then(() => {
      return sendDelta(testDelta, deltaUrl)
    })
  })

  after(done => {
    serverP
      .then(server => server.stop())
      .then(() => {
        done()
      })
  })

  it('returns valid full tree', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        const fullTree = server.app.deltaCache.buildFull(null, [])

        const self = _.get(fullTree, fullTree.self)
        self.should.have.nested.property('navigation.trip.log.value', 43374)
        self.should.have.nested.property('imaginary.path.value', 17404540)
        self.should.have.nested.property(
          'navigation.courseOverGroundTrue.value',
          172.9
        )
        self.should.have.nested.property(
          'navigation.speedOverGround.value',
          3.85
        )
        self.should.have.nested.property('name', 'TestBoat')

        delete self.imaginary
        fullTree.should.be.validSignalK
      })
    })
  })

  it('deltas ordered properly', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        var deltas = server.app.deltaCache.getCachedDeltas(delta => true, null)
        assert(deltas.length == expectedOrder.length)
        for (var i = 0; i < expectedOrder.length; i++) {
          if (!deltas[i].updates[0].meta) {
            deltas[i].updates[0].values[0].path.should.equal(
              expectedOrder[i].updates[0].values[0].path
            )
          } else {
            deltas[i].updates[0].meta[0].path.should.equal(
              expectedOrder[i].updates[0].meta[0].path
            )
          }
        }
      })
    })
  })

  it('returns /sources correctly', function () {
    return serverP.then(server => {
      return deltaP.then(() => {
        const fullTree = server.app.deltaCache.buildFull(null, ['sources'])
        const self = _.get(fullTree, fullTree.self)
        delete self.imaginary
        fullTree.should.be.validSignalK
        fullTree.sources.should.deep.equal({
          defaults: {},
          deltaFromHttp: {}
        })
      })
    })
  })
})
