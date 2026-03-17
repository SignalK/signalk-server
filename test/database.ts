import {
  DatabaseProvider,
  PluginDb,
  RunResult,
  Migration
} from '@signalk/server-api'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseApiHttpRegistry } from '../src/api/database/index'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-db-test-'))
}

function cleanUp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function mockApp(configPath: string) {
  return {
    config: { configPath },
    securityStrategy: { shouldAllowPut: () => true },
    get: () => {},
    post: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDatabaseApi: undefined as any
  }
}

function stubProvider(): DatabaseProvider {
  const stubDb: PluginDb = {
    async migrate(_m: Migration[]) {},
    async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
      return []
    },
    async run(_sql: string, _params?: unknown[]): Promise<RunResult> {
      return { changes: 0, lastInsertRowid: 0 }
    },
    async transaction<T>(fn: (tx: PluginDb) => Promise<T>): Promise<T> {
      return fn(stubDb)
    }
  }
  return {
    async getPluginDb() {
      return stubDb
    },
    async close() {}
  }
}

describe('Database API - getServerDb', () => {
  it('registry falls back to built-in when default provider lacks getServerDb', async () => {
    const dir = makeTmpDir()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registry = new DatabaseApiHttpRegistry(mockApp(dir) as any)
      registry.start()

      registry.registerDatabaseProvider('community-pg', stubProvider())

      const db = await registry.getServerDb()
      await db.migrate([
        { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' }
      ])
      const result = await db.run('INSERT INTO t (id) VALUES (?)', [1])
      assert.strictEqual(result.changes, 1)
      assert.ok(fs.existsSync(path.join(dir, 'skserver.sqlite')))

      await registry.stop()
    } finally {
      cleanUp(dir)
    }
  })

  it('provider close() releases server database', async () => {
    const dir = makeTmpDir()
    try {
      const app = mockApp(dir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registry = new DatabaseApiHttpRegistry(app as any)
      registry.start()

      await registry.getServerDb()
      assert.ok(fs.existsSync(path.join(dir, 'skserver.sqlite')))

      await registry.stop()

      // After stop, a fresh registry can open the same file (no locked file)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registry2 = new DatabaseApiHttpRegistry(app as any)
      registry2.start()
      const db = await registry2.getServerDb()
      const rows = await db.query('SELECT 1 as v')
      assert.strictEqual(rows.length, 1)
      await registry2.stop()
    } finally {
      cleanUp(dir)
    }
  })

  it('community provider without getServerDb satisfies DatabaseProvider', () => {
    const provider: DatabaseProvider = stubProvider()
    assert.strictEqual(provider.getServerDb, undefined)
    assert.strictEqual(typeof provider.getPluginDb, 'function')
    assert.strictEqual(typeof provider.close, 'function')
  })
})
