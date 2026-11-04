import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

// The Data Fiddler sends a PGN to every NMEA 2000 connection, or to one
// connection by its provider id.
describe('inputTest sends a PGN to one NMEA 2000 connection', function () {
  let stop: (() => Promise<unknown>) | undefined
  let host: string
  let app: {
    on(event: string, cb: (pgn: unknown) => void): void
    removeAllListeners(event: string): void
  }

  const pgn = { pgn: 127508, prio: 2, dst: 255, fields: { instance: 1 } }
  const send = (body: object) =>
    fetch(`${host}/skServer/inputTest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(pgn), ...body })
    })

  before(async function () {
    const s = await startServer({
      pipedProviders: [
        {
          id: 'bus2',
          enabled: false,
          pipeElements: [
            {
              type: 'providers/simple',
              options: {
                type: 'NMEA2000',
                subOptions: {
                  type: 'w2k-1-n2k-ascii-canboatjs',
                  host: '127.0.0.1',
                  port: 1
                }
              }
            }
          ]
        }
      ]
    })
    stop = s.stop
    host = s.host
    app = (s.server as unknown as { app: typeof app }).app
  })

  after(async function () {
    if (stop) await stop()
  })

  afterEach(function () {
    app.removeAllListeners('nmea2000JsonOut')
    app.removeAllListeners('nmea2000JsonOut:bus2')
  })

  const record = () => {
    const sent: string[] = []
    app.on('nmea2000JsonOut', () => sent.push('every'))
    app.on('nmea2000JsonOut:bus2', () => sent.push('bus2'))
    return sent
  }

  it('sends to every connection without a target', async function () {
    const sent = record()
    const res = await send({ sendToN2K: true })
    expect(res.status).to.equal(200)
    expect(sent).to.deep.equal(['every'])
  })

  it('sends to the connection it names', async function () {
    const sent = record()
    const res = await send({ sendToN2K: true, n2kTarget: 'bus2' })
    expect(res.status).to.equal(200)
    expect(sent).to.deep.equal(['bus2'])
  })

  it('refuses a connection that is not configured', async function () {
    const sent = record()
    const res = await send({ sendToN2K: true, n2kTarget: 'bus9' })
    expect(res.status).to.equal(400)
    expect(((await res.json()) as { error: string }).error).to.equal(
      'No connection bus9'
    )
    expect(sent).to.deep.equal([])
  })
})
