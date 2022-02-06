import freeport from 'freeport-promise'
import fetch from 'node-fetch'
import { sendDelta, startServerP, WsPromiser } from './servertestutilities'
import chai from 'chai'
import { response } from 'express'
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
    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5, longitude: 138.7 }
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
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
    const { selfPut, sendDelta, stop } = await startServer()
    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })

    await selfPut('navigation/course/destination', {
      href:
        '/resources/waypoints/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b95'
    }).then(response => response.status.should.equal(400))

    await selfPut('navigation/course/destination', {
      hrefff: 'dummy data'
    }).then(response => response.status.should.equal(400))

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5 }
    }).then(response => response.status.should.equal(400))

    await stop()
  })

  it('can set course destination as waypoint', async function() {
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
    const href = `/resources/waypoints/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/destination', {
      href
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    deltaHasPathValue(courseDelta, 'navigation.course', {
      nextPoint: {
        href,
        type: 'Waypoint',
        position: destination,
        arrivalCircle: 0
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
          arrivalCircle: 0
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

const startServer = async () => {
  const port = await freeport()
  const host = 'http://localhost:' + port
  const sendDeltaUrl = host + '/signalk/v1/api/_test/delta'
  const api = host + '/signalk/v1/api'

  return startServerP(port, false, {
    settings: {
      interfaces: {
        plugins: true
      }
    }
  }).then(server => ({
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
  }))
}

const deltaHasPathValue = (delta: any, path: string, value: any) =>
  delta.updates[0].values
    .find((x: any) => x.path === path)
    .value.should.deep.equal(value)
