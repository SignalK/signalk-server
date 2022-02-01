import freeport from 'freeport-promise'
import fetch from 'node-fetch'
import { sendDelta, startServerP, WsPromiser } from './servertestutilities'
import chai from 'chai'
chai.should()

describe('Course Api', () => {
  it('can set course destination', async function() {
    const port = await freeport()
    const host = 'http://localhost:' + port
    const sendDeltaUrl = host + '/signalk/v1/api/_test/delta'
    const api = host + '/signalk/v1/api/'

    const server = await startServerP(port)
    await setSelfPosition(sendDeltaUrl)
    const wsPromiser = new WsPromiser(
      'ws://localhost:' +
        port +
        '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
    )
    const self = JSON.parse(await wsPromiser.nthMessage(1)).self

    const responseStatus = await fetch(
      `${api}vessels/self/navigation/course/destination`,
      {
        method: 'PUT',
        body: JSON.stringify({
          position: { latitude: -35.5, longitude: 138.7 }
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    ).then(response => response.status)
    responseStatus.should.equal(200)

    const courseDelta = JSON.parse(await wsPromiser.nthMessage(2))
    courseDelta.context.should.equal(self)

    courseDelta.updates[0].values
      .find((x: any) => x.path === 'navigation.course')
      .value.should.deep.equal({
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

    server.stop()
  })
})

const setSelfPosition = async (deltaUrl: string) => {
  return sendDelta(
    {
      updates: [
        {
          values: [
            {
              path: 'navigation.position',
              value: { latitude: -35.45, longitude: 138.0 }
            }
          ]
        }
      ]
    },
    deltaUrl
  )
}
