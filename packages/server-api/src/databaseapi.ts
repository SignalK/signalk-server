export interface DatabaseApi {
  getPluginDb(pluginId: string): Promise<PluginDb>
}

export interface PluginDb {
  migrate(migrations: Migration[]): Promise<void>
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<RunResult>
  transaction<T>(fn: (db: PluginDb) => Promise<T>): Promise<T>
}

export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface Migration {
  version: number
  sql: string
}

export interface DatabaseProvider {
  getPluginDb(pluginId: string): Promise<PluginDb>
  close(): Promise<void>
}

export interface DatabaseApiRegistry {
  registerDatabaseProvider(provider: DatabaseProvider): void
  unregisterDatabaseProvider(): void
}

export interface WithDatabaseApi {
  getDatabaseApi?: () => DatabaseApi
}

export interface DatabaseProviders {
  [pluginId: string]: { isDefault: boolean }
}

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
