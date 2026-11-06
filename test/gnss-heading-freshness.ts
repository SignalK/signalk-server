import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

const DELTA_SETTLE_MS = 200
const LATITUDE = 60
// Antenna at the bow of a 20 m vessel heading north: the corrected fix
// lies 10 m south of the antenna.
const CORRECTED_LATITUDE = LATITUDE + ((-10 / 6_378_137) * 180) / Math.PI

const settle = () => new Promise((r) => setTimeout(r, DELTA_SETTLE_MS))

// The corrector learns the heading from the self bus rather than the data
// model, so this exercises that a heading delivered through the server's
// real delta pipeline reaches it.
describe('GNSS correction heading through the server', () => {
  it('corrects with a live heading and not with one only in the model', async () => {
    const { server, sendADelta, getV1, stop } = await startServer({
      gnssCorrection: 'replace',
      gnssSensors: [
        { sensorId: 'bow', $source: 'test.gnss', fromBow: 0, fromCenter: 0 }
      ]
    })
    try {
      server.app.signalk.self.design = {
        length: { value: { overall: 20 } }
      }
      const sendPosition = async () => {
        await sendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'test.gnss',
              values: [
                {
                  path: 'navigation.position',
                  value: { latitude: LATITUDE, longitude: 24 }
                }
              ]
            }
          ]
        })
        await settle()
        const position = await getV1('/vessels/self/navigation/position').then(
          (r: Response) => r.json()
        )
        return position.value.latitude as number
      }

      server.app.signalk.self.navigation = {
        headingTrue: { value: 0, timestamp: new Date().toISOString() }
      }
      expect(await sendPosition()).to.equal(LATITUDE)

      await sendADelta({
        context: 'vessels.self',
        updates: [
          {
            $source: 'test.compass',
            values: [{ path: 'navigation.headingTrue', value: 0 }]
          }
        ]
      })
      await settle()
      expect(await sendPosition()).to.be.closeTo(CORRECTED_LATITUDE, 1e-9)
    } finally {
      await stop()
    }
  })
})
