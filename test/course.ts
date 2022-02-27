import { strict as assert } from 'assert'
import chai from 'chai'
import freeport from 'freeport-promise'
import fetch from 'node-fetch'
import path from 'path'
import rmfr from 'rmfr'
import {
  sendDelta,
  serverTestConfigDirectory,
  startServerP,
  WsPromiser
} from './servertestutilities'
chai.should()

describe('Course Api', () => {
  it('can set course destination as position', async function() {
    const {
      createWsPromiser,
      selfGetJson,
      selfPut,
      sendDelta,
      stop
    } = await startServer()
    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })
    await wsPromiser.nthMessage(2)

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5, longitude: 138.7 }
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(3))
    courseDelta.context.should.equal(self)

    deltaHasPathValue(courseDelta, 'navigation.course', {
      nextPoint: {
        href: null,
        type: 'Location',
        position: { latitude: -35.5, longitude: 138.7 },
        arrivalCircle: 0
      },
      previousPoint: {
        href: null,
        type: 'VesselPosition',
        position: { latitude: -35.45, longitude: 138 }
      }
    })
    await selfGetJson('navigation/course').then(data => {
      data.should.deep.equal({
        activeRoute: {
          href: null,
          startTime: null,
          pointIndex: 0,
          pointTotal: 0,
          reverse: false
        },
        nextPoint: {
          href: null,
          type: 'Location',
          position: { latitude: -35.5, longitude: 138.7 },
          arrivalCircle: 0
        },
        previousPoint: {
          href: null,
          type: 'VesselPosition',
          position: { latitude: -35.45, longitude: 138 }
        }
      })
    })
    await stop()
  })

  it('can not set course destination as nonexistent waypoint or bad payload', async function() {
    const { createWsPromiser, selfPut, sendDelta, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1) // hello

    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })
    await wsPromiser.nthMessage(2) // position

    const validDestinationPosition = { latitude: -35.5, longitude: 138.7 }

    await selfPut('navigation/course/destination', {
      position: validDestinationPosition
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(3))
    try {
      courseDelta.updates[0].values[0].value.nextPoint.position.should.deep.equal(
        validDestinationPosition
      )
    } catch (e) {
      console.log(JSON.stringify(courseDelta, null, 2))
      throw e
    }

    await selfPut('navigation/course/destination', {
      href:
        '/resources/waypoints/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b95'
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(4))

    await selfPut('navigation/course/destination', {
      hrefff: 'dummy data'
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(4))

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5 }
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(4))

    await stop()
  })

  it('can set course destination as waypoint with arrivalcircle', async function() {
    const {
      createWsPromiser,
      post,
      selfGetJson,
      selfPut,
      sendDelta,
      stop
    } = await startServer()
    const vesselPosition = { latitude: -35.45, longitude: 138.0 }
    sendDelta('navigation.position', vesselPosition)

    const destination = {
      latitude: 60.1699,
      longitude: 24.9384
    }
    const { id } = await post('/resources/waypoints', {
      position: destination
    }).then(response => {
      response.status.should.equal(200)
      return response.json()
    })
    id.length.should.equal(
      'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length
    )
    const href = `/resources/waypoints/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/destination', {
      href,
      arrivalCircle: 99
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    deltaHasPathValue(courseDelta, 'navigation.course', {
      nextPoint: {
        href,
        type: 'Waypoint',
        position: destination,
        arrivalCircle: 99
      },
      previousPoint: {
        href: null,
        type: 'VesselPosition',
        position: vesselPosition
      }
    })
    await selfGetJson('navigation/course').then(data => {
      data.should.deep.equal({
        activeRoute: {
          href: null,
          startTime: null,
          pointIndex: 0,
          pointTotal: 0,
          reverse: false
        },
        nextPoint: {
          href,
          type: 'Waypoint',
          position: destination,
          arrivalCircle: 99
        },
        previousPoint: {
          href: null,
          type: 'VesselPosition',
          position: vesselPosition
        }
      })
    })
    stop()
  })
})

const emptyConfigDirectory = () =>
  Promise.all(
    ['serverstate/course', 'resources', 'plugin-config-data', 'baseDeltas.json']
      .map(subDir => path.join(serverTestConfigDirectory(), subDir))
      .map(dir => rmfr(dir).then(() => console.error(dir)))
  )

const startServer = async () => {
  const port = await freeport()
  const host = 'http://localhost:' + port
  const sendDeltaUrl = host + '/signalk/v1/api/_test/delta'
  const api = host + '/signalk/v1/api'

  await emptyConfigDirectory()
  const server = await startServerP(port, false, {
    settings: {
      interfaces: {
        plugins: true
      }
    }
  })
  return {
    createWsPromiser: () =>
      new WsPromiser(
        'ws://localhost:' +
          port +
          '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
      ),
    selfPut: (path: string, body: object) =>
      fetch(`${api}/vessels/self/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    post: (path: string, body: object) =>
      fetch(`${api}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }),
    selfGetJson: (path: string) =>
      fetch(`${api}/vessels/self/${path}`).then(r => r.json()),
    sendDelta: (path: string, value: any) =>
      sendDelta(
        {
          updates: [
            {
              values: [
                {
                  path,
                  value
                }
              ]
            }
          ]
        },
        sendDeltaUrl
      ),
    stop: () => server.stop()
  }
}

const deltaHasPathValue = (delta: any, path: string, value: any) =>
  delta.updates[0].values
    .find((x: any) => x.path === path)
    .value.should.deep.equal(value)
