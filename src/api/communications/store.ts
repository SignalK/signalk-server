import { DatabaseSync } from 'node:sqlite'
import * as uuid from 'uuid'
import {
  DispositionPatch,
  MessageLogEntry,
  MessageLogEntryInput,
  MessageLogQuery,
  MessageLogStore,
  MessagePriority,
  MessageTransport,
  MessageType
} from '@signalk/server-api'
import { createDebug } from '../../debug'

const debug = createDebug('signalk-server:api:communications')

const SCHEMA_VERSION = 1

// node:sqlite is synchronous, so an unbounded query blocks the event loop while
// it scans and parses every row of a long-lived log. Cap the result set.
const DEFAULT_QUERY_LIMIT = 100
const MAX_QUERY_LIMIT = 1000

// received_at is TEXT compared lexicographically (range filters + ORDER BY), so
// it must be canonical UTC ISO-8601 (…Z). External parsers may supply offsets or
// junk; coerce to canonical UTC, falling back to server time when unparseable.
function toCanonicalUtc(value: string | undefined): string {
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

// Query bounds are compared against the canonical received_at, so they must be
// canonicalised the same way. Unlike append, a bad bound is a caller error, not
// something to coerce to "now" — reject it rather than silently shifting the range.
function toCanonicalBound(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid time bound: ${value}`)
  }
  return parsed.toISOString()
}

interface Row {
  id: string
  type: string
  received_at: string
  source_ref: string | null
  transport: string | null
  priority: string
  sender_mmsi: string | null
  sender: string
  subject: string | null
  position_lat: number | null
  position_lon: number | null
  summary: string
  payload: string
  raw: string
  notification_id: string | null
  acknowledged_at: string | null
  cleared_at: string | null
}

export class SqliteMessageLogStore implements MessageLogStore {
  private db: DatabaseSync
  private closed = false

  constructor(dbFilePath: string) {
    debug.enabled && debug(`Opening message-log database at ${dbFilePath}`)
    this.db = new DatabaseSync(dbFilePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      )
    `)
    const row = this.db
      .prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as { version: number } | undefined
    if (!row) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS message_log (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          received_at TEXT NOT NULL,
          source_ref TEXT,
          transport TEXT,
          priority TEXT NOT NULL,
          sender_mmsi TEXT,
          sender TEXT NOT NULL,
          subject TEXT,
          position_lat REAL,
          position_lon REAL,
          summary TEXT NOT NULL,
          payload TEXT NOT NULL,
          raw TEXT NOT NULL,
          notification_id TEXT,
          acknowledged_at TEXT,
          cleared_at TEXT
        )
      `)
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_message_log_received_at ON message_log(received_at)'
      )
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_message_log_type ON message_log(type)'
      )
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_message_log_priority ON message_log(priority)'
      )
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_message_log_sender_mmsi ON message_log(sender_mmsi)'
      )
      this.db
        .prepare('INSERT INTO schema_version (version) VALUES (?)')
        .run(SCHEMA_VERSION)
    }
  }

  async append(entry: MessageLogEntryInput): Promise<MessageLogEntry> {
    const id = uuid.v4()
    const receivedAt = toCanonicalUtc(entry.receivedAt)
    this.db
      .prepare(
        `INSERT INTO message_log (
          id, type, received_at, source_ref, transport, priority,
          sender_mmsi, sender, subject, position_lat, position_lon,
          summary, payload, raw, notification_id, acknowledged_at, cleared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        entry.type,
        receivedAt,
        entry.sourceRef ?? null,
        entry.transport ?? null,
        entry.priority,
        entry.sender?.mmsi ?? null,
        JSON.stringify(entry.sender ?? {}),
        entry.subject ? JSON.stringify(entry.subject) : null,
        entry.position?.latitude ?? null,
        entry.position?.longitude ?? null,
        entry.summary,
        JSON.stringify(entry.payload ?? null),
        entry.raw,
        entry.notificationId ?? null,
        null,
        null
      )
    return (await this.get(id)) as MessageLogEntry
  }

  async get(id: string): Promise<MessageLogEntry | undefined> {
    const row = this.db
      .prepare('SELECT * FROM message_log WHERE id = ?')
      .get(id) as Row | undefined
    return row ? this.rowToEntry(row) : undefined
  }

  async query(filter: MessageLogQuery): Promise<MessageLogEntry[]> {
    const clauses: string[] = []
    const params: Array<string | number> = []
    if (filter.from) {
      clauses.push('received_at >= ?')
      params.push(toCanonicalBound(filter.from))
    }
    if (filter.to) {
      clauses.push('received_at <= ?')
      params.push(toCanonicalBound(filter.to))
    }
    if (filter.type) {
      clauses.push('type = ?')
      params.push(filter.type)
    }
    if (filter.priority) {
      clauses.push('priority = ?')
      params.push(filter.priority)
    }
    if (filter.sender) {
      clauses.push('sender_mmsi = ?')
      params.push(filter.sender)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = filter.order === 'asc' ? 'ASC' : 'DESC'
    const limit =
      typeof filter.limit === 'number' && filter.limit > 0
        ? Math.min(filter.limit, MAX_QUERY_LIMIT)
        : DEFAULT_QUERY_LIMIT
    const sql = `SELECT * FROM message_log ${where} ORDER BY received_at ${order} LIMIT ?`
    params.push(limit)
    const rows = this.db.prepare(sql).all(...params) as unknown as Row[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async update(
    id: string,
    patch: DispositionPatch
  ): Promise<MessageLogEntry | undefined> {
    const existing = await this.get(id)
    if (!existing) {
      return undefined
    }
    const acknowledgedAt =
      patch.acknowledgedAt ?? existing.disposition.acknowledgedAt ?? null
    const clearedAt = patch.clearedAt ?? existing.disposition.clearedAt ?? null
    this.db
      .prepare(
        'UPDATE message_log SET acknowledged_at = ?, cleared_at = ? WHERE id = ?'
      )
      .run(acknowledgedAt, clearedAt, id)
    return this.get(id)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  private rowToEntry(row: Row): MessageLogEntry {
    const disposition: MessageLogEntry['disposition'] = {}
    if (row.acknowledged_at) disposition.acknowledgedAt = row.acknowledged_at
    if (row.cleared_at) disposition.clearedAt = row.cleared_at
    return {
      id: row.id,
      type: row.type as MessageType,
      receivedAt: row.received_at,
      sourceRef: row.source_ref ?? undefined,
      transport: (row.transport as MessageTransport) ?? undefined,
      priority: row.priority as MessagePriority,
      sender: JSON.parse(row.sender),
      subject: row.subject ? JSON.parse(row.subject) : undefined,
      position:
        row.position_lat !== null && row.position_lon !== null
          ? { latitude: row.position_lat, longitude: row.position_lon }
          : undefined,
      summary: row.summary,
      payload: JSON.parse(row.payload),
      raw: row.raw,
      notificationId: row.notification_id ?? undefined,
      disposition
    }
  }
}
