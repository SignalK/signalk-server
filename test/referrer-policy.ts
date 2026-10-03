import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

describe('Referrer-Policy', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, false)
  })

  after(async function () {
    await server.stop()
  })

  it('sends the origin to other sites, so tile servers that require a Referer accept webapp requests', async function () {
    const res = await fetch(`${url}/signalk`)
    ;(res.headers.get('referrer-policy') ?? '').should.equal(
      'strict-origin-when-cross-origin'
    )
  })
})
