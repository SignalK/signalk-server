---
title: Database Providers
---

# Database Provider Plugins

The Signal K server [Database API](../rest-api/database_api.md) provides plugins with access to a server-managed relational database. The actual storage backend is implemented by a **provider plugin**.

The server ships two built-in SQLite providers (`_builtin_nodesqlite` via node:sqlite, `_builtin` via better-sqlite3). A database provider plugin can register an alternative backend — for example PostgreSQL — to replace or supplement the built-in providers.

---

## Database Provider Interface

For a plugin to be a database provider it must implement the {@link @signalk/server-api!DatabaseProvider | `DatabaseProvider`} interface:

```typescript
export interface DatabaseProvider {
  getPluginDb(pluginId: string): Promise<PluginDb>
  getServerDb?(): Promise<PluginDb>
  close(): Promise<void>
}
```

`getServerDb()` is optional. When implemented, the server uses it for its own internal storage (`skserver.sqlite`). If omitted, the server falls back to a built-in SQLite provider for internal storage. Both methods return the same {@link @signalk/server-api!PluginDb | `PluginDb`} handle.

The provider must return a `PluginDb` handle that implements:

- `migrate(migrations)` — Apply schema migrations, tracking applied versions
- `query(sql, params)` — Execute a SELECT and return rows
- `run(sql, params)` — Execute INSERT/UPDATE/DELETE and return `{ changes, lastInsertRowid }`
- `transaction(fn)` — Execute a callback atomically with rollback on error

## Registering a Database Provider

A plugin registers itself as a database provider by calling the server's {@link @signalk/server-api!DatabaseProviderRegistry.registerDatabaseProvider | `registerDatabaseProvider`} function during startup.

Do this within the plugin `start()` method.

_Example:_

```javascript
module.exports = function (app) {
  const plugin = {
    id: 'signalk-database-postgres',
    name: 'PostgreSQL Database Provider'
  }

  let provider

  plugin.start = function (options) {
    provider = new PostgresProvider(options)
    app.registerDatabaseProvider(provider)
  }

  plugin.stop = function () {
    app.unregisterDatabaseProvider()
  }

  plugin.schema = {
    type: 'object',
    properties: {
      connectionString: {
        type: 'string',
        title: 'PostgreSQL connection string'
      }
    }
  }

  return plugin
}
```

When a provider is registered, it becomes the default provider. When unregistered (e.g. plugin stopped), the server falls back to the best available built-in provider.

> [!NOTE]
> Only one external database provider can be registered at a time. Registering a new provider replaces the previous one.

---

## Implementation Requirements

A database provider MUST:

1. **Isolate plugins from each other** — each `pluginId` must receive a separate database or schema. Plugins must not be able to read or write each other's data.

2. **Track migrations** — maintain a record of applied migration versions per plugin. The `migrate()` method must skip versions already applied and apply new ones in order.

3. **Support parameterized queries** — the `params` array must be bound safely (no string interpolation) to prevent SQL injection.

4. **Implement transactions** — the `transaction()` method must execute the callback atomically. If the callback throws, all changes within the transaction must be rolled back.

5. **Return correct `RunResult`** — the `run()` method must return `{ changes, lastInsertRowid }` where `changes` is the number of affected rows and `lastInsertRowid` is the row ID of the last INSERT.

6. **Handle `close()` gracefully** — the server calls `close()` during shutdown. The provider must release all connections and resources.

---

## SQL Portability

Plugin authors typically write SQLite-compatible SQL. If your provider uses a different database engine (e.g. PostgreSQL), be aware that:

- `INTEGER PRIMARY KEY AUTOINCREMENT` is SQLite-specific (PostgreSQL uses `SERIAL` or `GENERATED ALWAYS AS IDENTITY`)
- `REAL` type maps to `DOUBLE PRECISION` in PostgreSQL
- `JSON` column type and functions differ between engines
- SQLite's `ROWID` behavior has no direct PostgreSQL equivalent

A provider targeting PostgreSQL may need to translate common SQLite patterns. This is the provider's responsibility — consumer plugins should not need to change their SQL.
