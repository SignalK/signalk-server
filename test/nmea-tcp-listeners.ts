import { expect } from 'chai'
import { EventEmitter } from 'events'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nmeaTcpInterface = require('../dist/interfaces/nmea-tcp.js')

describe('NMEA0183 TCP interface listener lifecycle', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createInterface(port: number): { app: any; api: any } {
    process.env.NMEA0183PORT = String(port)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app: any = new EventEmitter()
    app.signalk = new EventEmitter()
    return { app, api: nmeaTcpInterface(app) }
  }

  it('removes its event listeners on stop', () => {
    const { app, api } = createInterface(18753)
    api.start()
    expect(app.signalk.listenerCount('nmea0183')).to.equal(1)
    expect(app.listenerCount('nmea0183out')).to.equal(1)

    api.stop()
    expect(app.signalk.listenerCount('nmea0183')).to.equal(0)
    expect(app.listenerCount('nmea0183out')).to.equal(0)
  })

  it('does not accumulate duplicate listeners across restarts', () => {
    const { app, api } = createInterface(18754)
    api.start()
    api.stop()
    api.start()

    // A restart must leave exactly one listener per event; otherwise each
    // NMEA sentence would be broadcast to every connected client twice.
    expect(app.signalk.listenerCount('nmea0183')).to.equal(1)
    expect(app.listenerCount('nmea0183out')).to.equal(1)

    api.stop()
  })
})
