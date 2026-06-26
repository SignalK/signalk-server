import { strict as assert } from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SqliteMessageLogStore } from '../src/api/communications/store'
import { MessageLogEntryInput } from '@signalk/server-api'

function mkInput(
  over: Partial<MessageLogEntryInput> = {}
): MessageLogEntryInput {
  return {
    type: 'dsc',
    priority: 'distress',
    sender: { mmsi: '316123456' },
    summary: 'DSC distress alert: MMSI 316123456',
    payload: {
      category: 'distress',
      natureOfDistress: 'sinking',
      format: '12'
    },
    raw: '$CDDSC,12,3161234560,...',
    ...over
  }
}

describe('SqliteMessageLogStore', () => {
  let dir: string
  let store: SqliteMessageLogStore

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msglog-'))
    store = new SqliteMessageLogStore(path.join(dir, 'communications.db'))
  })

  afterEach(() => {
    store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('append assigns id + receivedAt + empty disposition', async () => {
    const e = await store.append(mkInput())
    assert.ok(e.id)
    assert.ok(e.receivedAt)
    assert.deepEqual(e.disposition, {})
    assert.equal(e.priority, 'distress')
  })

  it('append preserves a supplied receivedAt', async () => {
    const ts = '2026-06-01T12:00:00.000Z'
    const e = await store.append(mkInput({ receivedAt: ts }))
    assert.equal(e.receivedAt, ts)
  })

  it('get round-trips an entry including position + payload', async () => {
    const a = await store.append(
      mkInput({ position: { latitude: 48.76, longitude: -123.1 } })
    )
    const got = await store.get(a.id)
    assert.ok(got)
    assert.deepEqual(got!.position, { latitude: 48.76, longitude: -123.1 })
    assert.deepEqual(got!.payload, {
      category: 'distress',
      natureOfDistress: 'sinking',
      format: '12'
    })
  })

  it('get returns undefined for unknown id', async () => {
    assert.equal(await store.get('nope'), undefined)
  })

  it('query filters by type, priority, sender, and time range', async () => {
    await store.append(mkInput({ receivedAt: '2026-06-01T00:00:00.000Z' }))
    await store.append(
      mkInput({
        priority: 'routine',
        sender: { mmsi: '999000111' },
        receivedAt: '2026-06-02T00:00:00.000Z'
      })
    )
    const distress = await store.query({ priority: 'distress' })
    assert.equal(distress.length, 1)
    const bySender = await store.query({ sender: '999000111' })
    assert.equal(bySender.length, 1)
    assert.equal(bySender[0].priority, 'routine')
    const inRange = await store.query({
      from: '2026-06-01T12:00:00.000Z',
      to: '2026-06-03T00:00:00.000Z'
    })
    assert.equal(inRange.length, 1)
  })

  it('query orders by receivedAt and honours limit + order', async () => {
    await store.append(mkInput({ receivedAt: '2026-06-01T00:00:00.000Z' }))
    await store.append(mkInput({ receivedAt: '2026-06-02T00:00:00.000Z' }))
    const desc = await store.query({ order: 'desc' })
    assert.equal(desc[0].receivedAt, '2026-06-02T00:00:00.000Z')
    const asc = await store.query({ order: 'asc' })
    assert.equal(asc[0].receivedAt, '2026-06-01T00:00:00.000Z')
    const limited = await store.query({ limit: 1, order: 'desc' })
    assert.equal(limited.length, 1)
  })

  it('update patches disposition and returns the updated entry', async () => {
    const a = await store.append(mkInput())
    const ackAt = '2026-06-01T13:00:00.000Z'
    const updated = await store.update(a.id, { acknowledgedAt: ackAt })
    assert.equal(updated!.disposition.acknowledgedAt, ackAt)
    const cleared = await store.update(a.id, { clearedAt: ackAt })
    assert.equal(cleared!.disposition.acknowledgedAt, ackAt)
    assert.equal(cleared!.disposition.clearedAt, ackAt)
  })

  it('update returns undefined for unknown id', async () => {
    assert.equal(await store.update('nope', { clearedAt: 'x' }), undefined)
  })

  it('persists across reopen (data survives a new connection)', async () => {
    const a = await store.append(mkInput())
    store.close()
    const reopened = new SqliteMessageLogStore(
      path.join(dir, 'communications.db')
    )
    const got = await reopened.get(a.id)
    reopened.close()
    assert.ok(got)
    assert.equal(got!.id, a.id)
  })
})
