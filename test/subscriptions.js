const _ = require('lodash')
const assert = require('assert')
const { sendDelta } = require('./servertestutilities')
const { freeport } = require('./ts-servertestutilities')
const { startServerP, WsPromiser } = require('./servertestutilities')

function getDelta(overwrite) {
  const delta = {
    updates: [
      {
        timestamp: '2014-05-03T09:14:11.000Z',
        source: {
          pgn: 128275,
          label: '/dev/actisense',
          src: '115'
        },
        values: [
          {
            path: 'navigation.logTrip',
            value: 43374
          },
          {
            path: 'navigation.log',
            value: 17404540
          }
        ]
      },
      {
        timestamp: '2014-05-03T09:14:11.001Z',
        source: {
          label: '/dev/actisense',
          src: '115',
          pgn: 128267
        },
        values: [
          {
            path: 'navigation.courseOverGroundTrue',
            value: 172.9
          },
          {
            path: 'navigation.speedOverGround',
            value: 3.85
          }
        ]
      },
      {
        timestamp: '2014-05-03T09:14:11.001Z',
        $source: 'ais',
        values: [
          {
            path: '',
            value: {
              name: 'aName'
            }
          },
          {
            path: '',
            value: {
              mmsi: '230000000'
            }
          }
        ]
      }
    ]
  }

  return _.assign(delta, overwrite)
}

function getEmptyPathDelta(overwrite) {
  const delta = {
    updates: [
      {
        timestamp: '2014-05-03T09:14:11.000Z',
        source: {
          pgn: 128275,
          label: '/dev/actisense',
          src: '115'
        },
        values: [
          {
            path: '',
            value: { mmsi: '230000000' }
          },
          {
            path: '',
            value: {
              name: 'SomeBoat'
            }
          }
        ]
      }
    ]
  }

  return _.assign(delta, overwrite)
}

function getClosePosistionDelta(overwrite) {
  const delta = {
    updates: [
      {
        source: {
          label: 'langford-canboatjs',
          type: 'NMEA2000',
          pgn: 129025,
          src: '3'
        },
        timestamp: '2017-04-15T14:58:01.200Z',
        values: [
          {
            path: 'navigation.position',
            value: {
              longitude: -76.4639314,
              latitude: 39.0700403
            }
          }
        ]
      }
    ],
    context: 'vessels.closeVessel'
  }

  return _.assign(delta, overwrite)
}

function getFarPosistionDelta() {
  const delta = {
    updates: [
      {
        source: {
          label: 'langford-canboatjs',
          type: 'NMEA2000',
          pgn: 129025,
          src: '3'
        },
        timestamp: '2017-04-15T14:58:01.200Z',
        values: [
          {
            path: 'navigation.position',
            value: {
              longitude: -76.4639314,
              latitude: 39.0700503
            }
          }
        ]
      }
    ],
    context: 'vessels.farVessel'
  }

  return delta
}

function getNullPositionDelta(overwrite) {
  const delta = {
    updates: [
      {
        source: {
          label: 'langford-canboatjs',
          type: 'NMEA2000',
          pgn: 129025,
          src: '3'
        },
        timestamp: '2017-04-15T14:58:01.200Z',
        values: [
          {
            path: 'navigation.position',
            value: {
              longitude: null,
              latitude: null
            }
          }
        ]
      }
    ],
    context: 'vessels.nullPosition'
  }

  return _.assign(delta, overwrite)
}

describe('Subscriptions', (_) => {
  let serverP, port, deltaUrl

  beforeEach(() => {
    serverP = freeport().then((p) => {
      port = p
      deltaUrl = 'http://localhost:' + port + '/signalk/v1/api/_test/delta'
      return startServerP(p, false, {
        settings: { disableSchemaMetaDeltas: true }
      })
    })
  })

  afterEach((done) => {
    serverP
      .then((server) => server.stop())
      .then(() => {
        done()
      })
  })

  async function testSelfData(url) {
    const wsPromiser = new WsPromiser(url)
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self
    await sendDelta(getDelta({ context: self }), deltaUrl)
    await sendDelta(getDelta({ context: 'vessels.othervessel' }), deltaUrl)

    //wait 250 ms so that we've received everything over ws
    await new Promise((resolve) => setTimeout(resolve, 250))

    //retrieve all deltas thus far
    const messages = wsPromiser.parsedMessages().slice(1)

    //all deltas must have self context
    messages.forEach((delta) => delta.context.should.equal(self))

    //check for the delta we sent
    messages
      .findIndex(
        (delta) => delta.updates[0].source && delta.updates[0].source.pgn
      )
      .should.be.at.least(0)
  }

  it('?subscribe=self subscription serves self data', async function () {
    await serverP
    await testSelfData(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=self&metaDeltas=none'
    )
  })

  it('default subscription serves self data', async function () {
    await serverP
    await testSelfData(
      'ws://localhost:' + port + '/signalk/v1/stream?metaDeltas=none'
    )
  })

  it('?subscribe=all subscription serves all data', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=all&metaDeltas=none'
    )
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self
    await sendDelta(getDelta({ context: self }), deltaUrl)
    await sendDelta(getDelta({ context: 'vessels.othervessel' }), deltaUrl)

    //wait so that we've received everything over ws
    await new Promise((resolve) => setTimeout(resolve, 100))
    const deltas = wsPromiser.parsedMessages().slice(1)
    const deltasWeSent = deltas.filter(
      (d) => d.updates[0].source && d.updates[0].source.pgn === 128275
    )
    assert(
      deltasWeSent.filter((d) => d.context === self).length === 1,
      'Received self delta'
    )
    assert(
      deltasWeSent.filter((d) => d.context === 'vessels.othervessel').length ===
        1,
      'Received other vessel delta'
    )
  })

  it('?subscribe=none subscription serves no data', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )

    const self = JSON.parse(await wsPromiser.nthMessage(1)).self
    await sendDelta(getDelta({ context: self }), deltaUrl)
    await sendDelta(getDelta({ context: 'vessels.othervessel' }), deltaUrl)

    try {
      await wsPromiser.nthMessage(3)
      throw new Error('no message number 3 should arrive')
    } catch (e) {
      assert.strictEqual(e, 'timeout')
    }
  })

  it('unsubscribe all plus navigation.logTrip subscription serves correct data', function () {
    let self, wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' + port + '/signalk/v1/stream'
        )
        return wsPromiser.nextMsg()
      })
      .then((wsHello) => {
        self = JSON.parse(wsHello).self

        return wsPromiser.send({ context: '*', unsubscribe: [{ path: '*' }] })
      })
      .then(() => {
        return wsPromiser.send({
          context: 'vessels.*',
          subscribe: [
            {
              path: 'navigation.logTrip'
            }
          ]
        })
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(
            getDelta({
              context: self
            }),
            deltaUrl
          )
        ])
      })
      .then((results) => {
        const delta = JSON.parse(results[0])
        assert(
          delta.updates[0].values[0].path === 'navigation.logTrip',
          'Receives navigation.logTrip'
        )
        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(delta.context === self)
        assert(delta.updates[0].timestamp, '2014-05-03T09:14:11.001Z')

        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getDelta({ context: 'vessels.othervessel' }), deltaUrl)
        ])
      })
      .then((results) => {
        const delta = JSON.parse(results[0])
        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(
          delta.updates[0].values[0].path === 'navigation.logTrip',
          'Receives just navigation.logTrip'
        )
        assert(delta.context === 'vessels.othervessel')
      })
  })

  it('name subscription serves correct data', function () {
    let self, wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' + port + '/signalk/v1/stream?subsribe=none'
        )
        return wsPromiser.nextMsg()
      })
      .then((wsHello) => {
        self = JSON.parse(wsHello).self

        return wsPromiser.send({
          context: 'vessels.*',
          subscribe: [
            {
              path: ''
            }
          ]
        })
      })
      .then(() => {
        sendDelta(
          getEmptyPathDelta({
            context: 'vessels.' + self
          }),
          deltaUrl
        )
      })
      .then(() => wsPromiser.nthMessage(4)) //self, 1st delta with mmsi
      .then((nextMsg) => {
        const delta = JSON.parse(nextMsg)
        assert(delta.updates[0].values[0].path === '', 'Path is empty string')
        assert(
          typeof delta.updates[0].values[0].value === 'object',
          'Value is an object'
        )
        assert(
          typeof delta.updates[0].values[0].value.mmsi !== 'undefined',
          'Value has mmsi key'
        )
        return wsPromiser.nthMessage(5) //self, 2nd delta with mmsi
      })
      .then((nextMsg) => {
        const delta = JSON.parse(nextMsg)
        assert(delta.updates[0].values[0].path === '', 'Path is empty string')
        assert(
          typeof delta.updates[0].values[0].value === 'object',
          'Value is an object'
        )
        assert(
          typeof delta.updates[0].values[0].value.name !== 'undefined',
          'Value has name key'
        )
        assert(
          delta.updates[0].values[0].value.name === 'SomeBoat',
          'Name value is correct'
        )
        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(
          delta.context === `vessels.${self}`,
          `Context is vessels.${self}, got ${delta.context}`
        )
        assert(
          delta.updates[0].timestamp == '2014-05-03T09:14:11.000Z',
          'Timestamp is correct'
        )

        sendDelta(
          getEmptyPathDelta({ context: 'vessels.othervessel' }),
          deltaUrl
        )

        return wsPromiser.nthMessage(6) //othervessel, 1st delta
      })
      .then((nextMsg) => {
        const delta = JSON.parse(nextMsg)
        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(
          delta.updates[0].values[0].path === '',
          'Receives pathvalue with empty path'
        )
        assert(
          typeof delta.updates[0].values[0].value.mmsi === 'string',
          'Receives object with mmsi'
        )
        assert(
          delta.context === 'vessels.othervessel',
          'Context is vessels.othervessel'
        )
      })
  })

  it('relativePosition subscription serves correct data', function () {
    let wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' +
            port +
            '/signalk/v1/stream?subsribe=none&metaDeltas=none'
        )
        return wsPromiser.nextMsg()
      })
      .then(() => {
        return wsPromiser.send({
          context: {
            radius: 1,
            position: {
              longitude: -76.4639314,
              latitude: 39.0700403
            }
          },
          subscribe: [
            {
              path: 'navigation.position'
            }
          ]
        })
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getClosePosistionDelta(), deltaUrl)
        ])
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getClosePosistionDelta(), deltaUrl)
        ])
      })
      .then((results) => {
        assert(results[0] != 'timeout', 'Got timeout')
        const delta = JSON.parse(results[0])

        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(delta.context === 'vessels.closeVessel')

        return sendDelta(getFarPosistionDelta(), deltaUrl)
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getFarPosistionDelta(), deltaUrl)
        ])
      })
      .then((results) => {
        assert(results[0] === 'timeout')
      })
  })

  it('relativePosition subscription works with null positions', function () {
    let wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' + port + '/signalk/v1/stream?subsribe=none'
        )
        return wsPromiser.nextMsg()
      })
      .then(() => {
        return wsPromiser.send({
          context: {
            radius: 1,
            position: {
              longitude: -76.4639314,
              latitude: 39.0700403
            }
          },
          subscribe: [
            {
              path: 'navigation.position'
            }
          ]
        })
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getNullPositionDelta(), deltaUrl)
        ])
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getNullPositionDelta(), deltaUrl)
        ])
      })
      .then((results) => {
        assert(results[0] === 'timeout')
      })
  })

  it('inconsistent subscription works', function () {
    let self, wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' + port + '/signalk/v1/stream?subscribe=none'
        )
        return wsPromiser.nextMsg()
      })
      .then((wsHello) => {
        self = JSON.parse(wsHello).self

        //SubscriptionManager does nothing unless we have some matching
        //data, so send some first
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(
            getDelta({
              context: self
            }),
            deltaUrl
          )
        ])
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          wsPromiser.send({
            context: '*',
            subscribe: [
              {
                path: 'navigation.courseOverGroundTrue',
                policy: 'ideal',
                minPeriod: 500
              }
            ]
          })
        ])
      })
      .then(([response]) => {
        assert.equal(
          '"minPeriod assumes policy \'instant\', ignoring policy ideal"',
          response
        )
      })
  })
})
