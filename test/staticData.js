const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
import { startServer } from './ts-servertestutilities'

const testDelta = {
  updates: [
    {
      values: [
        {
          path: '',
          value: {
            name: 'TestBoat',
            mmsi: '230083471',
            flag: 'NZ',
            communication: {
              callsignVhf: 'XYZ',
              phoneNumber: '8675309'
            }
          }
        },
        {
          path: 'design.draft',
          value: 20
        },
        {
          path: 'design.aisShipType',
          value: {
            name: 'Sailing',
            id: 36
          }
        },
        {
          path: 'design.beam',
          value: 10
        },
        {
          path: 'design.length',
          value: {
            overall: 9
          }
        },
        {
          path: 'sensors.gps.fromBow',
          value: 2
        },
        {
          path: 'sensors.gps.fromCenter',
          value: 5
        },
        {
          path: 'design.displacement',
          value: 1
        }
      ]
    }
  ]
}

describe('Static Data', () => {
  let doStop, theServer, doSendADelta

  before(() =>
    startServer().then((s) => {
      const { sendADelta, stop, server } = s
      doStop = stop
      theServer = server
      doSendADelta = sendADelta
    })
  )

  after(() => doStop())

  it('handles self static updates', async function () {
    const delta = JSON.parse(JSON.stringify(testDelta))
    delta.context = 'vessels.self'
    await doSendADelta(delta)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])

    const vessel = _.get(fullTree, fullTree.self)

    vessel.should.have.property('flag', 'NZ')
    vessel.should.have.nested.property('design.displacement.value', 1)
    vessel.should.have.nested.property('communication.phoneNumber', '8675309')

    vessel.should.not.have.property('mmsi')
    vessel.should.not.have.property('name')
    vessel.should.not.have.nested.property('design.draft')
    vessel.should.not.have.nested.property('design.aisShipType')
    vessel.should.not.have.nested.property('design.beam')
    vessel.should.not.have.nested.property('design.length')
    vessel.should.not.have.nested.property('sensors.gps.fromBow')
    vessel.should.not.have.nested.property('sensors.gps.fromCenter')
    vessel.should.not.have.nested.property('communication.callsignVhf')
  })

  it('handles others static updates', async function () {
    const delta = JSON.parse(JSON.stringify(testDelta))
    delta.context = 'vessels.123456789'
    await doSendADelta(delta)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])

    const self = _.get(fullTree, delta.context)

    self.should.have.property('flag', 'NZ')
    self.should.have.nested.property('design.displacement.value', 1)
    self.should.have.nested.property('communication.phoneNumber', '8675309')

    self.should.have.property('mmsi', '230083471')
    self.should.have.property('name', 'TestBoat')
    self.should.have.nested.property('design.draft')
    self.should.have.nested.property('design.aisShipType')
    self.should.have.nested.property('design.beam')
    self.should.have.nested.property('design.length')
    self.should.have.nested.property('sensors.gps.fromBow')
    self.should.have.nested.property('sensors.gps.fromCenter')
    self.should.have.nested.property('communication.callsignVhf')
  })

  it('allows static updates from defaults', async function () {
    const delta = JSON.parse(JSON.stringify(testDelta))
    delta.context = 'vessels.self'
    delta.updates[0]['$source'] = 'defaults'
    await doSendADelta(delta)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])

    const self = _.get(fullTree, fullTree.self)

    self.should.have.property('flag', 'NZ')
    self.should.have.nested.property('design.displacement.value', 1)
    self.should.have.nested.property('communication.phoneNumber', '8675309')

    self.should.have.property('mmsi', '230083471')
    self.should.have.property('name', 'TestBoat')
    self.should.have.nested.property('design.draft')
    self.should.have.nested.property('design.aisShipType')
    self.should.have.nested.property('design.beam')
    self.should.have.nested.property('design.length')
    self.should.have.nested.property('sensors.gps.fromBow')
    self.should.have.nested.property('sensors.gps.fromCenter')
    self.should.have.nested.property('communication.callsignVhf')
  })

  it('passes through a self update where no value is filtered', async function () {
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          $source: 'test.no-filter',
          values: [
            { path: 'design.airHeight', value: 5 },
            { path: 'navigation.speedOverGround', value: 7 }
          ]
        }
      ]
    }
    await doSendADelta(delta)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])
    const self = _.get(fullTree, fullTree.self)

    self.should.have.nested.property('design.airHeight.value', 5)
    self.should.have.nested.property('navigation.speedOverGround.value', 7)
  })

  it('drops a self update when every value is on a filtered path', async function () {
    // The previous "defaults" test wrote design.draft=20 / design.beam=10
    // under vessels.self. Sending an all-filtered delta from a non-defaults
    // source must leave those values intact: the filter should drop the
    // entire update before it can overwrite anything.
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          $source: 'test.all-filtered',
          values: [
            { path: 'design.draft', value: 999 },
            { path: 'design.beam', value: 999 }
          ]
        }
      ]
    }
    await doSendADelta(delta)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])
    const self = _.get(fullTree, fullTree.self)

    self.should.have.nested.property('design.draft.value', 20)
    self.should.have.nested.property('design.beam.value', 10)
  })

  it('tolerates an empty values array on a self update', async function () {
    const empty = {
      context: 'vessels.self',
      updates: [{ $source: 'test.empty-values', values: [] }]
    }
    await doSendADelta(empty)

    // Follow up with a regular delta to confirm the pipeline is still healthy
    // and that the empty update did not poison the server state.
    const followUp = {
      context: 'vessels.self',
      updates: [
        {
          $source: 'test.empty-values',
          values: [{ path: 'environment.outside.temperature', value: 273 }]
        }
      ]
    }
    await doSendADelta(followUp)

    const fullTree = theServer.app.deltaCache.buildFull(null, [])
    const self = _.get(fullTree, fullTree.self)
    self.should.have.nested.property(
      'environment.outside.temperature.value',
      273
    )
  })
})
