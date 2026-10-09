import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import {
  AlertStore,
  MAX_VACUUM_PAGES_PER_PRUNE
} from '../../../src/api/alerts/alertStore'
import { InvalidHistoryCursorError } from '../../../src/api/alerts/errors'
import { historySelect } from '../../../src/api/alerts/historyStore'
import type { HistoryEntry } from '../../../src/api/alerts/types'
import { asContext, asPath, asSourceRef, storedAlert } from './helpers/fixtures'

/**
 * The audit trail is reached through AlertStore, which owns the connection the
 * HistoryStore writes on, so these tests exercise the wiring the server uses.
 */

/** Largest page the audit trail returns, whatever the caller asks for. */
const MAX_PAGE_SIZE = 1000

/**
 * Assert that a promise rejects with an error whose message contains `message`.
 */
async function expectRejection(promise: Promise<unknown>, message: string) {
  try {
    await promise
  } catch (err) {
    expect((err as Error).message).to.include(message)
    return
  }
  expect.fail(`expected rejection containing "${message}"`)
}

function historyEntry(
  overrides: Partial<Omit<HistoryEntry, 'id'>> = {}
): Omit<HistoryEntry, 'id'> {
  return {
    alertId: 'alert-1',
    path: asPath('test.alert'),
    priority: 'alarm',
    message: 'Test alert',
    $source: asSourceRef('test-source'),
    eventType: 'raise',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

/** Payload per fixture row, big enough that row overhead does not dominate. */
const ROW_PAYLOAD_BYTES = 2000

/** Pages beyond the vacuum bound the fixture frees, so one pass cannot finish. */
const VACUUM_PASS_MARGIN_PAGES = 200

const APPEND_BATCH = 500

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** The `message` of each entry, used as a per-fixture tag. */
function tags(entries: HistoryEntry[]): string[] {
  return entries.map((entry) => entry.message)
}

function pragma(db: DatabaseSync, name: string): SQLOutputValue {
  const row = db.prepare(`PRAGMA ${name}`).get()
  if (!row) {
    throw new Error(`PRAGMA ${name} returned no row`)
  }
  return row[name]
}

describe('alert history', () => {
  let tempDir: string
  let dbPath: string
  let store: AlertStore

  /**
   * Append entries through a transition. The audit trail is the subject here,
   * so the transitions carry no alert; the delete they imply is a no-op.
   */
  async function append(...entries: Omit<HistoryEntry, 'id'>[]): Promise<void> {
    await store.commit({
      alertId: entries[0].alertId,
      alert: null,
      history: entries
    })
  }

  /** Every byte the database occupies, including its WAL sidecars. */
  function bytesOnDisk(): number {
    return ['', '-wal', '-shm']
      .map((suffix) => dbPath + suffix)
      .filter((file) => fs.existsSync(file))
      .reduce((total, file) => total + fs.statSync(file).size, 0)
  }

  function withConnection<T>(use: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(dbPath)
    try {
      return use(db)
    } finally {
      db.close()
    }
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-'))
    dbPath = path.join(tempDir, 'alerts.db')
    store = new AlertStore(dbPath)
    await store.initialize()
  })

  afterEach(async () => {
    await store.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('append', () => {
    it('round-trips every field of an entry', async () => {
      const alert = storedAlert({ id: 'alert-42' })
      const entry: Omit<HistoryEntry, 'id'> = {
        alertId: alert.id,
        path: asPath('propulsion.port.oilPressureLow'),
        context: asContext('vessels.urn:mrn:imo:mmsi:200000000'),
        priority: 'alarm',
        message: 'Oil pressure low',
        $source: asSourceRef('n2k-on-ve.can-bus.115'),
        eventType: 'escalate',
        timestamp: '2026-01-01T00:00:00.000Z',
        userId: 'user-1',
        previousState: 'unacknowledged',
        newState: 'acknowledged',
        previousPriority: 'warning',
        newPriority: 'alarm',
        details: { reason: 'timeout', thresholds: { warn: 1, alarm: 2 } }
      }

      await store.commit({
        alertId: alert.id,
        alert,
        history: [entry]
      })

      const { entries } = await store.queryHistory({})
      expect(entries).to.have.lengthOf(1)
      const stored = entries[0]
      expect(stored.id).to.be.a('string')
      expect(stored.id.length).to.be.greaterThan(0)
      expect(stored).to.deep.equal({ ...entry, id: stored.id })
    })

    it('leaves the optional fields absent when the entry has none', async () => {
      await append(historyEntry())

      const { entries } = await store.queryHistory({})
      expect(entries).to.have.lengthOf(1)
      const stored = entries[0]
      for (const field of [
        'context',
        'userId',
        'previousState',
        'newState',
        'previousPriority',
        'newPriority',
        'details'
      ]) {
        expect(stored).to.not.have.property(field)
      }
    })

    it('orders the entries of one transition by when they happened', async () => {
      // An escalating re-raise appends both entries under one timestamp, and
      // the trail has to report them in a stable order rather than an
      // arbitrary one.
      const shared = '2026-03-01T00:00:00.000Z'
      await append(
        historyEntry({
          message: 'escalated',
          eventType: 'escalate',
          timestamp: shared,
          previousPriority: 'warning',
          newPriority: 'alarm'
        }),
        historyEntry({
          message: 're-raised',
          eventType: 'raise',
          timestamp: shared
        })
      )

      const { entries } = await store.queryHistory({})
      // Newest first, so the raise appended after the escalate leads.
      expect(tags(entries)).to.deep.equal(['re-raised', 'escalated'])
      expect(entries.map((entry) => entry.eventType)).to.deep.equal([
        'raise',
        'escalate'
      ])
    })
  })

  describe('query', () => {
    beforeEach(async () => {
      await append(
        historyEntry({
          message: 'e1',
          alertId: 'a1',
          path: asPath('p1'),
          eventType: 'raise',
          timestamp: '2026-01-01T00:00:00.000Z'
        })
      )
      await append(
        historyEntry({
          message: 'e2',
          alertId: 'a1',
          path: asPath('p1'),
          eventType: 'acknowledge',
          timestamp: '2026-01-02T00:00:00.000Z'
        })
      )
      await append(
        historyEntry({
          message: 'e3',
          alertId: 'a2',
          path: asPath('p2'),
          eventType: 'raise',
          timestamp: '2026-01-03T00:00:00.000Z'
        })
      )
      await append(
        historyEntry({
          message: 'e4',
          alertId: 'a2',
          path: asPath('p2'),
          eventType: 'clear',
          timestamp: '2026-01-04T00:00:00.000Z'
        })
      )
      await append(
        historyEntry({
          message: 'e5',
          alertId: 'a3',
          path: asPath('p1'),
          eventType: 'escalate',
          timestamp: '2026-01-05T00:00:00.000Z'
        })
      )
    })

    it('orders entries newest first', async () => {
      const { entries } = await store.queryHistory({})
      expect(tags(entries)).to.deep.equal(['e5', 'e4', 'e3', 'e2', 'e1'])
    })

    it('filters by alertId', async () => {
      const { entries } = await store.queryHistory({ alertId: 'a1' })
      expect(tags(entries)).to.deep.equal(['e2', 'e1'])
    })

    it('filters by path', async () => {
      const { entries } = await store.queryHistory({
        path: asPath('p1')
      })
      expect(tags(entries)).to.deep.equal(['e5', 'e2', 'e1'])
    })

    it('filters by a single eventType', async () => {
      const { entries } = await store.queryHistory({
        eventType: 'raise'
      })
      expect(tags(entries)).to.deep.equal(['e3', 'e1'])
    })

    it('filters by an array of eventTypes', async () => {
      const { entries } = await store.queryHistory({
        eventType: ['raise', 'clear']
      })
      expect(tags(entries)).to.deep.equal(['e4', 'e3', 'e1'])
    })

    it('filters by from, inclusive of the boundary', async () => {
      const { entries } = await store.queryHistory({
        from: '2026-01-03T00:00:00.000Z'
      })
      expect(tags(entries)).to.deep.equal(['e5', 'e4', 'e3'])
    })

    it('filters by to, inclusive of the boundary', async () => {
      const { entries } = await store.queryHistory({
        to: '2026-01-03T00:00:00.000Z'
      })
      expect(tags(entries)).to.deep.equal(['e3', 'e2', 'e1'])
    })

    it('selects the same window from a bound given in another offset', async () => {
      // Entries are stored as UTC and compared as text, so an offset form has
      // to be normalised or it selects the wrong window.
      const offsetBound = await store.queryHistory({
        from: '2026-01-03T02:00:00.000+02:00'
      })
      expect(tags(offsetBound.entries)).to.deep.equal(['e5', 'e4', 'e3'])

      const offsetTo = await store.queryHistory({
        to: '2026-01-02T20:00:00.000-04:00'
      })
      expect(tags(offsetTo.entries)).to.deep.equal(['e3', 'e2', 'e1'])
    })

    it('rejects a bound that is not a date', async () => {
      await expectRejection(
        store.queryHistory({ from: 'the day before yesterday' }),
        'Alert history from bound is not a valid date'
      )
      await expectRejection(
        store.queryHistory({ to: '2026-13-45T00:00:00.000Z' }),
        'Alert history to bound is not a valid date'
      )
    })

    it('combines a date range with the other filters', async () => {
      const { entries } = await store.queryHistory({
        from: '2026-01-02T00:00:00.000Z',
        to: '2026-01-04T00:00:00.000Z',
        path: asPath('p2'),
        eventType: ['raise', 'clear']
      })
      expect(tags(entries)).to.deep.equal(['e4', 'e3'])
    })

    it('pages with the cursor the previous page returned', async () => {
      const first = await store.queryHistory({ limit: 2 })
      expect(tags(first.entries)).to.deep.equal(['e5', 'e4'])
      expect(first.next).to.be.a('string')

      const second = await store.queryHistory({ limit: 2, before: first.next })
      expect(tags(second.entries)).to.deep.equal(['e3', 'e2'])

      const last = await store.queryHistory({ limit: 2, before: second.next })
      expect(tags(last.entries)).to.deep.equal(['e1'])
      expect(last.next).to.equal(undefined)
    })

    it('returns no cursor when the page holds every remaining entry', async () => {
      expect((await store.queryHistory({})).next).to.equal(undefined)
      expect((await store.queryHistory({ limit: 5 })).next).to.equal(undefined)
    })

    it('keeps the filters when paging', async () => {
      const first = await store.queryHistory({ path: asPath('p1'), limit: 2 })
      expect(tags(first.entries)).to.deep.equal(['e5', 'e2'])

      const second = await store.queryHistory({
        path: asPath('p1'),
        limit: 2,
        before: first.next
      })
      expect(tags(second.entries)).to.deep.equal(['e1'])
      expect(second.next).to.equal(undefined)
    })

    it('keeps an event type and date filter when paging', async () => {
      const filter = {
        eventType: ['raise' as const, 'clear' as const],
        from: '2026-01-02T00:00:00.000Z'
      }
      const first = await store.queryHistory({ ...filter, limit: 1 })
      expect(tags(first.entries)).to.deep.equal(['e4'])

      const second = await store.queryHistory({
        ...filter,
        limit: 1,
        before: first.next
      })
      expect(tags(second.entries)).to.deep.equal(['e3'])
      expect(second.next).to.equal(undefined)
    })

    it('does not repeat an entry when a newer one arrives between pages', async () => {
      const first = await store.queryHistory({ limit: 2 })
      await append(
        historyEntry({ message: 'e6', timestamp: '2026-01-06T00:00:00.000Z' })
      )

      const second = await store.queryHistory({ limit: 2, before: first.next })
      expect(tags(second.entries)).to.deep.equal(['e3', 'e2'])
    })

    it('returns an empty page and no cursor for a zero limit', async () => {
      const none = await store.queryHistory({ limit: 0 })
      expect(none.entries).to.have.lengthOf(0)
      expect(none.next).to.equal(undefined)
    })

    it('rejects a limit that is not a non-negative integer', async () => {
      // SQLite reads a negative LIMIT as no limit at all, so the value meant to
      // bound the response is the one that would remove the bound.
      for (const value of [-1, 1.5, Number.NaN]) {
        await expectRejection(
          store.queryHistory({ limit: value }),
          `Alert history limit must be a non-negative integer, got ${String(value)}`
        )
      }
    })

    it('rejects a cursor it did not issue', async () => {
      const forged = [
        '',
        'not a cursor',
        Buffer.from('2026-01-01T00:00:00.000Z').toString('base64url'),
        Buffer.from('yesterday|3').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000Z|-3').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00+02:00|3').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000Z|3|4').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000Z|99999999999999999999').toString(
          'base64url'
        )
      ]
      for (const before of forged) {
        try {
          await store.queryHistory({ before })
        } catch (err) {
          expect(err).to.be.instanceOf(InvalidHistoryCursorError)
          continue
        }
        expect.fail(`accepted the cursor ${JSON.stringify(before)}`)
      }
    })

    it('stores an offset timestamp in the form it compares in', async () => {
      // 12:00+02:00 is 10:00Z. Stored verbatim it would sort after an entry
      // written at 11:00Z, and fall outside a window that ends at 11:00Z,
      // because the trail compares these strings byte by byte.
      await append(
        historyEntry({
          message: 'offset',
          timestamp: '2026-03-01T12:00:00+02:00'
        }),
        historyEntry({ message: 'utc', timestamp: '2026-03-01T11:00:00.000Z' })
      )

      const { entries } = await store.queryHistory({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-01T11:30:00.000Z'
      })

      expect(tags(entries)).to.deep.equal(['utc', 'offset'])
      expect(entries[1].timestamp).to.equal('2026-03-01T10:00:00.000Z')
    })

    it('refuses an entry whose timestamp is not a date', async () => {
      await expectRejection(
        append(historyEntry({ timestamp: 'the day before yesterday' })),
        'Alert history timestamp is not a valid date'
      )
    })

    it('matches nothing for an empty event type list', async () => {
      const result = await store.queryHistory({ eventType: [] })
      expect(result.entries).to.have.lengthOf(0)
    })
  })

  describe('context filter', () => {
    const alpha = asContext('vessels.urn:mrn:imo:mmsi:200000000')
    const beta = asContext('vessels.urn:mrn:imo:mmsi:200000001')

    beforeEach(async () => {
      await append(historyEntry({ message: 'alpha-1', context: alpha }))
      await append(historyEntry({ message: 'beta-1', context: beta }))
      await append(historyEntry({ message: 'own-vessel' }))
    })

    it('selects only the entries of that context', async () => {
      const { entries } = await store.queryHistory({ context: alpha })
      expect(tags(entries)).to.deep.equal(['alpha-1'])

      const other = await store.queryHistory({ context: beta })
      expect(tags(other.entries)).to.deep.equal(['beta-1'])

      expect((await store.queryHistory({})).entries).to.have.lengthOf(3)
    })
  })

  describe('query plan', () => {
    // A page has to cost the same wherever it starts. That holds only while
    // every index ends in the read order and the cursor is a range SQLite can
    // seek to; otherwise each page sorts or walks every matching entry.
    it('indexes the trail only by columns followed by the read order', () => {
      const columns = withConnection((db) =>
        db
          .prepare(
            `SELECT il.name AS name, group_concat(ii.name, ',') AS columns
               FROM pragma_index_list('history') AS il,
                    pragma_index_info(il.name) AS ii
              WHERE il.origin = 'c'
              GROUP BY il.name`
          )
          .all()
          .map((row) => String(row.columns))
      )
      expect(columns).to.not.be.empty
      for (const indexed of columns) {
        expect(indexed).to.match(/(^|,)timestamp,seq$/)
      }
    })

    it('seeks to the cursor under every filter', () => {
      const before = Buffer.from('2026-01-03T00:00:00.000Z|3').toString(
        'base64url'
      )
      const queries = [
        {},
        { alertId: 'a1' },
        { path: asPath('p1') },
        { eventType: 'escalate' as const },
        {
          eventType: [
            'raise' as const,
            'clear' as const,
            'acknowledge' as const
          ]
        }
      ]
      for (const filter of queries) {
        const { sql, params } = historySelect({ ...filter, before }, 1)
        const plan = withConnection((db) =>
          db
            .prepare(`EXPLAIN QUERY PLAN ${sql}`)
            .all(...params)
            .map((row) => String(row.detail))
            .join(' | ')
        )
        expect(plan, JSON.stringify(filter)).to.match(/timestamp<\?/)
        expect(plan, JSON.stringify(filter)).to.not.match(/\bSCAN\b/)
      }
    })
  })

  describe('page size cap', () => {
    it('caps a page at 1000 entries and hands out a cursor for the rest', async () => {
      const overCap = MAX_PAGE_SIZE + 1
      const bulk = Array.from({ length: overCap }, (_unused, index) =>
        historyEntry({
          message: `bulk-${String(index)}`,
          timestamp: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString()
        })
      )
      await append(...bulk)

      const unlimited = await store.queryHistory({})
      expect(unlimited.entries).to.have.lengthOf(MAX_PAGE_SIZE)
      // Newest first, so the single entry left out is the oldest.
      expect(tags(unlimited.entries)[0]).to.equal(`bulk-${String(overCap - 1)}`)
      expect(tags(unlimited.entries)).to.not.include('bulk-0')

      const rest = await store.queryHistory({ before: unlimited.next })
      expect(tags(rest.entries)).to.deep.equal(['bulk-0'])

      const asked = await store.queryHistory({ limit: overCap })
      expect(asked.entries).to.have.lengthOf(MAX_PAGE_SIZE)
    })
  })

  describe('query paging over a shared timestamp', () => {
    it('neither repeats nor skips an entry', async () => {
      const shared = '2026-02-01T00:00:00.000Z'
      for (let index = 0; index < 5; index++) {
        await append(
          historyEntry({
            message: `shared-${String(index)}`,
            timestamp: shared
          })
        )
      }

      const all = await store.queryHistory({})

      const paged: HistoryEntry[] = []
      let before: string | undefined
      do {
        const page = await store.queryHistory({ limit: 2, before })
        paged.push(...page.entries)
        before = page.next
      } while (before !== undefined)

      expect(paged.map((entry) => entry.id)).to.deep.equal(
        all.entries.map((entry) => entry.id)
      )
      expect(new Set(paged.map((entry) => entry.id)).size).to.equal(5)
    })
  })

  describe('prune', () => {
    it('deletes entries older than the window and reports the count', async () => {
      await append(historyEntry({ message: 'old-1', timestamp: daysAgo(100) }))
      await append(historyEntry({ message: 'old-2', timestamp: daysAgo(91) }))
      await append(historyEntry({ message: 'recent', timestamp: daysAgo(1) }))

      expect(await store.pruneHistory(90)).to.equal(2)

      const { entries } = await store.queryHistory({})
      expect(tags(entries)).to.deep.equal(['recent'])
    })

    it('returns the pages it frees to the filesystem', async () => {
      // Sized from the page size this build actually uses, so the fixture
      // frees more than one vacuum pass can reclaim whatever that size is.
      const pageSize = Number(withConnection((db) => pragma(db, 'page_size')))
      const bulky = 'x'.repeat(ROW_PAYLOAD_BYTES)
      const rows = Math.ceil(
        ((MAX_VACUUM_PAGES_PER_PRUNE + VACUUM_PASS_MARGIN_PAGES) * pageSize) /
          ROW_PAYLOAD_BYTES
      )
      for (let written = 0; written < rows; written += APPEND_BATCH) {
        await append(
          ...Array.from(
            { length: Math.min(APPEND_BATCH, rows - written) },
            (_unused, index) =>
              historyEntry({
                message: `${bulky}-${String(written + index)}`,
                timestamp: daysAgo(100)
              })
          )
        )
      }
      const bytesBefore = bytesOnDisk()
      const pagesBefore = withConnection((db) => pragma(db, 'page_count'))

      expect(await store.pruneHistory(90)).to.equal(rows)

      // One prune reclaims at most MAX_VACUUM_PAGES_PER_PRUNE pages, so a
      // trail this size comes back over more than one pass rather than
      // blocking the server for the whole of it at once.
      let passes = 1
      while (withConnection((db) => pragma(db, 'freelist_count')) !== 0) {
        expect(await store.pruneHistory(90)).to.equal(0)
        passes++
        expect(passes).to.be.below(10)
      }

      expect(passes).to.be.above(1)
      expect(withConnection((db) => pragma(db, 'page_count'))).to.be.below(
        Number(pagesBefore) / 10
      )
      // The bytes are what the SD card cares about, and the WAL is folded back
      // into the file on close.
      await store.close()
      expect(bytesOnDisk()).to.be.below(bytesBefore / 10)
    })

    it('deletes nothing when every entry is inside the window', async () => {
      await append(historyEntry({ message: 'recent', timestamp: daysAgo(1) }))

      expect(await store.pruneHistory(90)).to.equal(0)
      expect((await store.queryHistory({})).entries).to.have.lengthOf(1)
    })

    it('rejects a window that is not at least one day and keeps the entries', async () => {
      await append(historyEntry({ message: 'kept', timestamp: daysAgo(400) }))

      for (const window of [
        0,
        -5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY
      ]) {
        await expectRejection(
          store.pruneHistory(window),
          'Alert history retention must be at least one day'
        )
      }

      expect((await store.queryHistory({})).entries).to.have.lengthOf(1)
    })
  })

  describe('malformed blobs', () => {
    it('drops unreadable details rather than the entry', async () => {
      await append(
        historyEntry({ message: 'malformed', details: { reason: 'timeout' } })
      )

      withConnection((db) => {
        db.prepare('UPDATE history SET details = ? WHERE message = ?').run(
          '{not json',
          'malformed'
        )
      })

      const { entries } = await store.queryHistory({})
      expect(entries).to.have.lengthOf(1)
      const stored = entries[0]
      expect(stored.message).to.equal('malformed')
      expect(stored.eventType).to.equal('raise')
      expect(stored).to.not.have.property('details')
    })
  })
})
