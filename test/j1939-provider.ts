import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

describe('J1939 provider settings', function () {
  let server: Awaited<ReturnType<typeof startServer>>

  before(async function () {
    server = await startServer()
  })

  after(async function () {
    await server.stop()
  })

  it('refuses a new J1939 connection without a source', async function () {
    const result = await fetch(`${server.host}/skServer/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'j1939NoSource',
        enabled: true,
        type: 'J1939',
        options: {}
      })
    })

    expect(result.status).to.equal(400)
    expect(await result.text()).to.equal('Select a J1939 source')
    const settings = await fetch(`${server.host}/skServer/providers`).then(
      (r) => r.json() as Promise<Array<{ id: string }>>
    )
    expect(settings.map((provider) => provider.id)).to.not.include(
      'j1939NoSource'
    )
  })
})
