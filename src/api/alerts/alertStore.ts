/**
 * SQLite storage for the alerts subsystem.
 *
 * Owns the single database file. The active set and the audit trail live in
 * one file on one connection, so a lifecycle transition's row write and its
 * audit appends commit as one transaction and no crash can leave the trail
 * describing an alert the active set does not have.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { Context, Path, SourceRef, Value } from '@signalk/server-api'
import { HistoryStore } from './historyStore'
import { asRecord, parseJson } from './jsonColumn'
import { ALERT_PRIORITIES, ALERT_STATES } from './types'
import type {
  Alert,
  AlertPriority,
  AlertState,
  AlertTransition,
  HistoryEntry,
  HistoryQuery,
  IAlertStore
} from './types'

const SCHEMA_VERSION = 1

/**
 * How long SQLite retries a lock held by another connection before failing.
 * WAL lets other processes open the file — a backup job, an operator running
 * sqlite3 — and a moment's contention should not cost a lifecycle write.
 */
const BUSY_TIMEOUT_MS = 5000

/**
 * The audit trail records who acknowledged what, so it is not world-readable.
 */
const DATABASE_MODE = 0o600

/** What `PRAGMA auto_vacuum` reports when the incremental mode is in force. */
const AUTO_VACUUM_INCREMENTAL = 2

/**
 * Free pages one prune hands back at most.
 *
 * At the usual 4 KiB page size this is 8 MiB of reclaim per daily prune, which
 * keeps the synchronous vacuum short enough not to be felt.
 */
export const MAX_VACUUM_PAGES_PER_PRUNE = 2000

const KNOWN_PRIORITIES: ReadonlySet<string> = new Set(ALERT_PRIORITIES)

const KNOWN_STATES: ReadonlySet<string> = new Set(ALERT_STATES)

interface AlertRow {
  id: string
  path: string
  context: string | null
  references_json: string | null
  source_ref: string
  source_obj: string | null
  priority: string
  state: string
  condition: number
  latching: number
  silenced: number
  silenced_until: string | null
  message: string
  group_name: string | null
  data: string | null
  raised_at: string
  state_changed_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  cleared_at: string | null
  source_online: number
  last_source_update: string
  stale: number
}

/**
 * Everything that exists only while the database is open. The fields are
 * created together and released together, so they cannot disagree.
 */
interface OpenDatabase {
  db: DatabaseSync
  history: HistoryStore
  writeAlert: StatementSync
  removeAlert: StatementSync
  journalMode: string
  synchronous: number
}

/**
 * The durability settings actually in force on the open connection.
 *
 * `synchronous` is per-connection state and is not recorded in the file, so
 * this is the only place it can be observed.
 */
export interface Durability {
  journalMode: string
  synchronous: number
}

/**
 * Resolve the `node:sqlite` builtin.
 *
 * The module is flagless from Node 22.13.0 and 23.4.0. On an older or flagged
 * build the import would fail deep inside startup, so it is probed here and
 * reported as the version requirement it actually is. `getBuiltinModule`
 * itself only exists from 22.3.0, which is why its absence means the same
 * thing.
 */
function loadSqlite(): typeof import('node:sqlite') {
  const sqlite =
    typeof process.getBuiltinModule === 'function'
      ? process.getBuiltinModule('node:sqlite')
      : undefined
  if (!sqlite) {
    throw new Error(
      'The alerts subsystem requires the node:sqlite module, which this Node ' +
        'build does not provide. Node 22.13.0 or later, or 23.4.0 or later, ' +
        'is required.'
    )
  }
  return sqlite
}

export class AlertStore implements IAlertStore {
  private open: OpenDatabase | null = null

  constructor(private readonly dbPath: string) {}

  /**
   * Open the database, apply the durability pragmas and migrate the schema.
   *
   * Rejects when the file cannot be opened or migrated. That is deliberately
   * fatal: a safety subsystem must not run on a store nobody can read, so the
   * error names the file and the way out.
   */
  initialize(): Promise<void> {
    if (this.open) {
      return Promise.resolve()
    }

    // Probed before the try below, so a Node too old to provide the module is
    // reported as that, not as a database this operator should move aside.
    let sqlite: typeof import('node:sqlite')
    try {
      sqlite = loadSqlite()
    } catch (error) {
      return Promise.reject(asError(error))
    }

    let db: DatabaseSync | undefined
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })

      db = new sqlite.DatabaseSync(this.dbPath)
      fs.chmodSync(this.dbPath, DATABASE_MODE)

      db.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}`)

      // Chosen before the journal mode, which writes the file header: after
      // that the setting is fixed for the life of the file. Without it a
      // pruned audit trail frees pages for reuse but never gives the bytes
      // back, so the file keeps the high-water mark of its busiest day.
      db.exec('PRAGMA auto_vacuum = INCREMENTAL')
      const autoVacuum = Number(
        (db.prepare('PRAGMA auto_vacuum').get() as { auto_vacuum?: number })
          ?.auto_vacuum ?? -1
      )
      if (autoVacuum !== AUTO_VACUUM_INCREMENTAL) {
        console.warn(
          `The alerts database at ${this.dbPath} was created without incremental ` +
            `auto-vacuum. Alerts remain durable; the file will not shrink when ` +
            `history is pruned. Move it aside and restart to reclaim the space.`
        )
      }

      // A pragma that cannot be applied reports the mode still in force in a
      // result row rather than throwing, so the result has to be read.
      const journalMode = String(
        (
          db.prepare('PRAGMA journal_mode = WAL').get() as {
            journal_mode?: string
          }
        )?.journal_mode ?? 'unknown'
      )
      if (journalMode !== 'wal') {
        console.warn(
          `The alerts database at ${this.dbPath} could not use WAL journalling ` +
            `(mode is ${journalMode}). Alerts remain durable; concurrent reads are slower.`
        )
      }

      // One fsync per lifecycle transition. Alerts are human-scale events, a
      // few writes per alarm, so the cost is negligible against an annunciated
      // alarm disappearing in a power cut.
      db.exec('PRAGMA synchronous = FULL')
      const synchronous = Number(
        (db.prepare('PRAGMA synchronous').get() as { synchronous?: number })
          ?.synchronous ?? -1
      )

      migrate(db)

      this.open = {
        db,
        history: new HistoryStore(db),
        writeAlert: db.prepare(`
          INSERT OR REPLACE INTO alerts (
            id, path, context, references_json, source_ref, source_obj,
            priority, state, condition, latching, silenced, silenced_until,
            message, group_name, data, raised_at, state_changed_at,
            acknowledged_at, acknowledged_by, cleared_at, source_online,
            last_source_update, stale
          ) VALUES (
            $id, $path, $context, $references_json, $source_ref, $source_obj,
            $priority, $state, $condition, $latching, $silenced,
            $silenced_until, $message, $group_name, $data, $raised_at,
            $state_changed_at, $acknowledged_at, $acknowledged_by, $cleared_at,
            $source_online, $last_source_update, $stale
          )
        `),
        removeAlert: db.prepare('DELETE FROM alerts WHERE id = ?'),
        journalMode,
        synchronous
      }

      return Promise.resolve()
    } catch (error) {
      // Close the half-open connection so a retry starts clean rather than
      // reporting success from the guard above.
      if (db) {
        try {
          db.close()
        } catch {
          // Nothing useful to do while unwinding a failed open.
        }
      }
      this.open = null
      return Promise.reject(openFailure(this.dbPath, error))
    }
  }

  close(): Promise<void> {
    const open = this.open
    if (!open) {
      return Promise.resolve()
    }

    try {
      open.db.close()
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(asError(error))
    } finally {
      // Released even when the close itself failed, so a retry re-opens rather
      // than reporting success on a connection nobody can use.
      this.open = null
    }
  }

  /**
   * The durability settings in force on the open connection.
   */
  durability(): Durability {
    const { journalMode, synchronous } = this.requireOpen()
    return { journalMode, synchronous }
  }

  getAll(): Promise<Alert[]> {
    try {
      const rows = this.requireOpen()
        .db.prepare('SELECT * FROM alerts')
        .all() as unknown as AlertRow[]
      return Promise.resolve(rows.map((row) => rowToAlert(row)))
    } catch (error) {
      return Promise.reject(asError(error))
    }
  }

  /**
   * Apply one lifecycle transition in a single transaction.
   */
  commit(transition: AlertTransition): Promise<void> {
    try {
      const open = this.requireOpen()

      inTransaction(open.db, () => {
        if (transition.alert) {
          // Keyed by the transition's alertId, not the alert object's, so the
          // row always lands where a later removal will look for it.
          open.writeAlert.run(alertToRow(transition.alertId, transition.alert))
        } else {
          open.removeAlert.run(transition.alertId)
        }
        for (const entry of transition.history) {
          open.history.append(entry)
        }
      })

      return Promise.resolve()
    } catch (error) {
      return Promise.reject(asError(error))
    }
  }

  queryHistory(
    query: HistoryQuery
  ): Promise<{ entries: HistoryEntry[]; total: number }> {
    try {
      return Promise.resolve(this.requireOpen().history.query(query))
    } catch (error) {
      return Promise.reject(asError(error))
    }
  }

  pruneHistory(olderThanDays: number): Promise<number> {
    try {
      const open = this.requireOpen()
      const removed = open.history.prune(olderThanDays)

      // A delete only marks pages free; this hands them back to the
      // filesystem, which is the point of pruning on a device that keeps the
      // database on an SD card.
      //
      // Bounded, because node:sqlite is synchronous: reclaiming every free
      // page of a long-neglected trail in one call would block the server,
      // annunciation included. Run on every prune rather than only on one
      // that deleted something, so the remainder comes back on later passes.
      open.db.exec(
        `PRAGMA incremental_vacuum(${String(MAX_VACUUM_PAGES_PER_PRUNE)})`
      )
      return Promise.resolve(removed)
    } catch (error) {
      return Promise.reject(asError(error))
    }
  }

  private requireOpen(): OpenDatabase {
    if (!this.open) {
      throw new Error('AlertStore not initialized. Call initialize() first.')
    }
    return this.open
  }
}

/**
 * The part of a connection a transaction needs.
 */
export type TransactionalDatabase = Pick<DatabaseSync, 'exec'>

/**
 * Run `work` inside a transaction, committing it or rolling it back.
 *
 * SQLite rolls back by itself on a full disk or an I/O error — the failures
 * this store exists to report — and the explicit ROLLBACK then fails with
 * "cannot rollback - no transaction is active". Its complaint must not replace
 * the failure the operator actually needs to see.
 */
export function inTransaction<T>(db: TransactionalDatabase, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Already rolled back by SQLite itself.
    }
    throw error
  }
}

function openFailure(dbPath: string, error: unknown): Error {
  const cause = asError(error)
  return new Error(
    `The alerts database at ${dbPath} could not be opened: ${cause.message}. ` +
      'Move the file aside and restart to begin with an empty alert store.',
    { cause }
  )
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Bring the schema up to SCHEMA_VERSION.
 */
function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const row = db
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get() as { version: number } | undefined
  const current = row?.version ?? 0

  // A file written by a later server must not be read with this version's
  // assumptions: INSERT OR REPLACE rewrites whole rows, so a column this
  // version does not know about would be erased on the first update.
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `it was written by a newer version of the alerts subsystem ` +
        `(schema ${String(current)}, this version supports ${String(SCHEMA_VERSION)})`
    )
  }

  if (current < 1) {
    migrateToV1(db)
  }
}

function migrateToV1(db: DatabaseSync): void {
  inTransaction(db, () => {
    // references, group and $source cannot be column names: the first two are
    // SQLite keywords and the third is not a bare identifier.
    db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        context TEXT,
        references_json TEXT,
        source_ref TEXT NOT NULL,
        source_obj TEXT,
        priority TEXT NOT NULL,
        state TEXT NOT NULL,
        condition INTEGER NOT NULL,
        latching INTEGER NOT NULL,
        silenced INTEGER NOT NULL,
        silenced_until TEXT,
        message TEXT NOT NULL,
        group_name TEXT,
        data TEXT,
        raised_at TEXT NOT NULL,
        state_changed_at TEXT NOT NULL,
        acknowledged_at TEXT,
        acknowledged_by TEXT,
        cleared_at TEXT,
        source_online INTEGER NOT NULL,
        last_source_update TEXT NOT NULL,
        stale INTEGER NOT NULL
      )
    `)
    // At most one active alert per path(+context) is the subsystem's identity
    // rule. Enforcing it here makes INSERT OR REPLACE self-healing: a raise on
    // a path whose old row outlived a failed removal replaces it. ifnull is
    // needed because SQLite treats NULLs in a unique index as distinct.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_identity
        ON alerts(path, ifnull(context, ''))
    `)

    // seq orders entries that share a millisecond timestamp — one transition
    // legitimately appends several, and the audit trail has to report them in
    // the order they happened.
    db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        alert_id TEXT NOT NULL,
        path TEXT NOT NULL,
        context TEXT,
        priority TEXT NOT NULL,
        message TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        user_id TEXT,
        previous_state TEXT,
        new_state TEXT,
        previous_priority TEXT,
        new_priority TEXT,
        details TEXT
      )
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_alert_id ON history(alert_id);
      CREATE INDEX IF NOT EXISTS idx_history_path ON history(path);
      CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp, seq);
      CREATE INDEX IF NOT EXISTS idx_history_event_type ON history(event_type);
    `)

    db.prepare(
      'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
    ).run(SCHEMA_VERSION, new Date().toISOString())
  })
}

/**
 * Map an alert onto its row.
 *
 * Named parameters rather than positional ones, so a column and its value
 * cannot drift apart as the shape grows.
 */
function alertToRow(
  alertId: string,
  alert: Alert
): Record<keyof AlertRow, SQLInputValue> {
  const row: Record<keyof AlertRow, SQLInputValue> = {
    id: alertId,
    path: alert.path,
    context: alert.context ?? null,
    references_json: alert.references ? JSON.stringify(alert.references) : null,
    source_ref: alert.$source,
    source_obj: alert.source ? JSON.stringify(alert.source) : null,
    priority: alert.priority,
    state: alert.state,
    condition: alert.condition ? 1 : 0,
    latching: alert.latching ? 1 : 0,
    silenced: alert.silenced ? 1 : 0,
    silenced_until: alert.silencedUntil ?? null,
    message: alert.message,
    group_name: alert.group ?? null,
    data: alert.data ? JSON.stringify(alert.data) : null,
    raised_at: alert.raisedAt,
    state_changed_at: alert.stateChangedAt,
    acknowledged_at: alert.acknowledgedAt ?? null,
    acknowledged_by: alert.acknowledgedBy ?? null,
    cleared_at: alert.clearedAt ?? null,
    source_online: alert.sourceOnline ? 1 : 0,
    last_source_update: alert.lastSourceUpdate,
    stale: alert.stale ? 1 : 0
  }
  return row
}

function rowToAlert(row: AlertRow): Alert {
  // These two drive the state machine, so a value it cannot handle is a store
  // this server must not run on rather than an alert to guess at.
  if (!KNOWN_PRIORITIES.has(row.priority)) {
    throw new Error(
      `alert ${row.id} has an unknown priority ${JSON.stringify(row.priority)}`
    )
  }
  if (!KNOWN_STATES.has(row.state)) {
    throw new Error(
      `alert ${row.id} has an unknown state ${JSON.stringify(row.state)}`
    )
  }

  const alert: Alert = {
    id: row.id,
    path: row.path as Path,
    $source: row.source_ref as SourceRef,
    priority: row.priority as AlertPriority,
    state: row.state as AlertState,
    condition: row.condition === 1,
    latching: row.latching === 1,
    silenced: row.silenced === 1,
    message: row.message,
    raisedAt: row.raised_at,
    stateChangedAt: row.state_changed_at,
    sourceOnline: row.source_online === 1,
    lastSourceUpdate: row.last_source_update,
    stale: row.stale === 1
  }

  // Tested against null rather than truthiness: an empty string is how a
  // caller clears one of these fields, and it has to survive a restart.
  if (row.context !== null) {
    alert.context = row.context as Context
  }
  if (row.references_json !== null) {
    const parsed = parseJson(row.references_json)
    if (Array.isArray(parsed)) {
      alert.references = parsed as Path[]
    }
  }
  if (row.source_obj !== null) {
    const parsed = asRecord(parseJson(row.source_obj))
    if (parsed) {
      alert.source = parsed
    }
  }
  if (row.silenced_until !== null) {
    alert.silencedUntil = row.silenced_until
  }
  if (row.group_name !== null) {
    alert.group = row.group_name
  }
  if (row.data !== null) {
    const parsed = asRecord(parseJson(row.data))
    if (parsed) {
      alert.data = parsed as Record<string, Value>
    }
  }
  if (row.acknowledged_at !== null) {
    alert.acknowledgedAt = row.acknowledged_at
  }
  if (row.acknowledged_by !== null) {
    alert.acknowledgedBy = row.acknowledged_by
  }
  if (row.cleared_at !== null) {
    alert.clearedAt = row.cleared_at
  }

  return alert
}
