import { Waypoint } from '@signalk/server-api'
import chai from 'chai'
import { v4 as uuidv4 } from 'uuid'
import { startServer } from './ts-servertestutilities'
chai.should()

export const skUuid = () => `${uuidv4()}`

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
    await put(`/resources/waypoints/${resId}`, waypoint).then(response => {
      // response.json().then(x => console.log(x))
      response.status.should.equal(200)
    })

    const resourceDelta = JSON.parse(await wsPromiser.nthMessage(2))
    const { path, value } = resourceDelta.updates[0].values[0]
    path.should.equal(`resources.waypoints.${resId}`)
    value.should.deep.equal(waypoint)
    await get(`/resources/waypoints/${resId}`)
      .then(response => {
        response.status.should.equal(200)
        return response.json()
      })
      .then(resData => {
        delete resData.timestamp
        resData.should.deep.equal({ ...waypoint, $source: 'resources-provider' })
      })

    stop()
  })

  it('bbox search works for waypoints', async function () {
    const { get, post } = await startServer()

    const resourceIds = await Promise.all(
      [
        [60.151672, 24.891637],
        [60.251672, 24.891637],
        [60.151672, 24.991637]
      ].map(([latitude, longitude]) => {
        return post(`/resources/waypoints/`, {
          feature: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            }
          }
        })
          .then(r => r.json())
          .then(r => r.id)
      })
    )
    await get('/resources/waypoints?bbox=[24.8,60.16,24.899,60.3]')
      .then(r => r.json())
      .then(r => {
        const returnedIds = Object.keys(r)
        returnedIds.length.should.equal(1)
        returnedIds[0].should.equal(resourceIds[1])
      })
  })

  it('Create route with route point metadata', async function () {
    const {
      post,
      stop
    } = await startServer()


    const route = {
      feature: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[3.3452, 65.4567], [3.3352, 65.5567], [3.3261, 65.5777]]
        },
        properties: {
          coordinatesMeta: [
            {
              name: "Start point",
              description: "Start of route."
            },
            {
              name: "Mid-point marker",
              description: "Turn here."
            },
            {
              name: "Destination",
              description: "End of route."
            }
          ]
        }
      }
    }

    const { id } = await post('/resources/routes', route)
      .then(response => {
        response.status.should.equal(201)
        return response.json()
      })
    id.length.should.equal(
      'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'.length
    )

    stop()
  })
})
