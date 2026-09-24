import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { AlertStore, inTransaction } from '../../../src/api/alerts/alertStore'
import type {
  Alert,
  AlertTransition,
  HistoryEntry
} from '../../../src/api/alerts/types'
import { asPath, asSourceRef, storedAlert } from './helpers/fixtures'

/** The mode the store must give the database file. */
const DATABASE_MODE = 0o600

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

/**
 * Assert that a promise rejects with an error whose message does NOT contain
 * `message`.
 */
async function expectRejectionWithout(
  promise: Promise<unknown>,
  message: string
) {
  try {
    await promise
  } catch (err) {
    expect((err as Error).message).to.not.include(message)
    return
  }
  expect.fail(`expected a rejection, got a resolved promise`)
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

function write(
  alert: Alert,
  history: Omit<HistoryEntry, 'id'>[] = []
): AlertTransition {
  return { alertId: alert.id, alert, history }
}

function remove(
  alertId: string,
  history: Omit<HistoryEntry, 'id'>[] = []
): AlertTransition {
  return { alertId, alert: null, history }
}

function ids(alerts: Alert[]): string[] {
  return alerts.map((alert) => alert.id).sort()
}

function only(alerts: Alert[], id: string): Alert {
  const matching = alerts.filter((alert) => alert.id === id)
  expect(matching).to.have.lengthOf(1)
  return matching[0]
}

function pragma(db: DatabaseSync, name: string): SQLOutputValue {
  const row = db.prepare(`PRAGMA ${name}`).get()
  if (!row) {
    throw new Error(`PRAGMA ${name} returned no row`)
  }
  return row[name]
}

/** Swap `process.getBuiltinModule` for the duration of `run`. */
async function withBuiltinModule(
  replacement: typeof process.getBuiltinModule | undefined,
  run: () => Promise<void>
): Promise<void> {
  const host = process as { getBuiltinModule?: typeof process.getBuiltinModule }
  const original = process.getBuiltinModule
  host.getBuiltinModule = replacement
  try {
    await run()
  } finally {
    host.getBuiltinModule = original
  }
}

/** Collect what `run` writes to console.warn. */
async function captureWarnings(run: () => Promise<void>): Promise<string[]> {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '))
  }
  try {
    await run()
  } finally {
    console.warn = original
  }
  return warnings
}

describe('AlertStore', () => {
  let tempDir: string
  let dbPath: string
  let store: AlertStore
  let extraStores: AlertStore[]

  /** Run `use` against a second connection to the database under test. */
  function withConnection<T>(use: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(dbPath)
    try {
      return use(db)
    } finally {
      db.close()
    }
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-'))
    dbPath = path.join(tempDir, 'alerts.db')
    store = new AlertStore(dbPath)
    extraStores = []
  })

  afterEach(async () => {
    for (const open of [store, ...extraStores]) {
      await open.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('initialize', () => {
    it('opens the database in WAL mode with synchronous FULL', async () => {
      await store.initialize()

      // WAL is recorded in the file header, so any connection sees it.
      expect(withConnection((db) => pragma(db, 'journal_mode'))).to.equal('wal')
      // synchronous is per-connection state no other connection can report.
      expect(store.durability()).to.deep.equal({
        journalMode: 'wal',
        synchronous: 2
      })
    })

    it('creates the database with incremental auto-vacuum', async () => {
      await store.initialize()

      // auto_vacuum is recorded in the file header, so any connection sees it,
      // and 2 is INCREMENTAL. The choice is only available while the file is
      // being created, which is why it is asserted on a fresh store.
      expect(withConnection((db) => pragma(db, 'auto_vacuum'))).to.equal(2)
    })

    it('warns when the file predates auto-vacuum and stays usable', async () => {
      // A database whose header already exists cannot change the setting.
      withConnection((db) => db.exec('CREATE TABLE placeholder (a)'))

      const warnings = await captureWarnings(() => store.initialize())

      expect(warnings.join('\n')).to.include(dbPath)
      expect(warnings.join('\n')).to.include('auto-vacuum')
      await store.commit(write(storedAlert({ id: 'still-writable' })))
      expect((await store.getAll()).map((alert) => alert.id)).to.deep.equal([
        'still-writable'
      ])
    })

    it('creates the parent directory of the database file', async () => {
      const nested = path.join(tempDir, 'serverState', 'alerts', 'alerts.db')
      expect(fs.existsSync(path.dirname(nested))).to.equal(false)
      const nestedStore = new AlertStore(nested)
      extraStores.push(nestedStore)

      await nestedStore.initialize()

      expect(fs.existsSync(nested)).to.equal(true)
    })

    it('gives the database file owner-only permissions', async () => {
      await store.initialize()

      expect(fs.statSync(dbPath).mode & 0o777).to.equal(DATABASE_MODE)
    })

    it('creates the alerts, history and schema_version tables at version 1', async () => {
      await store.initialize()

      const tables = withConnection((db) =>
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name)
      )
      expect(tables).to.include.members(['alerts', 'history', 'schema_version'])

      const versions = withConnection((db) =>
        db
          .prepare('SELECT version FROM schema_version ORDER BY version')
          .all()
          .map((row) => row.version)
      )
      expect(versions).to.deep.equal([1])
    })

    it('opens an existing database at the current version without re-migrating', async () => {
      await store.initialize()
      const alert = storedAlert({ id: 'survivor' })
      await store.commit(write(alert, [historyEntry({ alertId: alert.id })]))
      await store.close()

      const reopened = new AlertStore(dbPath)
      extraStores.push(reopened)
      await reopened.initialize()

      expect(await reopened.getAll()).to.deep.equal([alert])
      expect((await reopened.queryHistory({})).total).to.equal(1)

      const versions = withConnection((db) =>
        db
          .prepare('SELECT version FROM schema_version ORDER BY version')
          .all()
          .map((row) => row.version)
      )
      expect(versions).to.deep.equal([1])
    })

    it('is a no-op the second time, keeping the connection and the data', async () => {
      await store.initialize()
      const alert = storedAlert({ id: 'kept' })
      await store.commit(write(alert))
      const durability = store.durability()

      await store.initialize()

      expect(store.durability()).to.deep.equal(durability)
      expect(await store.getAll()).to.deep.equal([alert])
    })

    it('rejects naming the file when it is not a SQLite database', async () => {
      fs.writeFileSync(dbPath, 'this is not a SQLite database file '.repeat(8))

      await expectRejection(store.initialize(), dbPath)
      await expectRejection(store.initialize(), 'Move the file aside')
    })

    it('rejects naming the file when the schema is newer than this version', async () => {
      await store.initialize()
      await store.close()
      withConnection((db) => {
        db.prepare(
          'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
        ).run(2, new Date().toISOString())
      })

      const newer = new AlertStore(dbPath)
      extraStores.push(newer)

      await expectRejection(newer.initialize(), dbPath)
      await expectRejection(newer.initialize(), 'schema 2')
    })

    it('rejects naming the Node version when node:sqlite is unavailable', async () => {
      const original = process.getBuiltinModule
      const withoutSqlite = ((id: string) =>
        id === 'node:sqlite'
          ? undefined
          : original.call(process, id)) as typeof process.getBuiltinModule

      await withBuiltinModule(withoutSqlite, async () => {
        await expectRejection(store.initialize(), 'node:sqlite')
        await expectRejection(store.initialize(), '22.13.0')
        await expectRejection(store.initialize(), '23.4.0')
        // A Node that cannot provide the module is not a database the
        // operator should be told to move aside.
        await expectRejectionWithout(store.initialize(), 'Move the file aside')
      })
    })

    it('rejects naming the Node version when getBuiltinModule is absent', async () => {
      await withBuiltinModule(undefined, async () => {
        await expectRejection(store.initialize(), 'node:sqlite')
        await expectRejection(store.initialize(), '22.13.0')
        await expectRejection(store.initialize(), '23.4.0')
        await expectRejectionWithout(store.initialize(), 'Move the file aside')
      })
    })
  })

  describe('commit', () => {
    beforeEach(async () => {
      await store.initialize()
    })

    it('keys the row by the transition id, so a removal finds it', async () => {
      // The two ids agree for every manager-built transition. Keying the write
      // by the transition's id keeps them from ever disagreeing on disk.
      const alert = storedAlert({ id: 'other-id' })
      await store.commit({ alertId: 'transition-id', alert, history: [] })

      const stored = await store.getAll()
      expect(stored).to.have.lengthOf(1)
      expect(stored[0].id).to.equal('transition-id')

      await store.commit({ alertId: 'transition-id', alert: null, history: [] })
      expect(await store.getAll()).to.have.lengthOf(0)
    })

    it('round-trips every field of an alert', async () => {
      const alert = storedAlert({
        id: 'full-1',
        path: 'propulsion.port.oilPressureLow',
        references: [
          'propulsion.port.oilPressure',
          'propulsion.port.revolutions'
        ],
        context: 'vessels.urn:mrn:imo:mmsi:200000000',
        $source: 'n2k-on-ve.can-bus.115',
        source: {
          label: 'n2k-on-ve',
          type: 'NMEA2000',
          pgn: 127489,
          src: '115'
        },
        priority: 'emergency',
        state: 'acknowledged',
        condition: true,
        latching: true,
        silenced: true,
        silencedUntil: '2026-01-01T00:05:00.000Z',
        message: 'Oil pressure low',
        group: 'engine',
        data: { pressure: 120000, threshold: 200000, unit: 'Pa' },
        raisedAt: '2026-01-01T00:00:00.000Z',
        stateChangedAt: '2026-01-01T00:01:00.000Z',
        acknowledgedAt: '2026-01-01T00:02:00.000Z',
        acknowledgedBy: 'user-1',
        clearedAt: '2026-01-01T00:03:00.000Z',
        sourceOnline: true,
        lastSourceUpdate: '2026-01-01T00:04:00.000Z',
        stale: true
      })

      await store.commit(write(alert))

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      expect(alerts[0]).to.deep.equal(alert)
    })

    it('round-trips the flags as booleans in both directions', async () => {
      const raised = storedAlert({
        id: 'flags-true',
        path: 'stored.flagsTrue',
        condition: true,
        latching: true,
        silenced: true,
        sourceOnline: true,
        stale: true
      })
      const settled = storedAlert({
        id: 'flags-false',
        path: 'stored.flagsFalse',
        condition: false,
        latching: false,
        silenced: false,
        sourceOnline: false,
        stale: false
      })

      await store.commit(write(raised))
      await store.commit(write(settled))

      const alerts = await store.getAll()
      expect(only(alerts, 'flags-true')).to.deep.equal(raised)
      expect(only(alerts, 'flags-false')).to.deep.equal(settled)
      // deep.equal is strict, but spell out the 0/1 trap the mapping avoids.
      expect(only(alerts, 'flags-false').stale).to.equal(false)
      expect(only(alerts, 'flags-true').stale).to.equal(true)
    })

    it('leaves the optional fields absent when the alert has none', async () => {
      const alert = storedAlert({ id: 'minimal' })

      await store.commit(write(alert))

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      const stored = alerts[0]
      expect(stored).to.deep.equal(alert)
      for (const field of [
        'references',
        'context',
        'source',
        'silencedUntil',
        'group',
        'data',
        'acknowledgedAt',
        'acknowledgedBy',
        'clearedAt'
      ]) {
        expect(stored).to.not.have.property(field)
      }
    })

    it('round-trips an empty string rather than dropping the field', async () => {
      // An empty string is how a caller clears one of these fields, and it has
      // to survive the round trip as the empty string it is.
      const alert = storedAlert({
        id: 'emptied',
        group: '',
        acknowledgedBy: ''
      })

      await store.commit(write(alert))

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      expect(alerts[0]).to.have.property('group', '')
      expect(alerts[0]).to.have.property('acknowledgedBy', '')
      expect(alerts[0]).to.deep.equal(alert)
    })

    it('removes the row when the transition carries no alert', async () => {
      const alert = storedAlert({ id: 'departing', path: 'stored.departing' })
      const other = storedAlert({ id: 'staying', path: 'stored.staying' })
      await store.commit(write(alert))
      await store.commit(write(other))

      await store.commit(
        remove(alert.id, [historyEntry({ alertId: alert.id })])
      )

      expect(ids(await store.getAll())).to.deep.equal(['staying'])
      // The audit entry outlives the alert it describes.
      expect((await store.queryHistory({})).total).to.equal(1)
    })

    it('replaces an existing row rather than duplicating it', async () => {
      const alert = storedAlert({ id: 'replaced', state: 'unacknowledged' })
      await store.commit(write(alert))

      const acknowledged: Alert = {
        ...alert,
        state: 'acknowledged',
        acknowledgedAt: '2026-01-01T00:02:00.000Z',
        acknowledgedBy: 'user-1'
      }
      await store.commit(write(acknowledged))

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      expect(alerts[0]).to.deep.equal(acknowledged)
    })

    it('replaces a stale row holding the same path, keeping one alert per identity', async () => {
      // At most one alert is active per path(+context). A raise on a path whose
      // previous row outlived a failed removal has to take it over rather than
      // leave the active set with two.
      const first = storedAlert({ id: 'identity-a', path: 'stored.identity' })
      const second = storedAlert({ id: 'identity-b', path: 'stored.identity' })

      await store.commit(write(first))
      await store.commit(write(second))

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      expect(alerts[0]).to.deep.equal(second)
    })
  })

  describe('inTransaction', () => {
    /** Record the statements a transaction issues, failing the chosen ones. */
    function recorder(failOn: Set<string>) {
      const issued: string[] = []
      return {
        issued,
        exec(sql: string): void {
          issued.push(sql)
          if (failOn.has(sql)) {
            throw new Error(`${sql} refused`)
          }
        }
      }
    }

    it('commits the work it was given', () => {
      const db = recorder(new Set())

      const result = inTransaction(db, () => 'done')

      expect(result).to.equal('done')
      expect(db.issued).to.deep.equal(['BEGIN IMMEDIATE', 'COMMIT'])
    })

    it('rolls back when the work throws and reports its error', () => {
      const db = recorder(new Set())

      expect(() =>
        inTransaction(db, () => {
          throw new Error('disk is full')
        })
      ).to.throw('disk is full')

      expect(db.issued).to.deep.equal(['BEGIN IMMEDIATE', 'ROLLBACK'])
    })

    it('reports the original error when the rollback itself fails', () => {
      // SQLite rolls back by itself on a full disk, so the explicit ROLLBACK
      // fails with 'no transaction is active'. That must not be the message
      // the operator is left with.
      const db = recorder(new Set(['ROLLBACK']))

      expect(() =>
        inTransaction(db, () => {
          throw new Error('database or disk is full')
        })
      ).to.throw('database or disk is full')
    })

    it('rolls back when the commit fails', () => {
      const db = recorder(new Set(['COMMIT']))

      expect(() => inTransaction(db, () => undefined)).to.throw(
        'COMMIT refused'
      )

      expect(db.issued).to.deep.equal(['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'])
    })
  })

  describe('transaction atomicity', () => {
    beforeEach(async () => {
      await store.initialize()
    })

    it('rolls the alert row back when an audit append fails', async () => {
      const alert = storedAlert({ id: 'atomic-1' })
      const invalid = {
        ...historyEntry({ alertId: alert.id }),
        path: null
      } as unknown as Omit<HistoryEntry, 'id'>

      await expectRejection(
        store.commit(
          write(alert, [historyEntry({ alertId: alert.id }), invalid])
        ),
        'NOT NULL constraint failed: history.path'
      )

      expect(await store.getAll()).to.deep.equal([])
      expect((await store.queryHistory({})).total).to.equal(0)

      // The rollback left the connection usable.
      const next = storedAlert({ id: 'atomic-2' })
      await store.commit(write(next, [historyEntry({ alertId: next.id })]))
      expect(ids(await store.getAll())).to.deep.equal(['atomic-2'])
      expect((await store.queryHistory({})).total).to.equal(1)
    })

    it('rolls a removal back when an audit append fails', async () => {
      const alert = storedAlert({ id: 'atomic-3' })
      await store.commit(write(alert))
      const invalid = {
        ...historyEntry({ alertId: alert.id }),
        path: null
      } as unknown as Omit<HistoryEntry, 'id'>

      await expectRejection(
        store.commit(remove(alert.id, [invalid])),
        'NOT NULL constraint failed: history.path'
      )

      expect(await store.getAll()).to.deep.equal([alert])
    })
  })

  describe('malformed blobs', () => {
    beforeEach(async () => {
      await store.initialize()
    })

    it('drops an unreadable detail field rather than the alert', async () => {
      const alert = storedAlert({
        id: 'malformed-1',
        references: ['propulsion.port.oilPressure'],
        source: { label: 'n2k-on-ve' },
        data: { pressure: 120000 }
      })
      await store.commit(write(alert))

      withConnection((db) => {
        db.prepare(
          'UPDATE alerts SET references_json = ?, source_obj = ?, data = ? WHERE id = ?'
        ).run('[not json', '{not json', '{not json', alert.id)
      })

      const alerts = await store.getAll()
      expect(alerts).to.have.lengthOf(1)
      const stored = alerts[0]
      expect(stored.id).to.equal('malformed-1')
      expect(stored.message).to.equal(alert.message)
      expect(stored.priority).to.equal(alert.priority)
      expect(stored).to.not.have.property('references')
      expect(stored).to.not.have.property('source')
      expect(stored).to.not.have.property('data')
    })

    it('drops a blob that parses to something other than an object', async () => {
      const alert = storedAlert({
        id: 'malformed-2',
        source: { label: 'n2k-on-ve' },
        data: { pressure: 120000 }
      })
      await store.commit(write(alert))

      for (const blob of ['"text"', '5', 'true']) {
        withConnection((db) => {
          db.prepare(
            'UPDATE alerts SET source_obj = ?, data = ? WHERE id = ?'
          ).run(blob, blob, alert.id)
        })

        const alerts = await store.getAll()
        expect(alerts).to.have.lengthOf(1)
        expect(alerts[0].message).to.equal(alert.message)
        expect(alerts[0], `blob ${blob}`).to.not.have.property('data')
        expect(alerts[0], `blob ${blob}`).to.not.have.property('source')
      }
    })

    it('rejects an unknown state rather than guessing at it', async () => {
      const alert = storedAlert({ id: 'bad-state' })
      await store.commit(write(alert))

      withConnection((db) => {
        db.prepare('UPDATE alerts SET state = ? WHERE id = ?').run(
          'sideways',
          alert.id
        )
      })

      await expectRejection(store.getAll(), 'sideways')
      await expectRejection(store.getAll(), 'unknown state')
    })

    it('rejects an unknown priority rather than guessing at it', async () => {
      const alert = storedAlert({ id: 'bad-priority' })
      await store.commit(write(alert))

      withConnection((db) => {
        db.prepare('UPDATE alerts SET priority = ? WHERE id = ?').run(
          'catastrophic',
          alert.id
        )
      })

      await expectRejection(store.getAll(), 'catastrophic')
      await expectRejection(store.getAll(), 'unknown priority')
    })
  })

  describe('before initialize', () => {
    it('rejects every operation with a not initialized error', async () => {
      await expectRejection(store.getAll(), 'not initialized')
      await expectRejection(
        store.commit(write(storedAlert({ id: 'never-written' }))),
        'not initialized'
      )
      await expectRejection(store.queryHistory({}), 'not initialized')
      await expectRejection(store.pruneHistory(30), 'not initialized')
    })
  })

  describe('after close', () => {
    it('rejects every operation with a not initialized error', async () => {
      await store.initialize()
      await store.commit(write(storedAlert({ id: 'before-close' })))

      await store.close()

      await expectRejection(store.getAll(), 'not initialized')
      await expectRejection(
        store.commit(write(storedAlert({ id: 'after-close' }))),
        'not initialized'
      )
      await expectRejection(store.queryHistory({}), 'not initialized')
      await expectRejection(store.pruneHistory(30), 'not initialized')
    })
  })
})
