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
import { InvalidHistoryCursorError } from './errors'
import { asRecord, parseJson } from './jsonColumn'
import type {
  AlertPriority,
  AlertState,
  HistoryEntry,
  HistoryEventType,
  HistoryPage,
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
   * Ordered by `timestamp` descending, then by insertion sequence descending.
   * Several entries appended by one transition share a millisecond, and the
   * sequence keeps them in a defined order rather than an arbitrary one — the
   * later of the two comes first, as newest-first ordering implies.
   */
  query(query: HistoryQuery): HistoryPage {
    const limit = resolveLimit(query.limit)

    // One row past the page says whether another page exists without a count.
    const { sql, params } = historySelect(query, limit + 1)
    const rows = this.db.prepare(sql).all(...params) as unknown as HistoryRow[]

    const pageRows = rows.slice(0, limit)
    const page: HistoryPage = {
      entries: pageRows.map((row) => rowToHistoryEntry(row))
    }
    const last = pageRows.at(-1)
    if (rows.length > limit && last) {
      page.next = encodeCursor(last)
    }
    return page
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
 * The statement that reads one page of the audit trail.
 *
 * Pages resume from the last entry's `(timestamp, seq)`. The row-value
 * comparison is what lets SQLite start the index walk at the cursor; the
 * equivalent `timestamp < ? OR (timestamp = ? AND seq < ?)` is not turned into
 * a range, so every page would walk the index from the newest entry.
 */
export function historySelect(
  query: HistoryQuery,
  rowLimit: number
): { sql: string; params: (string | number)[] } {
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
  if (query.before !== undefined) {
    const cursor = decodeCursor(query.before)
    where += ' AND (timestamp, seq) < (?, ?)'
    params.push(cursor.timestamp, cursor.seq)
  }

  params.push(rowLimit)
  return {
    sql: `SELECT * FROM history ${where} ORDER BY timestamp DESC, seq DESC LIMIT ?`,
    params
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

/**
 * SQLite reads a negative LIMIT as no limit at all, so the value that is meant
 * to bound a response is also the one that removes the bound. It is checked
 * rather than passed through.
 */
function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return MAX_PAGE_SIZE
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(
      `Alert history limit must be a non-negative integer, got ${String(limit)}`
    )
  }
  return Math.min(limit, MAX_PAGE_SIZE)
}

const CURSOR_SEPARATOR = '|'

/**
 * The position of an entry in the trail's order, encoded so clients pass it
 * back without reading it.
 */
function encodeCursor(row: HistoryRow): string {
  return Buffer.from(
    `${row.timestamp}${CURSOR_SEPARATOR}${String(row.seq)}`
  ).toString('base64url')
}

function decodeCursor(cursor: string): { timestamp: string; seq: number } {
  const [timestamp, seqText, ...rest] = Buffer.from(cursor, 'base64url')
    .toString()
    .split(CURSOR_SEPARATOR)
  const seq = Number(seqText)
  // The timestamp has to be in the stored form, or the text comparison would
  // place the cursor somewhere other than the entry it came from.
  if (
    rest.length > 0 ||
    timestamp === undefined ||
    !/^\d+$/.test(seqText ?? '') ||
    !Number.isSafeInteger(seq) ||
    !isStoredInstant(timestamp)
  ) {
    throw new InvalidHistoryCursorError()
  }
  return { timestamp, seq }
}

function isStoredInstant(value: string): boolean {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
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
