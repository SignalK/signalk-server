import { strict as assert } from 'assert'
import chai from 'chai'
import resourcesOpenApi from '../src/api/resources/openApi.json'
import { DATETIME_REGEX, deltaHasPathValue, startServer } from './ts-servertestutilities'
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

    const expectedPathValues = [
      {
        path: 'navigation.course.activeRoute.href',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointIndex',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointTotal',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.reverse',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.href',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.position',
        value: {
          latitude: -35.5,
          longitude: 138.7
        }
      },
      {
        path: 'navigation.course.nextPoint.type',
        value: 'Location'
      },
      {
        path: 'navigation.course.nextPoint.arrivalCircle',
        value: 0
      },
      {
        path: 'navigation.course.previousPoint.position',
        value: {
          latitude: -35.45,
          longitude: 138
        }
      },
      {
        path: 'navigation.course.previousPoint.type',
        value: 'VesselPosition'
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(courseDelta, path, value)
    )

    await selfGetJson('navigation/course').then(data => {
      data.startTime.should.match(DATETIME_REGEX)
      delete data.startTime
      data.should.deep.equal({
        targetArrivalTime: null,
        activeRoute: {
          href: null,
          name: null,
          pointIndex: null,
          pointTotal: null,
          reverse: null,
          waypoints: null
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
    deltaHasPathValue(
      courseDelta,
      'navigation.course.nextPoint.position',
      validDestinationPosition
    )

    await selfPut('navigation/course/destination', {
      href:
        '/resources/waypoints/07894aba-f151-4099-aa4f-5e5773734b95'
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

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    let expectedPathValues = [
      { path: 'navigation.course.activeRoute.href', value: null },
      { path: 'navigation.course.activeRoute.pointIndex', value: null },
      { path: 'navigation.course.activeRoute.pointTotal', value: null },
      { path: 'navigation.course.activeRoute.reverse', value: null },
      {
        path: 'navigation.course.nextPoint.href',
        value: href
      },
      {
        path: 'navigation.course.nextPoint.position',
        value: { latitude: 60.1699, longitude: 24.9384 }
      },
      { path: 'navigation.course.nextPoint.type', value: 'Waypoint' },
      { path: 'navigation.course.nextPoint.arrivalCircle', value: 99 },
      {
        path: 'navigation.course.previousPoint.position',
        value: { latitude: -35.45, longitude: 138 }
      },
      {
        path: 'navigation.course.previousPoint.type',
        value: 'VesselPosition'
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(courseDelta, path, value)
    )

    const pathValue = courseDelta.updates[0].values.find((x: any) => x.path === 'navigation.course.startTime')
    pathValue.value.should.match(DATETIME_REGEX)


    await selfGetJson('navigation/course').then(data => {
      data.startTime.should.match(DATETIME_REGEX)
      delete data.startTime
      data.should.deep.equal({
        targetArrivalTime: null,
        activeRoute: {
          href: null,
          name: null,
          pointIndex: null,
          pointTotal: null,
          reverse: null,
          waypoints: null
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
    expectedPathValues = [
      {
        path: 'navigation.course.activeRoute.href',
        value: null
      },
      {
        path: 'navigation.course.startTime',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointIndex',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointTotal',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.reverse',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.href',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.position',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.type',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.arrivalCircle',
        value: 99
      },
      {
        path: 'navigation.course.previousPoint.position',
        value: null
      },
      {
        path: 'navigation.course.previousPoint.type',
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
        activeRoute: {
          href: null,
          name: null,
          pointIndex: null,
          pointTotal: null,
          reverse: null,
          waypoints: null
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

    const points = {
      feature: { 
        type: "Feature", 
        geometry: {
          type: "LineString",
          coordinates: [[3.3452,65.4567],[3.3352, 65.5567],[3.3261,65.5777]]
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

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    const expectedPathValues = [
      {
        path: 'navigation.course.activeRoute.href',
        value: href
      },
      {
        path: 'navigation.course.activeRoute.pointIndex',
        value: 0
      },
      {
        path: 'navigation.course.activeRoute.pointTotal',
        value: 3
      },
      {
        path: 'navigation.course.activeRoute.reverse',
        value: false
      },
      {
        path: 'navigation.course.nextPoint.href',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.position',
        value: {
          latitude: 65.4567,
          longitude: 3.3452
        }
      },
      {
        path: 'navigation.course.nextPoint.type',
        value: 'RoutePoint'
      },
      {
        path: 'navigation.course.nextPoint.arrivalCircle',
        value: 0
      },
      {
        path: 'navigation.course.previousPoint.position',
        value: {
          latitude: -35.45,
          longitude: 138
        }
      },
      {
        path: 'navigation.course.previousPoint.type',
        value: 'VesselPosition'
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(courseDelta, path, value)
    )
    courseDelta.updates[0].values.find(
      (x: any) => x.path === 'navigation.course.startTime'
    ).should.not.be.undefined

    await selfGetJson('navigation/course').then(data => {
      delete data.startTime
      delete data.targetArrivalTime
      delete data.activeRoute.name
      delete data.activeRoute.waypoints
      data.should.deep.equal({
        activeRoute: {
          href,
          pointIndex: 0,
          pointTotal: 3,
          reverse: false
        },
        nextPoint: {
          href: null,
          position: {
            longitude: points.feature.geometry.coordinates[0],
            latitude: points.feature.geometry.coordinates[1]
          },
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

  it('can set arrivalCircle', async function() {
    const { createWsPromiser, selfGetJson, selfPut, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    await selfPut('navigation/course/arrivalCircle', {
      value: 98
    }).then(response => response.status.should.equal(200))

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))

    const expectedPathValues = [
      {
        path: 'navigation.course.activeRoute.href',
        value: null
      },
      {
        path: 'navigation.course.startTime',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointIndex',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.pointTotal',
        value: null
      },
      {
        path: 'navigation.course.activeRoute.reverse',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.href',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.position',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.type',
        value: null
      },
      {
        path: 'navigation.course.nextPoint.arrivalCircle',
        value: 98
      },
      {
        path: 'navigation.course.previousPoint.position',
        value: null
      },
      {
        path: 'navigation.course.previousPoint.type',
        value: null
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(courseDelta, path, value)
    )

    await selfGetJson('navigation/course').then(data => {
      data.should.deep.equal({
        startTime: null,
        targetArrivalTime: null,
        activeRoute: {
          href: null,
          name: null,
          pointIndex: null,
          pointTotal: null,
          reverse: null,
          waypoints: null
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
