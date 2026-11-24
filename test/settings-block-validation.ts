import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, getAdminToken } from './servertestutilities'

describe('settings block validation', function () {
  let server: Awaited<ReturnType<typeof startServerP>> | undefined
  let endpoint: string
  let token: string

  before(async function () {
    const port = await freeport()
    endpoint = `http://localhost:${port}/skServer/settings`
    server = await startServerP(port, true, {
      settings: { interfaces: { plugins: false } }
    })
    token = await getAdminToken(server)
  })

  after(async () => {
    await server?.stop()
  })

  function save(body: unknown) {
    return fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `JAUTHENTICATION=${token}`
      },
      body: JSON.stringify(body)
    })
  }

  it('accepts a partial update without options and preserves unrelated settings', async () => {
    const before = structuredClone(server.app.config.settings)
    const response = await save({ courseApi: { apiOnly: true } })
    expect(response.status).to.equal(200)
    expect(server.app.config.settings).to.deep.equal({
      ...before,
      courseApi: { ...before.courseApi, apiOnly: true }
    })
  })

  for (const value of [false, true]) {
    it(`accepts boolean ${value} for both settings blocks`, async () => {
      const response = await save({
        options: {},
        courseApi: { apiOnly: value },
        notifications: { manageNotifications: value }
      })
      expect(response.status).to.equal(200)
      expect(server.app.config.settings.courseApi.apiOnly).to.equal(value)
      expect(
        server.app.config.settings.notifications.manageNotifications
      ).to.equal(value)
    })
  }

  for (const [block, key] of [
    ['courseApi', 'apiOnly'],
    ['notifications', 'manageNotifications']
  ]) {
    for (const invalid of ['false', 0, null]) {
      it(`rejects ${block}.${key}=${JSON.stringify(invalid)} without changing settings`, async () => {
        const before = structuredClone(server.app.config.settings)
        const response = await save({
          options: { mdns: !before.mdns },
          [block]: { [key]: invalid }
        })
        expect(response.status).to.equal(400)
        expect(server.app.config.settings).to.deep.equal(before)
      })
    }
    it(`rejects an unknown ${block} key`, async () => {
      const before = structuredClone(server.app.config.settings)
      const response = await save({ options: {}, [block]: { typo: true } })
      expect(response.status).to.equal(400)
      expect(server.app.config.settings).to.deep.equal(before)
    })
  }

  for (const body of [
    [],
    { options: null },
    { options: [] },
    { courseApi: null },
    { notifications: [] }
  ]) {
    it(`rejects malformed settings ${JSON.stringify(body)}`, async () => {
      const before = structuredClone(server.app.config.settings)
      const response = await save(body)
      expect(response.status).to.equal(400)
      expect(server.app.config.settings).to.deep.equal(before)
    })
  }
})
