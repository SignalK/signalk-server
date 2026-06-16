import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

describe('appstore install log', function () {
  let stop: (() => Promise<unknown>) | undefined
  let host: string

  before(async function () {
    const s = await startServer()
    stop = s.stop
    host = s.host
  })

  after(async function () {
    if (stop) await stop()
  })

  it('returns 404 when no install has produced a log', async function () {
    const res = await fetch(`${host}/skServer/appstore/installLog/some-plugin`)
    expect(res.status).to.equal(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).to.match(/No install log/)
  })

  it('resolves scoped package names via the org route', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/installLog/@signalk/some-plugin`
    )
    expect(res.status).to.equal(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).to.contain('@signalk/some-plugin')
  })
})
