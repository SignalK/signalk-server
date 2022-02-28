import { Waypoint } from '@signalk/server-api'
import chai from 'chai'
import { v4 as uuidv4 } from 'uuid'
import { startServer } from './ts-servertestutilities'
chai.should()

const UUID_PREFIX = 'urn:mrn:signalk:uuid:'
export const skUuid = () => `${UUID_PREFIX}${uuidv4()}`

describe('Resources Api', () => {
  it('can put and get a waypoint', async function() {
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
    const {path, value} = resourceDelta.updates[0].values[0]
    path.should.equal(`resources.waypoints.${resId}`)
    value.should.deep.equal(waypoint)

    ;(waypoint as any).$source = 'resources-provider'
    await get(`/resources/waypoints/${resId}`)
      .then(response => {
        response.status.should.equal(200)
        return response.json()
      })
      .then(resData => resData.should.deep.equal(waypoint))

    stop()
  })
})
