import { strict as assert } from 'assert'
import chai, { expect } from 'chai'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import {
  DATETIME_REGEX,
  deltaHasPathValue,
  freeport,
  startServer
} from './ts-servertestutilities'
import { serverTestConfigDirectory, startServerP } from './servertestutilities'
import { CourseInfo, Position } from '@signalk/server-api'
import { crossTrackDistance } from '../src/api/course/xteGeometry'
chai.should()

describe('Course Api', () => {
  it('can set course destination as position', async function () {
    const { createWsPromiser, selfGetJson, selfPut, sendDelta, stop } =
      await startServer()
    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    sendDelta('navigation.position', { latitude: -35.45, longitude: 138.0 })
    await wsPromiser.nthMessage(2)

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5, longitude: 138.7 }
    }).then((response) => response.status.should.equal(200))

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
          type: 'Location',
          name: 'DP'
        }
      },
      {
        path: 'navigation.course.previousPoint',
        value: {
          position: {
            latitude: -35.45,
            longitude: 138
          },
          type: 'VesselPosition',
          name: 'VP'
        }
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )

    const data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.startTime).to.match(DATETIME_REGEX)
    expect(data).to.deep.equal({
      startTime: data.startTime,
      targetArrivalTime: null,
      arrivalCircle: 0,
      activeRoute: null,
      nextPoint: {
        type: 'Location',
        position: { latitude: -35.5, longitude: 138.7 },
        name: 'DP'
      },
      previousPoint: {
        type: 'VesselPosition',
        position: { latitude: -35.45, longitude: 138 },
        name: 'VP'
      }
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
    }).then((response) => response.status.should.equal(200))

    const v2courseDelta = JSON.parse(await wsPromiser.nthMessage(4))
    deltaHasPathValue(v2courseDelta, 'navigation.course.nextPoint', {
      position: validDestinationPosition,
      type: 'Location',
      name: 'DP'
    })

    await selfPut('navigation/course/destination', {
      href: '/resources/waypoints/07894aba-f151-4099-aa4f-5e5773734b95'
    }).then((response) => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(5))

    await selfPut('navigation/course/destination', {
      hrefff: 'dummy data'
    }).then((response) => response.status.should.equal(400))
    await assert.rejects(wsPromiser.nthMessage(5))

    await selfPut('navigation/course/destination', {
      position: { latitude: -35.5 }
    }).then((response) => response.status.should.equal(400))
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
    const response = await post('/resources/waypoints', destination)
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    id.length.should.equal('ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length)
    const href = `/resources/waypoints/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/destination', {
      href,
      arrivalCircle: 99
    }).then((response) => response.status.should.equal(200))

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
          name: 'WP1'
        }
      },
      {
        path: 'navigation.course.previousPoint',
        value: {
          position: { latitude: -35.45, longitude: 138 },
          type: 'VesselPosition',
          name: 'VP'
        }
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )

    const pathValue = v2courseDelta.updates[0].values.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x: any) => x.path === 'navigation.course.startTime'
    )
    pathValue.value.should.match(DATETIME_REGEX)

    let data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.startTime).to.match(DATETIME_REGEX)
    expect(data).to.deep.equal({
      startTime: data.startTime,
      arrivalCircle: 99,
      targetArrivalTime: null,
      activeRoute: null,
      nextPoint: {
        href,
        type: 'Waypoint',
        position: {
          longitude: destination.feature.geometry.coordinates[0],
          latitude: destination.feature.geometry.coordinates[1]
        },
        name: 'WP1'
      },
      previousPoint: {
        type: 'VesselPosition',
        position: vesselPosition,
        name: 'VP'
      }
    })

    await selfDelete('navigation/course').then((response) =>
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

    data = (await selfGetJson('navigation/course')) as CourseInfo
    data.should.deep.equal({
      startTime: null,
      targetArrivalTime: null,
      activeRoute: null,
      arrivalCircle: 99,
      nextPoint: null,
      previousPoint: null
    })

    stop()
  })

  it('can activate route and manipulate it', async function () {
    const { createWsPromiser, post, selfGetJson, selfPut, sendDelta, stop } =
      await startServer()
    const vesselPosition = { latitude: -35.45, longitude: 138.0 }
    sendDelta('navigation.position', vesselPosition)

    const points = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.3452, 65.4567],
            [3.3352, 65.5567],
            [3.3261, 65.5777]
          ]
        }
      }
    }

    const response = await post('/resources/routes', points)
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    id.length.should.equal('ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length)
    const href = `/resources/routes/${id}`

    const wsPromiser = createWsPromiser()
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    await selfPut('navigation/course/activeRoute', {
      href
    }).then((response) => response.status.should.equal(200))

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
          type: 'RoutePoint',
          name: ''
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
          type: 'VesselPosition',
          name: 'VP'
        }
      }
    ]
    expectedPathValues.forEach(({ path, value }) =>
      deltaHasPathValue(v2courseDelta, path, value)
    )
    v2courseDelta.updates[0].values
      .find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (x: any) => x.path === 'navigation.course.startTime'
      )
      .should.be.an('object')

    let data = (await selfGetJson('navigation/course')) as CourseInfo

    data.should.deep.equal({
      startTime: data.startTime,
      targetArrivalTime: data.targetArrivalTime,
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
        type: 'RoutePoint',
        name: ''
      },
      previousPoint: {
        type: 'VesselPosition',
        position: vesselPosition,
        name: 'VP'
      }
    })

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then((response) => response.status.should.equal(200))
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.activeRoute?.pointIndex).to.equal(1)

    //setting pointIndex beyond route length sets it to last point's index
    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 100
    }).then((response) => response.status.should.equal(200))
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.activeRoute?.pointIndex).to.equal(2)

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: -1
    }).then((response) => response.status.should.equal(200))
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.activeRoute?.pointIndex).to.equal(1)

    await selfPut('navigation/course/activeRoute/pointIndex', {
      value: 2
    }).then((response) => response.status.should.equal(200))
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.activeRoute?.pointIndex).to.equal(2)

    await selfPut('navigation/course/activeRoute', {
      href,
      reverse: true
    }).then((response) => response.status.should.equal(200))
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.nextPoint?.position?.latitude).to.equal(
      points.feature.geometry.coordinates[
        points.feature.geometry.coordinates.length - 1
      ][1]
    )

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then((response) => response.status.should.equal(200))

    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.nextPoint?.position?.latitude).to.equal(
      points.feature.geometry.coordinates[1][1]
    )
    expect(data.previousPoint?.position?.latitude).to.equal(
      points.feature.geometry.coordinates[
        points.feature.geometry.coordinates.length - 1
      ][1]
    )

    stop()
  })

  it('updates previousPoint when active route point is moved', async function () {
    const {
      createWsPromiser,
      post,
      put,
      selfGetJson,
      selfPut,
      sendDelta,
      stop
    } = await startServer()
    const vesselPosition = { latitude: -35.45, longitude: 138.0 }
    sendDelta('navigation.position', vesselPosition)

    const points = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.3452, 65.4567],
            [3.3352, 65.5567],
            [3.3261, 65.5777]
          ]
        }
      }
    }

    const response = await post('/resources/routes', points)
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    const href = `/resources/routes/${id}`

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    // activate route and advance to pointIndex 1
    await selfPut('navigation/course/activeRoute', {
      href
    }).then((r) => r.status.should.equal(200))

    await selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    }).then((r) => r.status.should.equal(200))

    let data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.activeRoute?.pointIndex).to.equal(1)
    expect(data.previousPoint?.type).to.equal('RoutePoint')
    expect(data.previousPoint?.position?.latitude).to.equal(65.4567)
    expect(data.previousPoint?.position?.longitude).to.equal(3.3452)

    // move the previous route point (index 0) to new coordinates
    const updatedPoints = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.0, 60.0],
            [3.3352, 65.5567],
            [3.3261, 65.5777]
          ]
        }
      }
    }
    await put(`/resources/routes/${id}`, updatedPoints).then((r) =>
      r.status.should.equal(200)
    )

    // wait for subscription to process the route update (period: 500ms)
    await new Promise((resolve) => setTimeout(resolve, 600))

    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint?.position?.latitude).to.equal(60.0)
    expect(data.previousPoint?.position?.longitude).to.equal(10.0)

    stop()
  })

  it('clears an external course when navigation updates stop', async function () {
    this.timeout(30000)

    const { server, selfGetJson, sendDelta, stop } = await startServer()
    const vesselPosition = { latitude: 43.02, longitude: 7.84 }
    await sendDelta('navigation.position', vesselPosition)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courseApi = server.app.courseApi as any
    const cmdSource = {
      type: 'NMEA0183',
      $source: 'nmea.external',
      msg: 'RMB',
      path: 'navigation.courseRhumbline.nextPoint.position'
    }

    await courseApi.parseStreamValue(cmdSource, {
      latitude: 43.03,
      longitude: 7.94
    })

    let data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.nextPoint?.position).to.deep.equal({
      latitude: 43.03,
      longitude: 7.94
    })

    courseApi.externalNavLastUpdate = Date.now() - 16000
    courseApi.scheduleExternalNavigationTimeout()
    await new Promise((resolve) => setTimeout(resolve, 20))

    data = (await selfGetJson('navigation/course')) as CourseInfo
    data.should.deep.equal({
      startTime: null,
      targetArrivalTime: null,
      activeRoute: null,
      arrivalCircle: 0,
      nextPoint: null,
      previousPoint: null
    })

    stop()
  })

  it('rebases external NMEA0183 previousPoint using Signal K XTE sign', async function () {
    const { server, selfGetJson, sendDelta, stop } = await startServer()
    const vesselPosition = { latitude: 43.02, longitude: 7.84 }
    const destination = {
      latitude: 43.03,
      longitude: 7.94
    }
    const externalXte = 50
    await sendDelta('navigation.position', vesselPosition)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courseApi = server.app.courseApi as any
    const source = {
      type: 'NMEA0183',
      $source: 'nmea.external',
      msg: 'RMB',
      path: 'navigation.courseRhumbline.nextPoint.position'
    }

    await courseApi.parseStreamValue(source, destination)

    courseApi.maybeRebaseExternalPreviousPoint(externalXte)
    courseApi.maybeRebaseExternalPreviousPoint(externalXte)
    courseApi.maybeRebaseExternalPreviousPoint(externalXte)

    const data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint?.type).to.equal('VesselPosition')
    expect(
      crossTrackDistance(
        vesselPosition,
        data.previousPoint?.position as Position,
        destination
      )
    ).to.be.closeTo(externalXte, 0.1)
    expect(data.previousPoint?.position).to.not.deep.equal(vesselPosition)

    stop()
  })

  it('uses external previousPoint position when provided', async function () {
    const { server, selfGetJson, sendDelta, stop } = await startServer()
    const vesselPosition = { latitude: 43.02, longitude: 7.84 }
    const previousPoint = { latitude: 43.01, longitude: 7.75 }
    const destination = {
      latitude: 43.03,
      longitude: 7.94
    }
    await sendDelta('navigation.position', vesselPosition)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courseApi = server.app.courseApi as any
    const source = {
      type: 'NMEA2000',
      $source: 'n2k.external',
      msg: '129285',
      path: 'navigation.courseRhumbline.nextPoint.position'
    }

    await courseApi.parseStreamValue(source, destination)
    await courseApi.parseStreamValue(
      {
        ...source,
        path: 'navigation.courseRhumbline.previousPoint.position'
      },
      previousPoint
    )

    let data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint?.type).to.equal('RoutePoint')
    expect(data.previousPoint?.position).to.deep.equal(previousPoint)

    const externalXte = crossTrackDistance(
      vesselPosition,
      previousPoint,
      destination
    )
    if (typeof externalXte !== 'number') {
      throw new Error('Expected a finite external XTE')
    }
    courseApi.maybeRebaseExternalPreviousPoint(externalXte)
    courseApi.maybeRebaseExternalPreviousPoint(externalXte)
    courseApi.maybeRebaseExternalPreviousPoint(externalXte)

    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint?.position).to.deep.equal(previousPoint)

    stop()
  })

  it('can set arrivalCircle', async function () {
    const { createWsPromiser, selfGetJson, selfPut, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    await selfPut('navigation/course/arrivalCircle', {
      value: 98
    }).then((response) => response.status.should.equal(200))

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

    const data = (await selfGetJson('navigation/course')) as CourseInfo
    data.should.to.deep.equal({
      startTime: null,
      targetArrivalTime: null,
      arrivalCircle: 98,
      activeRoute: null,
      nextPoint: null,
      previousPoint: null
    })

    stop()
  })

  it('can restart the course from the vessel position', async function () {
    const { server, selfGetJson, selfPut, selfDelete, sendDelta, stop } =
      await startServer()
    const destination = { latitude: -35.5, longitude: 138.7 }

    await sendDelta('navigation.position', {
      latitude: -35.45,
      longitude: 138.0
    })
    await selfPut('navigation/course/destination', {
      position: destination
    }).then((response) => response.status.should.equal(200))

    await sendDelta('navigation.position', {
      latitude: -35.46,
      longitude: 138.1
    })
    await selfPut('navigation/course/restart', {}).then((response) =>
      response.status.should.equal(200)
    )
    let data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint).to.deep.equal({
      position: { latitude: -35.46, longitude: 138.1 },
      type: 'VesselPosition'
    })
    expect(data.nextPoint?.position).to.deep.equal(destination)

    await sendDelta('navigation.position', {
      latitude: -35.47,
      longitude: 138.2
    })
    await server.app.courseApi.restartCourse()
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint).to.deep.equal({
      position: { latitude: -35.47, longitude: 138.2 },
      type: 'VesselPosition'
    })
    expect(data.nextPoint?.position).to.deep.equal(destination)

    await sendDelta('navigation.position', { latitude: 95, longitude: 138.2 })
    await selfPut('navigation/course/restart', {}).then((response) =>
      response.status.should.equal(400)
    )
    data = (await selfGetJson('navigation/course')) as CourseInfo
    expect(data.previousPoint?.position).to.deep.equal({
      latitude: -35.47,
      longitude: 138.2
    })

    await selfDelete('navigation/course').then((response) =>
      response.status.should.equal(200)
    )
    await selfPut('navigation/course/restart', {}).then((response) =>
      response.status.should.equal(400)
    )
    await server.app.courseApi.restartCourse().then(
      () => assert.fail('restartCourse without a destination resolved'),
      (err: Error) => err.message.should.equal('No active destination!')
    )

    stop()
  })

  it('restores a destination set by position after a restart', async function () {
    const first = await startServer()
    await first.sendDelta('navigation.position', {
      latitude: -35.45,
      longitude: 138.0
    })
    await first
      .selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })
      .then((response) => response.status.should.equal(200))
    await persistedCourse((course) => course?.nextPoint?.position)
    await first.stop()

    const course = await courseAfterRestart()
    expect(course.nextPoint?.position).to.deep.equal({
      latitude: -35.5,
      longitude: 138.7
    })
    expect(course.previousPoint?.position).to.deep.equal({
      latitude: -35.45,
      longitude: 138.0
    })
  })

  it('keeps a destination cleared by a plugin cleared after a restart', async function () {
    const first = await startServer()
    await first.sendDelta('navigation.position', {
      latitude: -35.45,
      longitude: 138.0
    })
    await first
      .selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })
      .then((response) => response.status.should.equal(200))
    await persistedCourse((course) => course?.nextPoint?.position)

    // What a plugin's app.clearDestination() calls.
    await first.server.app.courseApi.clearDestination()
    await persistedCourse((course) => course?.nextPoint === null)
    await first.stop()

    const course = await courseAfterRestart()
    expect(course.nextPoint).to.equal(null)
  })

  it('drops a persisted destination with an invalid position', async function () {
    const first = await startServer()
    await first.stop()
    await mkdir(path.dirname(courseFile()), { recursive: true })
    await writeFile(
      courseFile(),
      JSON.stringify({
        startTime: new Date().toISOString(),
        targetArrivalTime: null,
        arrivalCircle: 0,
        activeRoute: null,
        nextPoint: {
          position: { latitude: 95, longitude: 138.7 },
          type: 'Location'
        },
        previousPoint: null
      })
    )

    const course = await courseAfterRestart()
    expect(course.nextPoint).to.equal(null)
  })
})

const courseFile = () =>
  path.join(
    serverTestConfigDirectory(),
    'serverState',
    'course',
    'settings.json'
  )

// The course is written to disk after the request that changed it has been
// answered; wait for it before stopping the server.
async function persistedCourse(
  done: (course: CourseInfo | undefined) => unknown
): Promise<void> {
  const deadline = Date.now() + 5000
  for (;;) {
    const course = await readFile(courseFile(), 'utf8')
      .then((text) => JSON.parse(text) as CourseInfo)
      .catch(() => undefined)
    if (done(course)) return
    if (Date.now() > deadline) throw new Error('course was not persisted')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

// Starts a server on the existing configuration directory, as a restart does,
// and returns the course it serves once restored. The Course API restores the
// persisted course after the server has started and subscribes to external
// navigation data only once that is done, so its first subscription marks the
// restore as finished, whether the course was kept or dropped.
async function courseAfterRestart(): Promise<CourseInfo> {
  const port = await freeport()
  const server = await startServerP(port, false, {
    settings: { interfaces: { plugins: true } }
  })
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courseApi = server.app.courseApi as any
    const deadline = Date.now() + 5000
    while (courseApi.unsubscribes.length === 0) {
      if (Date.now() > deadline) throw new Error('course was not restored')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const response = await fetch(
      `http://localhost:${port}/signalk/v2/api/vessels/self/navigation/course`
    )
    return (await response.json()) as CourseInfo
  } finally {
    await server.stop()
  }
}

describe('Course Api concurrent requests', () => {
  const routeBody = (coordinates: number[][]) => ({
    feature: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates }
    }
  })
  const ROUTE_A = [
    [3.3452, 65.4567],
    [3.3352, 65.5567],
    [3.3261, 65.5777]
  ]
  const ROUTE_B = [
    [4.1, 66.1],
    [4.2, 66.2],
    [4.3, 66.3]
  ]

  type Started = Awaited<ReturnType<typeof startServer>>

  const create = async (started: Started, type: string, body: object) => {
    const response = await started.post(`/resources/${type}`, body)
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    return id
  }

  // Holds the next fetch of resource `id` until released, and tells when
  // that fetch has started and when it has been answered.
  const holdFetch = (started: Started, id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resources = started.server.app.resourcesApi as any
    const getResource = resources.getResource.bind(resources)
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let reached!: () => void
    const reachedFetch = new Promise<void>((resolve) => {
      reached = resolve
    })
    let fetched: Promise<unknown> | undefined
    resources.getResource = (type: string, resId: string) => {
      if (fetched || resId !== id) {
        return getResource(type, resId)
      }
      reached()
      fetched = released.then(() => getResource(type, resId))
      return fetched
    }
    return {
      reached: reachedFetch,
      release,
      // Settles once the held fetch is answered and the microtasks its
      // caller resumes with have run.
      answered: () =>
        fetched?.then(() => new Promise((resolve) => setImmediate(resolve)))
    }
  }

  const VESSEL_POSITION = { latitude: -35.45, longitude: 138.0 }
  const INGEST_TIMEOUT_MS = 2000

  // Starts a server that knows the vessel position, which the course needs
  // for its previous point. The test delta endpoint answers before the
  // delta is ingested, so wait for the position to land.
  const start = async () => {
    const started = await startServer()
    await started.sendDelta('navigation.position', VESSEL_POSITION)
    const deadline = Date.now() + INGEST_TIMEOUT_MS
    while (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (started.server.app.signalk as any).self?.navigation?.position?.value
        ?.latitude !== VESSEL_POSITION.latitude
    ) {
      if (Date.now() > deadline) {
        await started.stop()
        throw new Error('vessel position was not ingested')
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return started
  }

  const course = (started: Started) =>
    started.selfGetJson('navigation/course') as Promise<CourseInfo>

  it('keeps a route selected while an earlier activation was loading', async function () {
    const started = await start()
    const a = await create(started, 'routes', routeBody(ROUTE_A))
    const b = await create(started, 'routes', routeBody(ROUTE_B))
    const hold = holdFetch(started, a)

    const first = started.selfPut('navigation/course/activeRoute', {
      href: `/resources/routes/${a}`
    })
    await hold.reached
    const second = await started.selfPut('navigation/course/activeRoute', {
      href: `/resources/routes/${b}`
    })
    hold.release()

    second.status.should.equal(200)
    ;(await first).status.should.equal(400)
    expect((await course(started)).activeRoute?.href).to.equal(
      `/resources/routes/${b}`
    )
    await started.stop()
  })

  it('keeps a destination set while a waypoint was loading', async function () {
    const started = await start()
    const w = await create(started, 'waypoints', {
      feature: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [24.9384, 60.1699] }
      }
    })
    const hold = holdFetch(started, w)

    const first = started.selfPut('navigation/course/destination', {
      href: `/resources/waypoints/${w}`
    })
    await hold.reached
    const second = await started.selfPut('navigation/course/destination', {
      position: { latitude: -35.5, longitude: 138.7 }
    })
    hold.release()

    second.status.should.equal(200)
    ;(await first).status.should.equal(400)
    expect((await course(started)).nextPoint?.position).to.deep.equal({
      latitude: -35.5,
      longitude: 138.7
    })
    await started.stop()
  })

  it('does not move to the next point of a route replaced while it loaded', async function () {
    const started = await start()
    const a = await create(started, 'routes', routeBody(ROUTE_A))
    const b = await create(started, 'routes', routeBody(ROUTE_B))
    await started
      .selfPut('navigation/course/activeRoute', {
        href: `/resources/routes/${a}`
      })
      .then((response) => response.status.should.equal(200))
    const hold = holdFetch(started, a)

    const next = started.selfPut('navigation/course/activeRoute/nextPoint', {
      value: 1
    })
    await hold.reached
    await started
      .selfPut('navigation/course/activeRoute', {
        href: `/resources/routes/${b}`
      })
      .then((response) => response.status.should.equal(200))
    hold.release()

    ;(await next).status.should.equal(400)
    const now = await course(started)
    expect(now.activeRoute?.href).to.equal(`/resources/routes/${b}`)
    expect(now.activeRoute?.pointIndex).to.equal(0)
    expect(now.nextPoint?.position).to.deep.equal({
      latitude: 66.1,
      longitude: 4.1
    })
    await started.stop()
  })

  it('does not apply an edit of a waypoint replaced while the edit loaded', async function () {
    const started = await start()
    const waypoint = (coordinates: number[]) => ({
      feature: { type: 'Feature', geometry: { type: 'Point', coordinates } }
    })
    const w = await create(started, 'waypoints', waypoint([24.9384, 60.1699]))
    await started
      .selfPut('navigation/course/destination', {
        href: `/resources/waypoints/${w}`
      })
      .then((response) => response.status.should.equal(200))
    const hold = holdFetch(started, w)

    await started
      .put(`/resources/waypoints/${w}`, waypoint([25, 61]))
      .then((response) => response.status.should.equal(200))
    await hold.reached
    await started
      .selfPut('navigation/course/destination', {
        position: { latitude: -35.5, longitude: 138.7 }
      })
      .then((response) => response.status.should.equal(200))
    hold.release()
    await hold.answered()

    expect((await course(started)).nextPoint?.position).to.deep.equal({
      latitude: -35.5,
      longitude: 138.7
    })
    await started.stop()
  })

  it('does not apply an edit of a route replaced while the edit loaded', async function () {
    const started = await start()
    const a = await create(started, 'routes', routeBody(ROUTE_A))
    const b = await create(started, 'routes', routeBody(ROUTE_B))
    await started
      .selfPut('navigation/course/activeRoute', {
        href: `/resources/routes/${a}`
      })
      .then((response) => response.status.should.equal(200))
    const hold = holdFetch(started, a)

    await started
      .put(`/resources/routes/${a}`, routeBody(ROUTE_A.slice(0, 2)))
      .then((response) => response.status.should.equal(200))
    await hold.reached
    await started
      .selfPut('navigation/course/activeRoute', {
        href: `/resources/routes/${b}`
      })
      .then((response) => response.status.should.equal(200))
    hold.release()
    await hold.answered()

    const now = await course(started)
    expect(now.activeRoute?.href).to.equal(`/resources/routes/${b}`)
    expect(now.activeRoute?.pointTotal).to.equal(3)
    expect(now.nextPoint?.position).to.deep.equal({
      latitude: 66.1,
      longitude: 4.1
    })
    await started.stop()
  })
})
