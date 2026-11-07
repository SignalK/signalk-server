import { strict as assert } from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import chai from 'chai'
import { CommunicationsApi } from '../src/api/communications'
import { freeport } from './ts-servertestutilities'
import { startServerP, serverTestConfigDirectory } from './servertestutilities'

chai.should()

// The disposition mirror runs off the notification delta asynchronously, so the
// ack/clear REST call can return before the store write lands. Poll briefly.
async function waitForDisposition(
  url: string,
  field: 'acknowledgedAt' | 'clearedAt'
) {
  for (let i = 0; i < 40; i++) {
    const entry = await (await fetch(url)).json()
    if (entry.disposition?.[field]) {
      return entry
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return (await fetch(url)).json()
}

function fakeApp(dataDir: string) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const app: any = {
    config: { configPath: dataDir },
    // minimal express + app stubs the ingestion unit test needs from start()
    use: () => undefined,
    get: () => undefined,
    securityStrategy: { allowReadOnly: () => true },
    // capture the mirror handler so tests can feed it crafted notification deltas
    registerDeltaInputHandler: (h: any) => {
      app._deltaHandler = h
    },
    notificationApi: { raise: () => 'fake-notification-id' }
  }
  return app
}

describe('CommunicationsApi ingestion', () => {
  let dir: string
  let app: any
  let api: CommunicationsApi

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commapi-'))
    app = fakeApp(dir)
    api = new CommunicationsApi(app)
    await api.start()
  })

  afterEach(() => {
    api.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('logMessage persists an entry and assigns id + receivedAt', async () => {
    const e = await api.logMessage({
      type: 'dsc',
      priority: 'routine',
      sender: { mmsi: '316123456' },
      summary: 'routine call',
      payload: { format: '00', category: 'routine' },
      raw: '$CDDSC,00,...'
    })
    assert.ok(e.id)
    assert.ok(e.receivedAt)
    const got = await api.getStore().get(e.id)
    assert.equal(got!.summary, 'routine call')
  })

  it('clears the raised notification when persistence fails — no orphan', async () => {
    let cleared: string | undefined
    app.notificationApi.raise = () => 'fake-notification-id'
    app.notificationApi.clear = (id: string) => {
      cleared = id
    }
    api.stop() // close the store so append throws
    await assert.rejects(() =>
      api.logMessage({
        type: 'dsc',
        priority: 'distress',
        sender: { mmsi: '316123456' },
        summary: 'DSC distress alert: MMSI 316123456',
        payload: { format: '12', category: 'distress' },
        raw: '$CDDSC,12,...'
      })
    )
    assert.equal(cleared, 'fake-notification-id')
  })

  it('mirrors a combined ack+clear notification value onto both dispositions', async () => {
    const entry = await api.logMessage({
      type: 'dsc',
      priority: 'distress',
      sender: { mmsi: '316123456' },
      summary: 'DSC distress alert: MMSI 316123456',
      payload: {
        format: '12',
        category: 'distress',
        natureOfDistress: 'sinking'
      },
      raw: '$CDDSC,12,...'
    })
    assert.ok(entry.notificationId)

    // a single notification value that both acknowledges and clears at once
    app._deltaHandler(
      {
        updates: [
          {
            notificationId: entry.notificationId,
            values: [
              {
                path: 'notifications.communications.dsc',
                value: { state: 'normal', status: { acknowledged: true } }
              }
            ]
          }
        ]
      },
      () => undefined
    )

    let got
    for (let i = 0; i < 40; i++) {
      got = await api.getStore().get(entry.id)
      if (got!.disposition.acknowledgedAt && got!.disposition.clearedAt) break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.ok(got!.disposition.acknowledgedAt, 'acknowledgedAt should be set')
    assert.ok(got!.disposition.clearedAt, 'clearedAt should be set')
  })

  it('normalizes a non-canonical receivedAt to UTC before persisting', async () => {
    const e = await api.logMessage({
      type: 'dsc',
      priority: 'routine',
      sender: { mmsi: '316123456' },
      summary: 'offset timestamp',
      payload: { format: '00', category: 'routine' },
      raw: '$CDDSC,00,...',
      receivedAt: '2026-06-01T12:30:00.000+02:00'
    })
    const got = await api.getStore().get(e.id)
    assert.equal(got!.receivedAt, '2026-06-01T10:30:00.000Z')
  })

  it('falls back to server time for an unparseable receivedAt', async () => {
    const e = await api.logMessage({
      type: 'dsc',
      priority: 'routine',
      sender: { mmsi: '316123456' },
      summary: 'bad timestamp',
      payload: { format: '00', category: 'routine' },
      raw: '$CDDSC,00,...',
      receivedAt: 'not-a-date'
    })
    const got = await api.getStore().get(e.id)
    assert.ok(!Number.isNaN(new Date(got!.receivedAt).getTime()))
    assert.match(got!.receivedAt, /Z$/)
  })
})

describe('Communications REST API', () => {
  let server: any // startServerP returns an untyped object
  let apiBase: string
  let origConfigDir: string | undefined

  before(async function () {
    this.timeout(30000)
    origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    const port = await freeport()
    apiBase = `http://localhost:${port}/signalk/v2/api/communications`

    // the test-config dir is fixed and reused across runs; clear any stale DB
    // so the count assertions below are deterministic
    for (const f of [
      'communications.db',
      'communications.db-wal',
      'communications.db-shm'
    ]) {
      const p = path.join(serverTestConfigDirectory(), f)
      if (fs.existsSync(p)) fs.rmSync(p)
    }

    server = await startServerP(port, false)

    await server.app.logMessage({
      type: 'dsc',
      priority: 'distress',
      sender: { mmsi: '316123456' },
      summary: 'DSC distress alert: MMSI 316123456',
      payload: {
        format: '12',
        category: 'distress',
        natureOfDistress: 'sinking'
      },
      raw: '$CDDSC,12,...',
      receivedAt: '2026-06-01T00:00:00.000Z'
    })
    await server.app.logMessage({
      type: 'dsc',
      priority: 'routine',
      sender: { mmsi: '999000111' },
      summary: 'routine call',
      payload: { format: '00', category: 'routine' },
      raw: '$CDDSC,00,...',
      receivedAt: '2026-06-02T00:00:00.000Z'
    })
  })

  after(async function () {
    if (server) {
      await server.stop()
    }
    // Clean up the DB so subsequent runs start fresh
    for (const f of [
      'communications.db',
      'communications.db-wal',
      'communications.db-shm'
    ]) {
      const p = path.join(serverTestConfigDirectory(), f)
      if (fs.existsSync(p)) fs.rmSync(p)
    }
    if (origConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
    }
  })

  it('GET /messages returns entries (anonymous), newest first', async () => {
    const res = await fetch(`${apiBase}/messages`)
    res.status.should.equal(200)
    const body = await res.json()
    body.should.be.an('array')
    body.length.should.equal(2)
    body[0].receivedAt.should.equal('2026-06-02T00:00:00.000Z')
  })

  it('GET /messages?priority=distress filters', async () => {
    const res = await fetch(`${apiBase}/messages?priority=distress`)
    const body = await res.json()
    body.length.should.equal(1)
    body[0].priority.should.equal('distress')
  })

  it('GET /messages/:id returns one entry', async () => {
    const list = await (await fetch(`${apiBase}/messages`)).json()
    const id = list[0].id
    const res = await fetch(`${apiBase}/messages/${id}`)
    res.status.should.equal(200)
    const body = await res.json()
    body.id.should.equal(id)
  })

  it('GET /messages/:id returns 404 for unknown id', async () => {
    const res = await fetch(`${apiBase}/messages/does-not-exist`)
    res.status.should.equal(404)
  })

  it('GET /messages rejects a malformed time bound with 400', async () => {
    const res = await fetch(`${apiBase}/messages?from=not-a-date`)
    res.status.should.equal(400)
  })

  it('raises a notification for an urgency call and mirrors ack onto disposition', async function () {
    this.timeout(15000)
    const entry = await server.app.logMessage({
      type: 'dsc',
      priority: 'urgency',
      sender: { mmsi: '316555000' },
      summary: 'DSC urgency call: MMSI 316555000',
      payload: { format: '10', category: 'urgency' },
      raw: '$CDDSC,10,...'
    })
    entry.notificationId.should.be.a('string')

    const base = apiBase.replace('/communications', '/notifications')
    const ackRes = await fetch(`${base}/${entry.notificationId}/acknowledge`, {
      method: 'POST'
    })
    ackRes.status.should.equal(200)

    const after = await waitForDisposition(
      `${apiBase}/messages/${entry.id}`,
      'acknowledgedAt'
    )
    after.disposition.should.have.property('acknowledgedAt')
  })

  it('does not raise a notification for routine calls', async () => {
    const entry = await server.app.logMessage({
      type: 'dsc',
      priority: 'routine',
      sender: { mmsi: '316555111' },
      summary: 'routine',
      payload: { format: '00', category: 'routine' },
      raw: '$CDDSC,00,...'
    })
    assert.equal(entry.notificationId, undefined)
  })

  it('mirrors clearedAt onto disposition when notification is cleared', async function () {
    this.timeout(15000)
    const entry = await server.app.logMessage({
      type: 'dsc',
      priority: 'distress',
      sender: { mmsi: '316777999' },
      summary: 'DSC distress alert: MMSI 316777999',
      payload: { format: '12', category: 'distress', natureOfDistress: 'fire' },
      raw: '$CDDSC,12,...'
    })
    entry.notificationId.should.be.a('string')

    const base = apiBase.replace('/communications', '/notifications')
    const clearRes = await fetch(`${base}/${entry.notificationId}`, {
      method: 'DELETE'
    })
    clearRes.status.should.equal(200)

    const after = await waitForDisposition(
      `${apiBase}/messages/${entry.id}`,
      'clearedAt'
    )
    after.disposition.should.have.property('clearedAt')
  })
})
