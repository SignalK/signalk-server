import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import {
  DatabaseProvider,
  PluginDb,
  RunResult,
  Migration
} from '@signalk/server-api'

export class SqliteProvider implements DatabaseProvider {
  private databases: Map<string, Database.Database> = new Map()
  private pluginDbs: Map<string, PluginDb> = new Map()
  private dbDir: string

  constructor(configPath: string) {
    this.dbDir = path.join(configPath, 'plugin-db')
    fs.mkdirSync(this.dbDir, { recursive: true })
  }

  async getPluginDb(pluginId: string): Promise<PluginDb> {
    const cached = this.pluginDbs.get(pluginId)
    if (cached) {
      return cached
    }

    const dbPath = path.join(this.dbDir, `${pluginId}.db`)
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
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

function queryAll<T>(
  db: Database.Database,
  sql: string,
  params?: unknown[]
): T[] {
  return db.prepare(sql).all(...(params ?? [])) as T[]
}

function runStmt(
  db: Database.Database,
  sql: string,
  params?: unknown[]
): RunResult {
  const result = db.prepare(sql).run(...(params ?? []))
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
  }
}

function createPluginDb(db: Database.Database): PluginDb {
  const pluginDb: PluginDb = {
    async migrate(migrations: Migration[]): Promise<void> {
      const applied = new Set(
        queryAll<{ version: number }>(
          db,
          'SELECT version FROM _migrations'
        ).map((row) => row.version)
      )
      const sorted = [...migrations].sort((a, b) => a.version - b.version)
      const applyMigration = db.transaction((m: Migration) => {
        db.exec(m.sql)
        db.prepare(
          'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)'
        ).run(m.version, new Date().toISOString())
      })
      for (const m of sorted) {
        if (!applied.has(m.version)) {
          applyMigration(m)
        }
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
