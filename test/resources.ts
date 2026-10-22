import { Resource, Waypoint } from '@signalk/server-api'
import chai from 'chai'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { serverTestConfigDirectory } from './servertestutilities'
import { startServer, DATETIME_REGEX } from './ts-servertestutilities'
chai.should()

export const skUuid = () => `${uuidv4()}`

const waypointsDir = () =>
  path.join(
    serverTestConfigDirectory(),
    'plugin-config-data',
    'resources-provider',
    'resources',
    'waypoints'
  )

describe('Resources Api', () => {
  it('can put and get a waypoint', async function () {
    const { createWsPromiser, get, put, stop } = await startServer()

    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    const waypoint: Waypoint = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [60.151672, 24.891637]
        }
      }
    }
    const resId = skUuid()
    let response = await put(`/resources/waypoints/${resId}`, waypoint)
    response.status.should.equal(200)

    const resourceDelta = JSON.parse(await wsPromiser.nthMessage(2))
    const { path, value } = resourceDelta.updates[0].values[0]
    path.should.equal(`resources.waypoints.${resId}`)
    const { timestamp, ...stored } = value
    timestamp.should.be.a('string').and.match(DATETIME_REGEX)
    stored.should.deep.equal({
      ...waypoint,
      $source: 'resources-provider'
    })
    response = await get(`/resources/waypoints/${resId}`)
    const resData = (await response.json()) as Resource<Waypoint>
    resData.should.deep.equal({
      ...waypoint,
      timestamp: resData.timestamp,
      $source: 'resources-provider'
    })

    stop()
  })

  const postWaypoint = async (
    post: (path: string, body: object) => Promise<Response>,
    [latitude, longitude]: [number, number]
  ) => {
    const r = await post(`/resources/waypoints/`, {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        }
      }
    })
    const { id } = (await r.json()) as { id: string }
    return id
  }

  // Write a waypoint file directly with a chosen filename. The store lists
  // files in sorted order, so the name controls enumeration order.
  const writeWaypointFile = (
    name: string,
    [longitude, latitude]: [number, number]
  ) => {
    fs.mkdirSync(waypointsDir(), { recursive: true })
    fs.writeFileSync(
      path.join(waypointsDir(), name),
      JSON.stringify({
        feature: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [longitude, latitude] }
        }
      })
    )
  }

  it('a corrupt resource file does not hide the other waypoints', async function () {
    const { get, post, stop } = await startServer()

    const validIds = await Promise.all(
      (
        [
          [60.151672, 24.891637],
          [60.251672, 24.891637]
        ] as [number, number][]
      ).map((coords) => postWaypoint(post, coords))
    )

    // Simulate an interrupted write leaving a truncated (empty) file on disk.
    fs.writeFileSync(path.join(waypointsDir(), skUuid()), '')

    const listed = (await (await get('/resources/waypoints')).json()) as {
      [id: string]: object
    }
    Object.keys(listed).should.have.members(validIds)

    stop()
  })

  it('a corrupt file does not consume a limit slot', async function () {
    const { get, post, stop } = await startServer()

    // The store lists files sorted by name, so '00000000-corrupt' is visited
    // before the posted (UUID-named) waypoint. If the skipped corrupt file
    // consumed the single requested slot, the valid waypoint would be missed.
    fs.mkdirSync(waypointsDir(), { recursive: true })
    fs.writeFileSync(path.join(waypointsDir(), '00000000-corrupt'), '')
    const validId = await postWaypoint(post, [60.151672, 24.891637])

    const listed = (await (
      await get('/resources/waypoints?limit=1')
    ).json()) as { [id: string]: object }
    Object.keys(listed).should.deep.equal([validId])

    stop()
  })

  it('a filtered-out entry does not consume a limit slot', async function () {
    const { get, stop } = await startServer()

    // The out-of-bounds waypoint sorts first and is visited before the match.
    // If a valid-but-filtered-out entry consumed the single requested slot,
    // the in-bounds match would be missed.
    writeWaypointFile('00000000-out', [25.5, 61.0])
    writeWaypointFile('11111111-in', [24.85, 60.2])

    const listed = (await (
      await get('/resources/waypoints?bbox=[24.8,60.16,24.899,60.3]&limit=1')
    ).json()) as { [id: string]: object }
    Object.keys(listed).should.deep.equal(['11111111-in'])

    stop()
  })

  it('bbox search works for waypoints', async function () {
    const { get, post } = await startServer()

    const resourceIds = await Promise.all(
      [
        [60.151672, 24.891637],
        [60.251672, 24.891637],
        [60.151672, 24.991637]
      ].map(async ([latitude, longitude]) => {
        const r = await post(`/resources/waypoints/`, {
          feature: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            }
          }
        })
        const { id } = (await r.json()) as { id: string }
        return id
      })
    )
    const r = (await (
      await get('/resources/waypoints?bbox=[24.8,60.16,24.899,60.3]')
    ).json()) as object
    const returnedIds = Object.keys(r)
    returnedIds.length.should.equal(1)
    returnedIds[0].should.equal(resourceIds[1])
  })

  it('distance from position search works for waypoints', async function () {
    const { get, post } = await startServer()

    const resourceIds = await Promise.all(
      [
        [138.34794155831, -34.8965531416984],
        [138.437388789013, -34.8549193092418],
        [138.266384575389, -34.7607885290325]
      ].map(async ([longitude, latitude]) => {
        const r = await post(`/resources/waypoints/`, {
          feature: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            }
          }
        })
        const { id } = (await r.json()) as { id: string }
        return id
      })
    )
    const r = (await (
      await get(
        '/resources/waypoints?position=[138.40299,-34.87222]&distance=6000'
      )
    ).json()) as object
    const returnedIds = Object.keys(r)
    returnedIds.should.have.members([resourceIds[0], resourceIds[1]])
  })

  it('Create route with route point metadata', async function () {
    const { post, stop } = await startServer()

    const route = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.3452, 65.4567],
            [3.3352, 65.5567],
            [3.3261, 65.5777]
          ]
        },
        properties: {
          coordinatesMeta: [
            {
              name: 'Start point',
              description: 'Start of route.'
            },
            {
              name: 'Mid-point marker',
              description: 'Turn here.'
            },
            {
              name: 'Destination',
              description: 'End of route.'
            }
          ]
        }
      }
    }

    const response = await post('/resources/routes', route)
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    id.length.should.equal('ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length)

    stop()
  })

  it('rejects resource ids that escape the resource directory', async function () {
    const { get, del, stop } = await startServer()

    fs.mkdirSync(waypointsDir(), { recursive: true })
    const outsideFile = path.join(waypointsDir(), '..', 'outside.json')
    fs.writeFileSync(outsideFile, JSON.stringify({ secret: 'value' }))
    const traversalId = encodeURIComponent('../outside.json')

    for (const url of [
      `/resources/waypoints/${traversalId}`,
      `/resources/waypoints/${traversalId}?provider=resources-provider`,
      `/resources/waypoints/${traversalId}/secret`
    ]) {
      const response = await get(url)
      response.status.should.equal(400)
      ;(await response.text()).should.not.contain('value')
    }

    ;(await del(`/resources/waypoints/${traversalId}`)).status.should.equal(400)
    fs.existsSync(outsideFile).should.equal(true)

    stop()
  })

  // Registers a provider that records every id it receives, so a test can
  // assert that an unsafe id never reaches provider code.
  const registerRecordingProvider = (
    server: Awaited<ReturnType<typeof startServer>>['server'],
    type: string
  ): string[] => {
    const receivedIds: string[] = []
    const record = (id: string) => {
      receivedIds.push(id)
      return Promise.resolve({})
    }
    server.app.resourcesApi.register('recording-provider', {
      type,
      methods: {
        listResources: () => Promise.resolve({}),
        getResource: record,
        setResource: record,
        deleteResource: record
      }
    })
    return receivedIds
  }

  it('rejects unsafe chart identifiers on POST', async function () {
    const { server, post, stop } = await startServer()
    const receivedIds = registerRecordingProvider(server, 'charts')

    try {
      const response = await post(
        '/resources/charts?provider=recording-provider',
        {
          identifier: '../../../../outside.json',
          name: 'canary',
          type: 'tilelayer',
          url: 'http://localhost/{z}/{x}/{y}.png'
        }
      )
      response.status.should.equal(400)
      receivedIds.should.deep.equal([])
    } finally {
      stop()
    }
  })

  describe('chart tile metadata', () => {
    const registerChartStore = (
      server: Awaited<ReturnType<typeof startServer>>['server']
    ): object[] => {
      const stored: object[] = []
      server.app.resourcesApi.register('chart-store', {
        type: 'charts',
        methods: {
          listResources: () => Promise.resolve({}),
          getResource: () => Promise.resolve({}),
          setResource: (_id: string, value: object) => {
            stored.push(value)
            return Promise.resolve()
          },
          deleteResource: () => Promise.resolve()
        }
      })
      return stored
    }

    it('accepts bounds, zooms, format and scale on any chart type', async function () {
      const { server, post, stop } = await startServer()
      const stored = registerChartStore(server)
      const chart = {
        identifier: 'enc-us5ma1',
        name: 'Boston Harbor',
        type: 'S-57',
        url: 'http://localhost/{z}/{x}/{y}.pbf',
        bounds: [-71.1, 42.3, -70.9, 42.4],
        format: 'pbf',
        minzoom: 9,
        maxzoom: 16,
        scale: 20000
      }

      try {
        const response = await post(
          '/resources/charts?provider=chart-store',
          chart
        )
        response.status.should.equal(201)
        stored.should.deep.equal([chart])
      } finally {
        stop()
      }
    })

    it('rejects malformed bounds on a map server chart', async function () {
      const { server, post, stop } = await startServer()
      const stored = registerChartStore(server)

      try {
        const response = await post('/resources/charts?provider=chart-store', {
          identifier: 'wms-overlay',
          type: 'WMS',
          url: 'http://localhost/wms',
          bounds: [-71.1, 42.3, -70.9]
        })
        response.status.should.equal(400)
        stored.should.deep.equal([])
      } finally {
        stop()
      }
    })
  })

  it('rejects custom collection names that escape the storage root', async function () {
    const { host, stop } = await startServer()

    const outsideDir = path.join(serverTestConfigDirectory(), 'outside')
    fs.rmSync(outsideDir, { recursive: true, force: true })
    const collection = encodeURIComponent('../../../outside')

    try {
      const response = await fetch(
        `${host}/plugins/resources-provider/_config/${collection}`,
        { method: 'POST' }
      )
      response.status.should.equal(400)
      fs.existsSync(outsideDir).should.equal(false)
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
      stop()
    }
  })

  it('rejects resource provider types that are not a single path segment', async function () {
    const { server, stop } = await startServer()

    try {
      ;(() =>
        registerRecordingProvider(server, '../traversal-type')).should.throw(
        'Invalid ResourceProvider.type value!'
      )
    } finally {
      stop()
    }
  })
})
