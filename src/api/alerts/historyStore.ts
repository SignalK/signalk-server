/**
 * Audit trail storage.
 *
 * Shares the connection its owner opened, so an append can run inside the same
 * transaction as the active-set write it belongs to. Every method is
 * synchronous for that reason: an append that yielded could not be part of the
 * caller's transaction.
 */

import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { Context, Path, SourceRef } from '@signalk/server-api'
import { asRecord, parseJson } from './jsonColumn'
import type {
  AlertPriority,
  AlertState,
  HistoryEntry,
  HistoryEventType,
  HistoryQuery
} from './types'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Largest page the audit trail will return.
 *
 * The cap lives here rather than at the REST boundary so every caller inherits
 * it, and because the trail is the one table in this subsystem that grows.
 */
const MAX_PAGE_SIZE = 1000

interface HistoryRow {
  seq: number
  id: string
  alert_id: string
  path: string
  context: string | null
  priority: string
  message: string
  source_ref: string
  event_type: string
  timestamp: string
  user_id: string | null
  previous_state: string | null
  new_state: string | null
  previous_priority: string | null
  new_priority: string | null
  details: string | null
}

export class HistoryStore {
  private readonly appendStmt: StatementSync
  private readonly pruneStmt: StatementSync

  constructor(private readonly db: DatabaseSync) {
    this.appendStmt = db.prepare(`
      INSERT INTO history (
        id, alert_id, path, context, priority, message, source_ref,
        event_type, timestamp, user_id, previous_state, new_state,
        previous_priority, new_priority, details
      ) VALUES (
        $id, $alert_id, $path, $context, $priority, $message, $source_ref,
        $event_type, $timestamp, $user_id, $previous_state, $new_state,
        $previous_priority, $new_priority, $details
      )
    `)
    this.pruneStmt = db.prepare('DELETE FROM history WHERE timestamp < ?')
  }

  /**
   * Append one audit entry. Runs in whatever transaction the caller opened.
   */
  append(entry: Omit<HistoryEntry, 'id'>): void {
    this.appendStmt.run({
      id: crypto.randomUUID(),
      alert_id: entry.alertId,
      path: entry.path,
      context: entry.context ?? null,
      priority: entry.priority,
      message: entry.message,
      source_ref: entry.$source,
      event_type: entry.eventType,
      // Stored in the one form the trail compares in. Normalizing only the
      // query bounds would leave an offset or millisecond-less timestamp
      // sorting wrongly, and no later read can repair the row.
      timestamp: normalizeInstant('timestamp', entry.timestamp),
      user_id: entry.userId ?? null,
      previous_state: entry.previousState ?? null,
      new_state: entry.newState ?? null,
      previous_priority: entry.previousPriority ?? null,
      new_priority: entry.newPriority ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null
    })
  }

  /**
   * Query the audit trail, newest first.
   *
   * `total` counts every matching entry, ignoring `limit` and `offset`.
   *
   * Ordered by `timestamp` descending, then by insertion sequence descending.
   * Several entries appended by one transition share a millisecond, and the
   * sequence keeps them in a defined order rather than an arbitrary one — the
   * later of the two comes first, as newest-first ordering implies.
   */
  query(query: HistoryQuery): { entries: HistoryEntry[]; total: number } {
    let where = 'WHERE 1=1'
    const params: (string | number)[] = []

    if (query.alertId) {
      where += ' AND alert_id = ?'
      params.push(query.alertId)
    }
    if (query.path) {
      where += ' AND path = ?'
      params.push(query.path)
    }
    if (query.context) {
      where += ' AND context = ?'
      params.push(query.context)
    }
    if (query.eventType) {
      const types = Array.isArray(query.eventType)
        ? query.eventType
        : [query.eventType]
      where += ` AND event_type IN (${types.map(() => '?').join(', ')})`
      params.push(...types)
    }
    if (query.from !== undefined) {
      where += ' AND timestamp >= ?'
      params.push(normalizeBound('from', query.from))
    }
    if (query.to !== undefined) {
      where += ' AND timestamp <= ?'
      params.push(normalizeBound('to', query.to))
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM history ${where}`)
      .get(...params) as { cnt: number }

    const limit = resolveLimit(query.limit)
    const offset = resolvePagingValue('offset', query.offset) ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM history ${where} ORDER BY timestamp DESC, seq DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as HistoryRow[]

    return {
      entries: rows.map((row) => rowToHistoryEntry(row)),
      total: countRow.cnt
    }
  }

  /**
   * Delete entries older than the retention window.
   *
   * @returns how many entries were deleted
   */
  prune(olderThanDays: number): number {
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      throw new Error(
        `Alert history retention must be at least one day, got ${String(olderThanDays)}`
      )
    }

    const cutoff = new Date(
      Date.now() - olderThanDays * MILLISECONDS_PER_DAY
    ).toISOString()

    return Number(this.pruneStmt.run(cutoff).changes)
  }
}

/**
 * Accept any ISO 8601 instant and compare it in the form the trail stores.
 *
 * Entries are written as UTC ISO strings and compared lexicographically, so an
 * offset form such as `+02:00` would otherwise sort as though it were UTC and
 * silently return the wrong window.
 */
function normalizeBound(name: string, value: string): string {
  return normalizeInstant(`${name} bound`, value)
}

/** The UTC ISO form every timestamp in the trail is written and compared in. */
function normalizeInstant(name: string, value: string): string {
  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Alert history ${name} is not a valid date: ${JSON.stringify(value)}`
    )
  }
  return new Date(parsed).toISOString()
}

function resolveLimit(limit: number | undefined): number {
  const requested = resolvePagingValue('limit', limit)
  if (requested === undefined) {
    return MAX_PAGE_SIZE
  }
  return Math.min(requested, MAX_PAGE_SIZE)
}

/**
 * SQLite reads a negative LIMIT as no limit at all, so the value that is meant
 * to bound a response is also the one that removes the bound. Both paging
 * values are checked rather than passed through.
 */
function resolvePagingValue(
  name: string,
  value: number | undefined
): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Alert history ${name} must be a non-negative integer, got ${String(value)}`
    )
  }
  return value
}

function rowToHistoryEntry(row: HistoryRow): HistoryEntry {
  const entry: HistoryEntry = {
    id: row.id,
    alertId: row.alert_id,
    path: row.path as Path,
    priority: row.priority as AlertPriority,
    message: row.message,
    $source: row.source_ref as SourceRef,
    eventType: row.event_type as HistoryEventType,
    timestamp: row.timestamp
  }

  // Tested against null rather than truthiness, so an empty string a caller
  // stored comes back as the empty string it was.
  if (row.context !== null) {
    entry.context = row.context as Context
  }
  if (row.user_id !== null) {
    entry.userId = row.user_id
  }
  if (row.previous_state !== null) {
    entry.previousState = row.previous_state as AlertState
  }
  if (row.new_state !== null) {
    entry.newState = row.new_state as AlertState
  }
  if (row.previous_priority !== null) {
    entry.previousPriority = row.previous_priority as AlertPriority
  }
  if (row.new_priority !== null) {
    entry.newPriority = row.new_priority as AlertPriority
  }
  if (row.details !== null) {
    const parsed = asRecord(parseJson(row.details))
    if (parsed) {
      entry.details = parsed
    }
  }

  return entry
}
