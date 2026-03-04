/**
 * The Database API provides plugins with access to a server-managed
 * relational database. Each plugin receives its own isolated database
 * — a plugin cannot access another plugin's data.
 *
 * The server ships two built-in providers:
 * - `_builtin` — SQLite via better-sqlite3 (always available, default)
 * - `_builtin_nodesqlite` — SQLite via node:sqlite (when available)
 *
 * Community plugins can register alternative providers (e.g. PostgreSQL).
 *
 * @category Database API
 */
export interface DatabaseApi {
  /**
   * Returns an isolated database handle for the given plugin.
   * Each plugin gets its own database file at
   * `{configPath}/plugin-db/{pluginId}.db`.
   *
   * The handle is cached — calling this multiple times with the same
   * pluginId returns the same instance.
   *
   * @param pluginId - The plugin's unique identifier (typically `plugin.id`).
   * @returns A promise that resolves to a {@link PluginDb} instance.
   */
  getPluginDb(pluginId: string): Promise<PluginDb>
}

/**
 * Database handle for a single plugin. Provides methods to run
 * migrations, query data, execute statements, and wrap operations
 * in transactions.
 *
 * All methods are async to support both synchronous backends
 * (better-sqlite3, node:sqlite) and async backends (PostgreSQL).
 *
 * @category Database API
 */
export interface PluginDb {
  /**
   * Apply schema migrations in order. The provider tracks which
   * migrations have already been applied (in a `_migrations` table)
   * and skips them on subsequent starts. Forward-only — no
   * down-migrations.
   *
   * @param migrations - Array of {@link Migration} objects to apply.
   *
   * @example
   * ```javascript
   * await db.migrate([
   *   {
   *     version: 1,
   *     sql: `CREATE TABLE IF NOT EXISTS settings (
   *       key TEXT PRIMARY KEY,
   *       value TEXT
   *     )`
   *   },
   *   {
   *     version: 2,
   *     sql: `ALTER TABLE settings ADD COLUMN updated_at TEXT`
   *   }
   * ])
   * ```
   */
  migrate(migrations: Migration[]): Promise<void>

  /**
   * Execute a SQL query and return typed rows.
   *
   * @param sql - SQL SELECT statement.
   * @param params - Optional array of bind parameters.
   * @returns Array of result rows.
   *
   * @example
   * ```javascript
   * const rows = await db.query('SELECT * FROM settings WHERE key = ?', ['theme'])
   * ```
   */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE) and return
   * the number of affected rows and the last inserted row ID.
   *
   * @param sql - SQL statement to execute.
   * @param params - Optional array of bind parameters.
   * @returns A {@link RunResult} with `changes` and `lastInsertRowid`.
   *
   * @example
   * ```javascript
   * const result = await db.run(
   *   'INSERT INTO settings (key, value) VALUES (?, ?)',
   *   ['theme', 'dark']
   * )
   * console.log(result.changes) // 1
   * ```
   */
  run(sql: string, params?: unknown[]): Promise<RunResult>

  /**
   * Execute multiple statements atomically. If the callback throws,
   * the transaction is rolled back. On success, it is committed.
   *
   * @param fn - Async function that receives the same {@link PluginDb}
   *   handle and performs operations within the transaction.
   * @returns The value returned by the callback function.
   *
   * @example
   * ```javascript
   * await db.transaction(async (tx) => {
   *   await tx.run('INSERT INTO log (msg) VALUES (?)', ['start'])
   *   await tx.run('INSERT INTO log (msg) VALUES (?)', ['end'])
   * })
   * ```
   */
  transaction<T>(fn: (db: PluginDb) => Promise<T>): Promise<T>
}

/**
 * Result of executing a SQL statement via {@link PluginDb.run}.
 * @category Database API
 */
export interface RunResult {
  /** Number of rows affected by the statement. */
  changes: number
  /** Row ID of the last inserted row (SQLite ROWID). */
  lastInsertRowid: number | bigint
}

/**
 * A forward-only schema migration. Migrations are tracked by version
 * number in a `_migrations` table within each plugin's database.
 * @category Database API
 */
export interface Migration {
  /** Monotonically increasing version number. */
  version: number
  /** DDL statement(s) to apply for this version. */
  sql: string
}

/**
 * Interface that a database provider plugin must implement.
 * Providers supply the actual database backend (e.g. SQLite, PostgreSQL).
 *
 * @see {@link DatabaseApiRegistry.registerDatabaseProvider} for how to register a provider.
 * @category Database API
 */
export interface DatabaseProvider {
  /**
   * Returns an isolated database handle for the given plugin.
   * @param pluginId - The plugin's unique identifier.
   */
  getPluginDb(pluginId: string): Promise<PluginDb>

  /**
   * Close all database connections managed by this provider.
   * Called by the server during shutdown.
   */
  close(): Promise<void>
}

/**
 * Server-side registry for database providers. Plugins that provide
 * an alternative database backend (e.g. PostgreSQL) use these methods
 * to register and unregister themselves.
 * @category Database API
 */
export interface DatabaseApiRegistry {
  /**
   * Register a custom database provider. The provider becomes available
   * immediately and is set as the default if no external provider is
   * currently registered.
   *
   * @param provider - A {@link DatabaseProvider} implementation.
   */
  registerDatabaseProvider(provider: DatabaseProvider): void

  /**
   * Unregister the previously registered database provider.
   * The server falls back to the built-in SQLite provider.
   */
  unregisterDatabaseProvider(): void
}

/**
 * Mixin interface for accessing the Database API from a plugin.
 * Added to {@link @signalk/server-api!ServerAPI}.
 *
 * Optional on the interface because the app object is constructed
 * before providers are initialized (matches `WithHistoryApi` pattern).
 * Always available at runtime once the server has started.
 *
 * @category Database API
 */
export interface WithDatabaseApi {
  /**
   * Returns the Database API instance. Use this to obtain a
   * per-plugin database handle via `getDatabaseApi().getPluginDb(plugin.id)`.
   */
  getDatabaseApi?: () => DatabaseApi
}

/**
 * @hidden visible through ServerAPI
 * @category Database API
 */
export interface DatabaseProviders {
  [pluginId: string]: { isDefault: boolean }
}

/**
 * Type guard to check if an object implements the {@link DatabaseProvider} interface.
 * @category Database API
 */
export function isDatabaseProvider(
  provider: unknown
): provider is DatabaseProvider {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    typeof (provider as DatabaseProvider).getPluginDb === 'function' &&
    typeof (provider as DatabaseProvider).close === 'function'
  )
}
