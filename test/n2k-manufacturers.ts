import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

// The names a connection's manufacturer filter picks from
// (canboat/canboatjs#588).
describe('n2kManufacturers', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stop: any
  let host: string

  before(async function () {
    const s = await startServer()
    stop = s.stop
    host = s.host
  })

  after(async function () {
    if (stop) await stop()
  })

  it('lists the manufacturer names and codes, by name', async function () {
    const res = await fetch(`${host}/skServer/n2kManufacturers`)
    expect(res.status).to.equal(200)
    const list = (await res.json()) as { name: string; code: number }[]
    expect(list).to.deep.include({ name: 'Victron Energy', code: 358 })
    expect(list).to.deep.include({ name: 'Garmin', code: 229 })
    const names = list.map((m) => m.name)
    expect(names).to.deep.equal([...names].sort((a, b) => a.localeCompare(b)))
  })
})
