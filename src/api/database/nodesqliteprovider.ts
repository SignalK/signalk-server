import path from 'path'
import fs from 'fs'
import {
  DatabaseProvider,
  PluginDb,
  RunResult,
  Migration
} from '@signalk/server-api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseSync = any

let SqliteDatabase: (new (path: string) => DatabaseSync) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlite = require('node:sqlite')
  SqliteDatabase = sqlite.DatabaseSync
} catch {
  // node:sqlite not available
}

export function isNodeSqliteAvailable(): boolean {
  return SqliteDatabase !== undefined
}

export class NodeSqliteProvider implements DatabaseProvider {
  private databases: Map<string, DatabaseSync> = new Map()
  private pluginDbs: Map<string, PluginDb> = new Map()
  private dbDir: string

  constructor(configPath: string) {
    if (!SqliteDatabase) {
      throw new Error('node:sqlite is not available in this Node.js version')
    }
    this.dbDir = path.join(configPath, 'plugin-db')
    fs.mkdirSync(this.dbDir, { recursive: true })
  }

  async getPluginDb(pluginId: string): Promise<PluginDb> {
    const cached = this.pluginDbs.get(pluginId)
    if (cached) {
      return cached
    }

    const dbPath = path.join(this.dbDir, `${pluginId}.db`)
    const db = new SqliteDatabase!(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    this.databases.set(pluginId, db)

    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`)

    const pluginDb = createPluginDb(db)
    this.pluginDbs.set(pluginId, pluginDb)
    return pluginDb
  }

  async close(): Promise<void> {
    for (const db of this.databases.values()) {
      db.close()
    }
    this.databases.clear()
    this.pluginDbs.clear()
  }
}

function queryAll<T>(db: DatabaseSync, sql: string, params?: unknown[]): T[] {
  const stmt = db.prepare(sql)
  return params && params.length > 0 ? stmt.all(...params) : stmt.all()
}

function runStmt(db: DatabaseSync, sql: string, params?: unknown[]): RunResult {
  const stmt = db.prepare(sql)
  const result = params && params.length > 0 ? stmt.run(...params) : stmt.run()
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
  }
}

function createPluginDb(db: DatabaseSync): PluginDb {
  const pluginDb: PluginDb = {
    async migrate(migrations: Migration[]): Promise<void> {
      const applied = new Set(
        queryAll<{ version: number }>(
          db,
          'SELECT version FROM _migrations'
        ).map((row) => row.version)
      )
      const sorted = [...migrations].sort((a, b) => a.version - b.version)
      for (const m of sorted) {
        if (applied.has(m.version)) continue
        db.exec(m.sql)
        db.prepare(
          'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)'
        ).run(m.version, new Date().toISOString())
      }
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> {
      return queryAll<T>(db, sql, params)
    },

    async run(sql: string, params?: unknown[]): Promise<RunResult> {
      return runStmt(db, sql, params)
    },

    async transaction<T>(fn: (tx: PluginDb) => Promise<T>): Promise<T> {
      db.exec('BEGIN')
      try {
        const result = await fn(pluginDb)
        db.exec('COMMIT')
        return result
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  }
  return pluginDb
}
