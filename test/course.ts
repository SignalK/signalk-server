import { strict as assert } from 'assert'
import chai from 'chai'
import { DATETIME_REGEX, deltaHasPathValue, startServer } from './ts-servertestutilities.js'
chai.should()

describe('Course Api', () => {
  it('can set course destination as position', async function () {
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

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(4))
    v2courseDelta.context.should.equal(self)

    const expectedPathValues = [
      {
        path: 'navigation.course.activeRoute',
        value: null
      },
      {
        path: 'navigation.course.nextPoint',
        value: {
          position: {
            latitude: -35.5,
            longitude: 138.7
          },
          type: 'Location'
        }
      },
      {
        path: 'navigation.course.previousPoint',
        value: {
          position: {
            latitude: -35.45,
            longitude: 138
          }, type: 'VesselPosition'
        }
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )

    await selfGetJson('navigation/course').then(data => {
      data.startTime.should.match(DATETIME_REGEX)
      delete data.startTime
      data.should.deep.equal({
        targetArrivalTime: null,
        arrivalCircle: 0,
        activeRoute: null,
        nextPoint: {
          type: 'Location',
          position: { latitude: -35.5, longitude: 138.7 }
        },
        previousPoint: {
          type: 'VesselPosition',
          position: { latitude: -35.45, longitude: 138 }
        }
      })
    })
    await stop()
  })

  it('can not set course destination as nonexistent waypoint or bad payload', async function () {
    const { createWsPromiser, selfPut, sendDelta, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1) // hello

    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })
    await wsPromiser.nthMessage(2) // position

    const validDestinationPosition = { latitude: -35.5, longitude: 138.7 }

    await selfPut('navigation/course/destination', {
      position: validDestinationPosition
    }).then(response => response.status.should.equal(200))

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(4))
    deltaHasPathValue(
      v2courseDelta,
      'navigation.course.nextPoint',
      { position: validDestinationPosition, type: 'Location' }
    )

    await selfPut('navigation/course/destination', {
      href:
        '/resources/waypoints/07894aba-f151-4099-aa4f-5e5773734b95'
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(5))

    await selfPut('navigation/course/destination', {
      hrefff: 'dummy data'
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(5))

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5 }
    }).then(response => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(5))

    await stop()
  })

  it('can set course destination as waypoint with arrivalcircle and then clear destination', async function () {
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
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [24.9384, 60.1699]
        }
      }
    }
    const { id } = await post('/resources/waypoints', destination)
      .then(response => {
        response.status.should.equal(201)
        return response.json()
      })
    id.length.should.equal(
      'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length
    )
    const href = `/resources/waypoints/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/destination', {
      href,
      arrivalCircle: 99
    }).then(response => response.status.should.equal(200))

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(3))
    v2courseDelta.context.should.equal(self)

    let expectedPathValues = [
      { path: 'navigation.course.activeRoute', value: null },
      {
        path: 'navigation.course.nextPoint',
        value: {
          href: `/resources/waypoints/${id}`,
          position: { latitude: 60.1699, longitude: 24.9384 },
          type: 'Waypoint',

        }
      },
      {
        path: 'navigation.course.previousPoint',
        value: {
          position: { latitude: -35.45, longitude: 138 },
          type: 'VesselPosition'
        }
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathValue = v2courseDelta.updates[0].values.find((x: any) => x.path === 'navigation.course.startTime')
    pathValue.value.should.match(DATETIME_REGEX)


    await selfGetJson('navigation/course').then(data => {
      data.startTime.should.match(DATETIME_REGEX)
      delete data.startTime
      data.should.deep.equal({
        arrivalCircle: 99,
        targetArrivalTime: null,
        activeRoute: null,
        nextPoint: {
          href,
          type: 'Waypoint',
          position: {
            longitude: destination.feature.geometry.coordinates[0],
            latitude: destination.feature.geometry.coordinates[1]
          }
        },
        previousPoint: {
          type: 'VesselPosition',
          position: vesselPosition
        }
      })
    })

    await selfDelete('navigation/course').then(response =>
      response.status.should.equal(200)
    )
    const destinationClearedDelta = JSON.parse(await wsPromiser.nthMessage(5))
    expectedPathValues = [
      {
        path: 'navigation.course.activeRoute',
        value: null
      },
      {
        path: 'navigation.course.startTime',
        value: null
      },
      {
        path: 'navigation.course.nextPoint',
        value: null
      },
      {
        path: 'navigation.course.previousPoint',
        value: null
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(destinationClearedDelta, path, value)
    )

    await selfGetJson('navigation/course').then(data => {
      data.should.deep.equal({
        startTime: null,
        targetArrivalTime: null,
        activeRoute: null,
        arrivalCircle: 99,
        nextPoint: null,
        previousPoint: null
      })
    })

    stop()
  })

  it('can activate route and manipulate it', async function () {
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

    const points = {
      feature: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[3.3452, 65.4567], [3.3352, 65.5567], [3.3261, 65.5777]]
        }
      }
    }

    const { id } = await post('/resources/routes', points)
      .then(response => {
        response.status.should.equal(201)
        return response.json()
      })
    id.length.should.equal(
      'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length
    )
    const href = `/resources/routes/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/activeRoute', {
      href
    }).then(response => response.status.should.equal(200))

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(3))
    v2courseDelta.context.should.equal(self)

    const expectedPathValues = [
      {
        path: 'navigation.course.activeRoute',
        value: {
          href,
          pointIndex: 0,
          pointTotal: 3,
          reverse: false
        }
      },
      {
        path: 'navigation.course.nextPoint',
        value: {
          position: {
            latitude: 65.4567,
            longitude: 3.3452
          },
          type: 'RoutePoint'
        }
      },
      {
        path: 'navigation.course.arrivalCircle',
        value: 0
      },
      {
        path: 'navigation.course.previousPoint',
        value: {
          position: {
            latitude: -35.45,
            longitude: 138
          },
          type: 'VesselPosition'
        }
      },
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )
    v2courseDelta.updates[0].values.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x: any) => x.path === 'navigation.course.startTime'
    ).should.be.an('object')

    await selfGetJson('navigation/course').then(data => {
      delete data.startTime
      delete data.targetArrivalTime
      delete data.activeRoute.name
      data.should.deep.equal({
        arrivalCircle: 0,
        activeRoute: {
          href,
          pointIndex: 0,
          pointTotal: 3,
          reverse: false
        },
        nextPoint: {
          position: {
            longitude: points.feature.geometry.coordinates[0][0],
            latitude: points.feature.geometry.coordinates[0][1]
          },
          type: 'RoutePoint'
        },
        previousPoint: {
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

    //setting pointIndex beyond route length sets it to last point's index
    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 100
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(2)
    )

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: -1
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data =>
      data.activeRoute.pointIndex.should.equal(1)
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
        points.feature.geometry.coordinates[points.feature.geometry.coordinates.length - 1][1]
      )
    )
    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then(response => response.status.should.equal(200))
    await selfGetJson('navigation/course').then(data => {
      data.nextPoint.position.latitude.should.equal(points.feature.geometry.coordinates[1][1])
      data.previousPoint.position.latitude.should.equal(
        points.feature.geometry.coordinates[points.feature.geometry.coordinates.length - 1][1]
      )
    })

    stop()
  })

  it('can set arrivalCircle', async function () {
    const { createWsPromiser, selfGetJson, selfPut, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    await selfPut('navigation/course/arrivalCircle', {
      value: 98
    }).then(response => response.status.should.equal(200))

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(3))

    const expectedPathValues = [
      {
        path: 'navigation.course.arrivalCircle',
        value: 98
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )

    await selfGetJson('navigation/course').then(data => {
      data.should.deep.equal({
        startTime: null,
        targetArrivalTime: null,
        arrivalCircle: 98,
        activeRoute: null,
        nextPoint: null,
        previousPoint: null
      })
    })
    stop()
  })
})
