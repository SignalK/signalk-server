import { expect } from 'chai'
import { SERVER_START_TIMEOUT, startServer } from './ts-servertestutilities'

type Server = Awaited<ReturnType<typeof startServer>>

const TARGET = 'targets.radar:r0-17'
const VESSEL = 'vessels.urn:mrn:imo:mmsi:244060000'

describe('Sensor targets', () => {
  let server: Server

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    server = await startServer()
  })

  after(async () => {
    await server.stop()
  })

  const sendToTarget = (values: { path: string; value: unknown }[]) =>
    server.sendADelta({
      context: TARGET,
      updates: [{ timestamp: new Date().toISOString(), values }]
    })

  const getTarget = async () => {
    const res = await server.getV1('/targets/radar:r0-17')
    expect(res.status).to.equal(200)
    return res.json()
  }

  it('streams targets to subscribers of targets.*', async () => {
    const ws = server.createWsPromiser()
    await ws.nthMessage(1)
    await ws.send({ context: 'targets.*', subscribe: [{ path: '*' }] })
    // Sent on the same socket, so the server has the subscription first.
    await ws.send({
      context: TARGET,
      updates: [
        {
          timestamp: new Date().toISOString(),
          values: [
            {
              path: 'navigation.position',
              value: { latitude: 52.0182, longitude: 4.0001 }
            }
          ]
        }
      ]
    })
    try {
      const delta = JSON.parse(await ws.nthMessage(2))
      expect(delta.context).to.equal(TARGET)
      expect(delta.updates[0].values[0].path).to.equal('navigation.position')
      expect(delta.updates[0].values[0].value).to.deep.equal({
        latitude: 52.0182,
        longitude: 4.0001
      })
    } finally {
      ws.close()
    }
  })

  it('serves targets over REST', async () => {
    await sendToTarget([
      {
        path: 'navigation.position',
        value: { latitude: 52.0182, longitude: 4.0001 }
      }
    ])
    const target = await getTarget()
    expect(target.navigation.position.value).to.deep.equal({
      latitude: 52.0182,
      longitude: 4.0001
    })
  })

  it('keeps a link to the context a target is the same object as', async () => {
    await sendToTarget([{ path: 'sameAs', value: VESSEL }])
    expect((await getTarget()).sameAs.value).to.equal(VESSEL)
    await sendToTarget([{ path: 'sameAs', value: null }])
    expect((await getTarget()).sameAs.value).to.equal(null)
  })

  it('keeps a lost track as a null position', async () => {
    const position = { latitude: 52.0182, longitude: 4.0001 }
    await sendToTarget([{ path: 'navigation.position', value: position }])
    expect((await getTarget()).navigation.position.value).to.deep.equal(
      position
    )
    await sendToTarget([{ path: 'navigation.position', value: null }])
    expect((await getTarget()).navigation.position.value).to.equal(null)
  })
})
