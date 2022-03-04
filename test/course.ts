import { strict as assert } from 'assert'
import chai from 'chai'
import resourcesOpenApi from '../src/api/resources/openApi.json'
import { deltaHasPathValue, startServer } from './ts-servertestutilities'
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

  it('can set course destination as waypoint with arrivalcircle and then clear destination', async function() {
    const {
      createWsPromiser,
      post,
      selfDelete,
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
      response.status.should.equal(201)
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

    await selfDelete('navigation/course/destination').then(response =>
      response.status.should.equal(200)
    )
    const destinationClearedDelta = JSON.parse(await wsPromiser.nthMessage(3))
    deltaHasPathValue(destinationClearedDelta, 'navigation.course', {
      nextPoint: {
        href: null,
        type: null,
        position: null,
        arrivalCircle: 99
      },
      previousPoint: {
        href: null,
        type: null,
        position: null
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
          type: null,
          position: null,
          arrivalCircle: 99
        },
        previousPoint: {
          href: null,
          type: null,
          position: null
        }
      })
    })

    stop()
  })

  it('can activate route and manipulate it', async function() {
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

    const points =
      resourcesOpenApi.components.schemas.SignalKPositionArray.example

    const { id } = await post('/resources/routes', {
      points
    }).then(response => {
      response.status.should.equal(201)
      return response.json()
    })
    id.length.should.equal(
      'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length
    )
    const href = `/resources/routes/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/activeRoute', {
      href
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    delete courseDelta.updates[0].values[0].value.activeRoute.startTime
    deltaHasPathValue(courseDelta, 'navigation.course', {
      activeRoute: {
        href,
        pointIndex: 0,
        pointTotal: 3,
        reverse: false
      },
      nextPoint: {
        href: null,
        type: 'RoutePoint',
        position: points[0],
        arrivalCircle: 0
      },
      previousPoint: {
        href: null,
        type: 'VesselPosition',
        position: vesselPosition
      }
    })
    await selfGetJson('navigation/course').then(data => {
      delete data.activeRoute.startTime
      data.should.deep.equal({
        activeRoute: {
          href,
          pointIndex: 0,
          pointTotal: 3,
          reverse: false
        },
        nextPoint: {
          href: null,
          position: points[0],
          type: 'RoutePoint',
          arrivalCircle: 0
        },
        previousPoint: {
          href: null,
          type: 'VesselPosition',
          position: vesselPosition
        }
      })
    })

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(1)
    )

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 100
    }).then(response => response.status.should.equal(400))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(1)
    )

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: -1
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(0)
    )

    await selfPut('navigation/course/activeRoute/pointIndex', {
      value: 2
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(2)
    )

    await selfPut('navigation/course/activeRoute', {
      href,
      reverse: true
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.nextPoint.position.latitude.should.equal(
        points[points.length - 1].latitude
      )
    )
    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data => {
      data.nextPoint.position.latitude.should.equal(points[1].latitude)
      data.previousPoint.position.latitude.should.equal(
        points[points.length - 1].latitude
      )
    })

    stop()
  })

  it('can set arrivalCircle', async function() {
    const { createWsPromiser, selfGetJson, selfPut, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    await selfPut('navigation/course/arrivalCircle', {
      value: 98
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))

    deltaHasPathValue(courseDelta, 'navigation.course', {
      nextPoint: {
        href: null,
        position: null,
        type: null,
        arrivalCircle: 98
      },
      previousPoint: {
        href: null,
        position: null,
        type: null
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
          type: null,
          position: null,
          arrivalCircle: 98
        },
        previousPoint: {
          href: null,
          type: null,
          position: null
        }
      })
    })
    stop()
  })
})
