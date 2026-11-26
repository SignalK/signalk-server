import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

describe('compressOldLogs setting', () => {
  it('saves an explicit false and returns it', async function () {
    this.timeout(120000)
    const { host, stop } = await startServer()
    try {
      const put = await fetch(`${host}/skServer/settings`, {
        method: 'PUT',
        body: JSON.stringify({ options: {}, compressOldLogs: false }),
        headers: { 'Content-Type': 'application/json' }
      })
      expect(put.status).to.equal(200)

      const settings = await fetch(`${host}/skServer/settings`).then((r) =>
        r.json()
      )
      expect(settings.compressOldLogs).to.equal(false)
    } finally {
      await stop()
    }
  })

  it('reports compression as on when the setting is absent', async function () {
    this.timeout(120000)
    const { host, stop } = await startServer()
    try {
      const settings = await fetch(`${host}/skServer/settings`).then((r) =>
        r.json()
      )
      expect(settings.compressOldLogs).to.equal(true)
    } finally {
      await stop()
    }
  })
})
