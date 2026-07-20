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

function getZeroPositionDelta() {
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
              longitude: 0,
              latitude: 0
            }
          }
        ]
      }
    ],
    context: 'vessels.zeroPosition'
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

    //wait for ws messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 30))

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

    //wait for ws messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 30))
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
        // Give the server a tick to process the WS subscribe before the
        // POST races it on a separate connection — otherwise the delta can
        // be ingested under the default (self) subscription.
        return new Promise((resolve) => setTimeout(resolve, 30))
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

  it('name subscription serves correct data', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await wsPromiser.send({
      context: 'vessels.*',
      subscribe: [
        {
          path: ''
        }
      ]
    })

    // Empty-path deltas for another vessel must be delivered...
    await sendDelta(
      getEmptyPathDelta({ context: 'vessels.othervessel' }),
      deltaUrl
    )
    // ...but a non-empty path delta to self must NOT be. With
    // subscribe=none the connection has no default self subscription, so
    // the only deltas that arrive are those matching the empty-path
    // subscription. If a non-empty path leaked through, the empty-path
    // assertion below would catch it.
    await sendDelta(getDelta({ context: self }), deltaUrl)

    //wait for ws messages to arrive
    await new Promise((resolve) => setTimeout(resolve, 30))

    const deltas = wsPromiser.parsedMessages().slice(1)
    const values = deltas.flatMap((delta) =>
      delta.updates.flatMap((update) =>
        (update.values || []).map((vp) => ({ context: delta.context, ...vp }))
      )
    )

    //every delivered value must have an empty path
    values.forEach((vp) =>
      assert(vp.path === '', `Unexpected non-empty path '${vp.path}'`)
    )

    //othervessel empty-path values (mmsi + name) must have been delivered
    const otherValues = values.filter(
      (vp) => vp.context === 'vessels.othervessel'
    )
    assert(
      otherValues.some((vp) => typeof vp.value.mmsi === 'string'),
      'Expected othervessel value with mmsi, but none was found'
    )
    assert(
      otherValues.some((vp) => vp.value.name === 'SomeBoat'),
      'Expected othervessel value with name SomeBoat, but none was found'
    )
  })

  it('empty-path subscription does not replay cached non-empty paths', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    // Prime the cache with non-empty path values for self before
    // subscribing, so the bootstrap snapshot has something to leak.
    await sendDelta(getDelta({ context: self }), deltaUrl)
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Subscribe to the empty path, mirroring the reported client message.
    await wsPromiser.send({
      context: 'vessels.*',
      subscribe: [{ path: '' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    const values = wsPromiser
      .parsedMessages()
      .slice(1)
      .flatMap((delta) =>
        delta.updates.flatMap((update) => update.values || [])
      )

    // The bootstrap snapshot must only contain empty-path values.
    values.forEach((vp) =>
      assert(vp.path === '', `Unexpected non-empty path '${vp.path}'`)
    )
  })

  // Root deltas (path '') carry vessel identity fields as one object value.
  // Subscriptions to the corresponding leaf paths (name, mmsi,
  // communication.callsignVhf, ...) receive them flattened into per-leaf
  // deltas; '' and wildcard subscriptions keep the original root delta.
  // Each test uses its own context so cached data from other tests cannot
  // leak into the bootstrap snapshot.

  function collectValues(wsPromiser) {
    return wsPromiser
      .parsedMessages()
      .slice(1)
      .flatMap((delta) =>
        delta.updates.flatMap((update) =>
          (update.values || []).map((vp) => ({ context: delta.context, ...vp }))
        )
      )
  }

  it('leaf path subscription receives flattened root values', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    await wsPromiser.nthMessage(1)

    await wsPromiser.send({
      context: 'vessels.flat-live',
      subscribe: [{ path: 'name' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    await sendDelta(
      getEmptyPathDelta({ context: 'vessels.flat-live' }),
      deltaUrl
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    const values = collectValues(wsPromiser)
    assert(
      values.length === 1,
      `Expected exactly one value, got ${values.length}`
    )
    assert(values[0].context === 'vessels.flat-live')
    assert(
      values[0].path === 'name',
      `Expected path 'name', got '${values[0].path}'`
    )
    assert(values[0].value === 'SomeBoat')
  })

  it('wildcard leaf subscription receives nested flattened root values', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    await wsPromiser.nthMessage(1)

    await wsPromiser.send({
      context: 'vessels.flat-nested',
      subscribe: [{ path: 'communication.*' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    await sendDelta(
      getEmptyPathDelta({
        context: 'vessels.flat-nested',
        updates: [
          {
            timestamp: '2014-05-03T09:14:11.000Z',
            $source: 'ais',
            values: [
              {
                path: '',
                value: {
                  name: 'SomeBoat',
                  communication: { callsignVhf: 'MIPR2' }
                }
              }
            ]
          }
        ]
      }),
      deltaUrl
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    const values = collectValues(wsPromiser)
    assert(
      values.length === 1,
      `Expected exactly one value, got ${values.length}`
    )
    assert(values[0].context === 'vessels.flat-nested')
    assert(
      values[0].path === 'communication.callsignVhf',
      `Expected path 'communication.callsignVhf', got '${values[0].path}'`
    )
    assert(values[0].value === 'MIPR2')
  })

  it('wildcard subscription receives the root delta once, not flattened duplicates', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    await wsPromiser.nthMessage(1)

    await wsPromiser.send({
      context: 'vessels.flat-wild',
      subscribe: [{ path: '*' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    await sendDelta(
      getEmptyPathDelta({ context: 'vessels.flat-wild' }),
      deltaUrl
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    const values = collectValues(wsPromiser)
    // getEmptyPathDelta carries two root values (mmsi and name); the
    // subscriber must see exactly those, unflattened and undupped.
    assert(
      values.length === 2,
      `Expected exactly two values, got ${values.length}`
    )
    values.forEach((vp) => {
      assert(vp.context === 'vessels.flat-wild')
      assert(vp.path === '', `Unexpected non-root path '${vp.path}'`)
    })
  })

  it('leaf path subscription replays flattened cached root values', async function () {
    await serverP

    // Prime the cache before the client connects.
    await sendDelta(
      getEmptyPathDelta({ context: 'vessels.flat-cached' }),
      deltaUrl
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )
    await wsPromiser.nthMessage(1)

    await wsPromiser.send({
      context: 'vessels.flat-cached',
      subscribe: [{ path: 'name' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    const values = collectValues(wsPromiser)
    assert(
      values.length === 1,
      `Expected exactly one value, got ${values.length}`
    )
    assert(values[0].context === 'vessels.flat-cached')
    assert(
      values[0].path === 'name',
      `Expected path 'name', got '${values[0].path}'`
    )
    assert(values[0].value === 'SomeBoat')
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
        assert(results[0] !== 'timeout', 'Got timeout')
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

  it('relativePosition subscription works at zero latitude/longitude', function () {
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
              longitude: 0,
              latitude: 0
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
          sendDelta(getZeroPositionDelta(), deltaUrl)
        ])
      })
      .then(() => {
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getZeroPositionDelta(), deltaUrl)
        ])
      })
      .then((results) => {
        assert(results[0] !== 'timeout', 'Got timeout')
        const delta = JSON.parse(results[0])

        assert(delta.updates.length === 1, 'Receives just one update')
        assert(delta.updates[0].values.length === 1, 'Receives just one value')
        assert(delta.context === 'vessels.zeroPosition')

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

  it('JSON subscription with string period works', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )

    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await wsPromiser.send({
      context: 'vessels.*',
      subscribe: [
        {
          path: 'navigation.logTrip',
          policy: 'fixed',
          period: '500'
        }
      ]
    })

    await sendDelta(getDelta({ context: self }), deltaUrl)
    await new Promise((resolve) => setTimeout(resolve, 600))

    const messages = wsPromiser.parsedMessages().slice(1)
    const logTripMessages = messages.filter(
      (d) =>
        d.updates &&
        d.updates.some(
          (u) =>
            u.values && u.values.some((v) => v.path === 'navigation.logTrip')
        )
    )
    assert(
      logTripMessages.length > 0,
      'Should receive logTrip delta with string period'
    )
  })

  it('JSON subscription with string minPeriod works', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=none&metaDeltas=none'
    )

    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await wsPromiser.send({
      context: 'vessels.*',
      subscribe: [
        {
          path: 'navigation.courseOverGroundTrue',
          minPeriod: '200'
        }
      ]
    })

    await sendDelta(getDelta({ context: self }), deltaUrl)
    await sendDelta(getDelta({ context: self }), deltaUrl)
    await new Promise((resolve) => setTimeout(resolve, 300))

    const messages = wsPromiser.parsedMessages().slice(1)
    const cogMessages = messages.filter(
      (d) =>
        d.updates &&
        d.updates.some(
          (u) =>
            u.values &&
            u.values.some((v) => v.path === 'navigation.courseOverGroundTrue')
        )
    )
    assert(
      cogMessages.length > 0,
      'Should receive COG delta with string minPeriod'
    )
  })

  it('JSON subscription with invalid minPeriod warns and delivers deltas', function () {
    let self, wsPromiser

    return serverP
      .then((_) => {
        wsPromiser = new WsPromiser(
          'ws://localhost:' +
            port +
            '/signalk/v1/stream?subscribe=none&metaDeltas=none'
        )
        return wsPromiser.nextMsg()
      })
      .then((wsHello) => {
        self = JSON.parse(wsHello).self
        return Promise.all([
          wsPromiser.nextMsg(),
          sendDelta(getDelta({ context: self }), deltaUrl)
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
                minPeriod: 'abc'
              }
            ]
          })
        ])
      })
      .then(([response]) => {
        assert.equal(response, '"invalid minPeriod value \'abc\', ignoring"')
      })
  })

  it('announceNewPaths sends existing paths once and announces new paths', async function () {
    await serverP
    const wsPromiser = new WsPromiser(
      'ws://localhost:' + port + '/signalk/v1/stream?subscribe=none'
    )

    const hello = JSON.parse(await wsPromiser.nthMessage(1))
    const self = hello.self

    // Send initial delta to populate cache
    await sendDelta(getDelta({ context: self }), deltaUrl)

    // Wait for delta to be cached
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Subscribe with announceNewPaths - should receive cached paths once
    await wsPromiser.send({
      context: '*',
      announceNewPaths: true,
      subscribe: []
    })

    // Wait for announcements
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Get all messages after hello
    const messages = wsPromiser.parsedMessages().slice(1)

    // Should have received the cached paths
    assert(messages.length > 0, 'Should receive announced paths')

    // Verify we received the paths from our delta
    const paths = new Set()
    messages.forEach((msg) => {
      if (msg.updates) {
        msg.updates.forEach((update) => {
          if (update.values) {
            update.values.forEach((v) => {
              if (v.path) paths.add(v.path)
            })
          }
        })
      }
    })

    assert(
      paths.has('navigation.logTrip'),
      'Should announce navigation.logTrip'
    )
    assert(paths.has('navigation.log'), 'Should announce navigation.log')

    // Now send a NEW path that wasn't in the original delta
    const newPathDelta = {
      context: self,
      updates: [
        {
          timestamp: '2014-05-03T09:14:12.000Z',
          source: {
            label: 'test',
            src: '1'
          },
          values: [
            {
              path: 'environment.wind.speedApparent',
              value: 5.5
            }
          ]
        }
      ]
    }
    await sendDelta(newPathDelta, deltaUrl)

    // Wait for the new path announcement
    await new Promise((resolve) => setTimeout(resolve, 50))

    const allMessages = wsPromiser.parsedMessages().slice(1)
    const allPaths = new Set()
    allMessages.forEach((msg) => {
      if (msg.updates) {
        msg.updates.forEach((update) => {
          if (update.values) {
            update.values.forEach((v) => {
              if (v.path) allPaths.add(v.path)
            })
          }
        })
      }
    })

    assert(
      allPaths.has('environment.wind.speedApparent'),
      'Should announce new path environment.wind.speedApparent'
    )
  })
})
