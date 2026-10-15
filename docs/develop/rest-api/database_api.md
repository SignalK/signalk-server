---
title: Database API
---

# Database API

The _Database API_ provides plugins with access to a server-managed relational database for persisting structured data — configuration, metadata, buffered records, device registrations, etc.

Each plugin receives its own isolated database. A plugin cannot access another plugin's data. The server manages the database lifecycle (connections, file paths, shutdown) — plugins never open database files directly.

The actual storage backend is pluggable. The server ships two built-in SQLite providers and supports community-provided alternatives (e.g. PostgreSQL).

The API is available under the path `/signalk/v2/api/database`.

---

## Plugin Usage

Plugins access the Database API through the server's `getDatabaseApi()` method. This is the **consumer** interface — most plugins will use this.

### Getting a Database Handle

```javascript
const db = await app.getDatabaseApi().getPluginDb(plugin.id)
```

The returned {@link @signalk/server-api!PluginDb | `PluginDb`} handle is cached — calling `getPluginDb()` multiple times with the same plugin ID returns the same instance.

### Running Migrations

Use `migrate()` to create or update your schema. Migrations are tracked by version number and only applied once. Always call this before querying.

```javascript
await db.migrate([
  {
    version: 1,
    sql: `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  },
  {
    version: 2,
    sql: `ALTER TABLE settings ADD COLUMN updated_at TEXT`
  }
])
```

### Querying Data

```javascript
const rows = await db.query('SELECT * FROM settings WHERE key = ?', ['theme'])
// rows: [{ key: 'theme', value: 'dark', updated_at: '2026-03-05T...' }]
```

### Inserting, Updating, Deleting

```javascript
const result = await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
  'theme',
  'dark'
])
console.log(result.changes) // 1
console.log(result.lastInsertRowid) // row ID
```

### Transactions

```javascript
await db.transaction(async (tx) => {
  await tx.run('DELETE FROM settings WHERE key = ?', ['old_key'])
  await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
    'new_key',
    'value'
  ])
})
// If either statement fails, both are rolled back.
```

### Complete Plugin Example

```javascript
module.exports = function (app) {
  let db
  const plugin = {
    id: 'my-plugin',
    name: 'My Plugin'
  }

  plugin.start = function (options) {
    app
      .getDatabaseApi()
      .getPluginDb(plugin.id)
      .then((pluginDb) => {
        db = pluginDb
        return db.migrate([
          {
            version: 1,
            sql: `CREATE TABLE IF NOT EXISTS buffer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`
          }
        ])
      })
      .catch((err) => {
        app.error('Failed to initialize database: ' + err)
      })

    // Use db in intervals or event handlers — guard against async init
    setInterval(() => {
      if (!db) return
      db.query('SELECT COUNT(*) as count FROM buffer').then((rows) => {
        app.setPluginStatus(`${rows[0].count} records buffered`)
      })
    }, 30000)
  }

  plugin.stop = function () {
    // No db.close() needed — the server manages the database lifecycle.
  }

  return plugin
}
```

> [!NOTE]
> The `getDatabaseApi().getPluginDb()` call is **async**. If your plugin uses `setInterval` or event-driven callbacks, you must guard against the database handle not being ready yet: `if (!db) return`.

---

## What This API Is Not For

The Database API is for **plugin-owned structured data** — configuration, metadata, buffered records. It is NOT for:

- **Time-series data** — use the [History API](./history_api.md)
- **Routes, waypoints, charts** — use the [Resources API](./resources_api.md)
- **Opening external SQLite files** (e.g. MBTiles) — those require direct file access outside this API's scope

---

## Providers

The Database API supports multiple provider backends. The server ships two built-in providers:

| Provider ID           | Backend                     | Availability               | Default when                   |
| --------------------- | --------------------------- | -------------------------- | ------------------------------ |
| `_builtin_nodesqlite` | SQLite via `node:sqlite`    | Node.js >= 22.5.0          | `node:sqlite` is available     |
| `_builtin`            | SQLite via `better-sqlite3` | When native addon compiles | `node:sqlite` is not available |

Community plugins can register alternative providers (e.g. PostgreSQL). See [Database Provider Plugins](../plugins/database_provider_plugins.md).

### Listing Available Providers

To retrieve a list of registered database providers, submit an HTTP `GET` request to `/signalk/v2/api/database/_providers`.

_Example:_

```typescript
HTTP GET "/signalk/v2/api/database/_providers"
```

_Response:_

```JSON
{
  "_builtin_nodesqlite": {
    "isDefault": true
  },
  "_builtin": {
    "isDefault": false
  }
}
```

### Getting the Default Provider

To get the id of the _default_ provider, submit an HTTP `GET` request to `/signalk/v2/api/database/_providers/_default`.

_Example:_

```typescript
HTTP GET "/signalk/v2/api/database/_providers/_default"
```

_Response:_

```JSON
{
  "id": "_builtin_nodesqlite"
}
```

### Setting the Default Provider

To change the default database provider, submit an HTTP `POST` request to `/signalk/v2/api/database/_providers/_default/{id}` where `{id}` is the identifier of the provider to use as the _default_.

_Example:_

```typescript
HTTP POST "/signalk/v2/api/database/_providers/_default/_builtin_nodesqlite"
```

> [!NOTE] Any registered provider can be set as the default. Changing the default provider does not migrate data between providers.
