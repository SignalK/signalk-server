const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
import { startServer } from './ts-servertestutilities'

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
      $source: 'defaults',
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
    context:
      'vessels.urn:mrn:signalk:uuid:db826a2c-c80a-4f69-8199-a83e41f45127',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.099Z',
        values: [
          {
            path: 'imaginary.path',
            value: 17404540
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

describe('Deltacache', () => {
  let doStop, theServer, doSendADelta

  before(() =>
    startServer().then((s) => {
      const { sendADelta, stop, server } = s
      doStop = stop
      theServer = server
      doSendADelta = sendADelta
      return sendADelta(testDelta)
    })
  )

  after(() => doStop())

  it('returns valid full tree', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, [])

    const self = _.get(fullTree, fullTree.self)
    self.should.have.nested.property('navigation.trip.log.value', 43374)
    self.should.have.nested.property('imaginary.path.value', 17404540)
    self.should.have.nested.property(
      'navigation.courseOverGroundTrue.value',
      172.9
    )
    self.should.have.nested.property('navigation.speedOverGround.value', 3.85)
    self.should.have.nested.property('name', 'TestBoat')

    delete self.imaginary
    delete self.navigation.course //FIXME until in schema
    fullTree.should.be.validSignalK
  })

  it('deltas ordered properly', function () {
    var deltas = theServer.app.deltaCache
      .getCachedDeltas(() => true, null)
      .filter((delta) => delta.updates[0].$source !== 'courseApi')
    // console.log(JSON.stringify(deltas, null, 2))
    deltas.length.should.equal(expectedOrder.length)
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

  it('returns /sources correctly', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, ['sources'])
    const self = _.get(fullTree, fullTree.self)
    delete self.imaginary
    delete self.navigation.course //FIXME until in schema
    fullTree.should.be.validSignalK
    fullTree.sources.should.deep.equal({
      defaults: {},
      deltaFromHttp: {}
    })
  })

  it('ingestDelta stores all sources in cache', function () {
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'gps.primary',
          timestamp: '2024-01-15T10:30:00.000Z',
          values: [
            {
              path: 'navigation.magneticVariation',
              value: 0.12
            }
          ]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'gps.backup',
              timestamp: '2024-01-15T10:30:01.000Z',
              values: [
                {
                  path: 'navigation.magneticVariation',
                  value: 0.13
                }
              ]
            }
          ]
        })
      )
      .then(() => {
        // Both sources should be in the cache (ingestDelta stores all)
        const selfId = theServer.app.selfId
        const leaf = _.get(theServer.app.deltaCache.cache, [
          'vessels',
          selfId,
          'navigation',
          'magneticVariation'
        ])
        leaf.should.have.property('gps.primary')
        leaf.should.have.property('gps.backup')
        leaf['gps.primary'].value.should.equal(0.12)
        leaf['gps.backup'].value.should.equal(0.13)
      })
  })

  it('getCachedDeltas returns only preferred source per path', function () {
    // getCachedDeltas should return one delta per path (the preferred source)
    const selfContext = 'vessels.' + theServer.app.selfId
    const cachedDeltas = theServer.app.deltaCache.getCachedDeltas(
      (d) => d.context === selfContext,
      null
    )
    const magVarDeltas = cachedDeltas.filter(
      (d) =>
        d.updates[0].values &&
        d.updates[0].values[0].path === 'navigation.magneticVariation'
    )
    // Should return exactly one delta for this path (the preferred source)
    magVarDeltas.length.should.equal(1)
  })

  it('buildFull includes all sources in values object', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, [])
    const self = _.get(fullTree, fullTree.self)
    const magVar = self.navigation.magneticVariation
    // Top-level value should exist
    magVar.should.have.property('value')
    // Both sources should appear in .values
    magVar.should.have.property('values')
    magVar.values.should.have.property('gps.primary')
    magVar.values.should.have.property('gps.backup')
  })

  it('getCachedDeltas with sourcePolicy=all returns all sources per path', function () {
    const selfContext = 'vessels.' + theServer.app.selfId
    const allDeltas = theServer.app.deltaCache.getCachedDeltas(
      (d) => d.context === selfContext,
      null,
      undefined,
      'all'
    )
    const magVarDeltas = allDeltas.filter(
      (d) =>
        d.updates[0].values &&
        d.updates[0].values[0].path === 'navigation.magneticVariation'
    )
    // Should return deltas from both sources
    magVarDeltas.length.should.equal(2)
    const sources = magVarDeltas.map((d) => d.updates[0].$source).sort()
    sources.should.deep.equal(['gps.backup', 'gps.primary'])
  })
})
