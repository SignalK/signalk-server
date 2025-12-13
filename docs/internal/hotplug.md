# Plugin Hotplug Implementation Report

## Overview

This document describes the hotplug mechanism implemented for SignalK server plugins. Hotplug allows plugins to be enabled, disabled, installed, and uninstalled without requiring a full server restart.

## Scope

Plugin hotplug handles the **complete plugin lifecycle** for both plugin types:

- **Node.js plugins** (classic `signalk-node-server-plugin`)
- **WASM plugins** (`signalk-wasm-plugin`)

This includes:

- **Enable/disable** - Toggle plugins on/off via Admin UI
- **Install/uninstall** - AppStore plugin installations
- **Webapp filtering** - Show/hide plugin webapps based on enabled state
- **Route blocking** - Block HTTP requests to disabled plugin endpoints
- **Config persistence** - Save plugin configuration to disk

---

## Architecture Overview

### Webapps List Filtering Architecture

The webapps list filtering uses a 4-layer approach to ensure disabled plugin webapps never appear in the Admin UI:

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Webapps Filtering Architecture                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Layer 1: Startup Filter (index.ts)                                    │
│  └── filterDisabledPluginWebapps() - runs after startInterfaces()      │
│      └── Removes disabled plugin webapps from app.webapps              │
│      └── emitFilteredWebappsList() - updates lastServerEvents cache    │
│                                                                        │
│  Layer 2: API Request Filter (webapps.js)                              │
│  └── GET /skServer/webapps inline filtering                            │
│      └── Filters at request time (handles race condition)              │
│      └── Sets Cache-Control: no-store headers                          │
│                                                                        │
│  Layer 3: WebSocket Push Filter                                        │
│  └── emitWebappsUpdate() in:                                           │
│      ├── plugins.ts (Node.js plugins)                                  │
│      ├── plugin-lifecycle.ts (WASM plugins)                            │
│      └── plugin-routes.ts (WASM config changes)                        │
│      └── All use filterEnabledWebapps() before emitting                │
│                                                                        │
│  Layer 4: WebSocket Cache (lastServerEvents)                           │
│  └── app.lastServerEvents stores last RECEIVE_WEBAPPS_LIST             │
│      └── Sent to new websocket clients on connect (events.ts)          │
│      └── Updated by emitFilteredWebappsList() at startup               │
│      └── Updated by emitWebappsUpdate() on plugin enable/disable       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key Files:**

- `src/interfaces/webapps.js` - API endpoint + inline filtering
- `src/interfaces/plugins.ts` - Node.js plugin hotplug + emitWebappsUpdate
- `src/wasm/loader/plugin-lifecycle.ts` - WASM plugin hotplug + emitWebappsUpdate
- `src/wasm/loader/plugin-routes.ts` - WASM config endpoint + emitWebappsUpdate
- `src/index.ts` - Startup filter (filterDisabledPluginWebapps) + cache update (emitFilteredWebappsList)
- `src/events.ts` - WebSocket startup handler, sends lastServerEvents to new clients

**Data Flow:**

1. Server starts → filterDisabledPluginWebapps() → emitFilteredWebappsList() updates cache
2. Admin UI loads → fetches `/skServer/webapps` (Layer 2 filters)
3. Admin UI connects websocket → receives cached RECEIVE_WEBAPPS_LIST from lastServerEvents (Layer 4)
4. Plugin enable/disable → emitWebappsUpdate() pushes filtered list + updates cache (Layer 3)

### SignalK Server Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SignalK Server                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │   Admin UI       │    │   Express App    │    │   WebSocket      │       │
│  │   (React)        │◄──►│   (HTTP Routes)  │    │   (Server Events)│       │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘       │
│           │                       │                       │                 │
│           │    RECEIVE_WEBAPPS_LIST                       │                 │
│           │◄──────────────────────────────────────────────┘                 │
│           │                       │                                         │
│           ▼                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                        Plugin Manager                           │        │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐       │        │
│  │  │    Node.js Plugins      │  │     WASM Plugins        │       │        │
│  │  │    (plugins.ts)         │  │  (plugin-lifecycle.ts)  │       │        │
│  │  └───────────┬─────────────┘  └───────────┬─────────────┘       │        │
│  │              │                            │                     │        │
│  │              ▼                            ▼                     │        │
│  │  ┌─────────────────────────────────────────────────────┐        │        │
│  │  │              app.webapps / app.pluginsMap           │        │        │
│  │  │              (Shared Plugin Registry)               │        │        │
│  │  └─────────────────────────────────────────────────────┘        │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                     Webapp Static Server                        │        │
│  │                        (webapps.js)                             │        │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │        │
│  │  │  freeboard-sk   │  │  instrumentpanel │  │  mayara-radar   │ │        │
│  │  │  (Node.js)      │  │  (standalone)    │  │  (WASM)         │ │        │
│  │  └─────────────────┘  └──────────────────┘  └─────────────────┘ │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Plugin Enable/Disable

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Admin UI   │      │  REST API   │      │   Plugin    │      │  WebSocket  │
│  (Browser)  │      │  Endpoint   │      │   Manager   │      │   Events    │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │                    │
       │  POST /plugins/    │                    │                    │
       │  {id}/config       │                    │                    │
       │  {enabled: false}  │                    │                    │
       │───────────────────►│                    │                    │
       │                    │                    │                    │
       │                    │  savePluginOptions │                    │
       │                    │───────────────────►│                    │
       │                    │                    │                    │
       │                    │                    │  stopPlugin()      │
       │                    │                    │──────────┐         │
       │                    │                    │          │         │
       │                    │                    │◄─────────┘         │
       │                    │                    │                    │
       │                    │                    │  removePluginWebapp│
       │                    │                    │──────────┐         │
       │                    │                    │          │         │
       │                    │                    │◄─────────┘         │
       │                    │                    │                    │
       │                    │                    │  emit serverevent  │
       │                    │                    │───────────────────►│
       │                    │                    │                    │
       │                    │                    │                    │  RECEIVE_
       │◄───────────────────────────────────────────────────────────────WEBAPPS_LIST
       │                    │                    │                    │
       │  Update Webapps    │                    │                    │
       │  Menu (React)      │                    │                    │
       │                    │                    │                    │
```

### Request Flow: Middleware Protection

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │      │  Express    │      │  Enabled    │      │   Plugin    │
│   Request   │      │  Router     │      │  Middleware │      │   Handler   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │                    │
       │  GET /plugins/     │                    │                    │
       │  freeboard-sk/api  │                    │                    │
       │───────────────────►│                    │                    │
       │                    │                    │                    │
       │                    │  Check middleware  │                    │
       │                    │───────────────────►│                    │
       │                    │                    │                    │
       │                    │                    │  getPluginOptions  │
       │                    │                    │──────────┐         │
       │                    │                    │          │         │
       │                    │                    │◄─────────┘         │
       │                    │                    │                    │
       │                    │                    │                    │
       ├────────────────────┴────────────────────┤                    │
       │           IF plugin.enabled             │                    │
       ├────────────────────┬────────────────────┤                    │
       │                    │                    │                    │
       │                    │                    │  next()            │
       │                    │                    │───────────────────►│
       │                    │                    │                    │
       │◄─────────────────────────────────────────────────────────────│
       │                    │  200 OK + Response │                    │
       │                    │                    │                    │
       ├────────────────────┴────────────────────┤                    │
       │           IF plugin.disabled            │                    │
       ├────────────────────┬────────────────────┤                    │
       │                    │                    │                    │
       │◄────────────────────────────────────────│                    │
       │  503 Service       │  Block request     │                    │
       │  Unavailable       │                    │                    │
       │                    │                    │                    │
```

### Server Startup Flow (Webapp Filtering)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        Server Startup Sequence                            │
└───────────────────────────────────────────────────────────────────────────┘

  index.ts                    webapps.js                plugins.ts              wasm/loader
     │                             │                        │                       │
     │  startInterfaces(app)       │                        │                       │
     │────────────────────────────►│                        │                       │
     │                             │                        │                       │
     │                             │  mountWebModules       │                       │
     │                             │──────────┐             │                       │
     │                             │          │ Mount ALL   │                       │
     │                             │          │ webapps     │                       │
     │                             │          │ (enabled &  │                       │
     │                             │          │ disabled)   │                       │
     │                             │◄─────────┘             │                       │
     │                             │                        │                       │
     │                             │  app.webapps = [...]   │                       │
     │◄────────────────────────────│                        │                       │
     │                             │                        │                       │
     │  startPlugins(app)          │                        │                       │
     │─────────────────────────────────────────────────────►│                       │
     │                             │                        │                       │
     │                             │                        │  registerPlugin()     │
     │                             │                        │──────────┐            │
     │                             │                        │          │ Register   │
     │                             │                        │          │ all        │
     │                             │                        │          │ plugins    │
     │                             │                        │◄─────────┘            │
     │                             │                        │                       │
     │◄─────────────────────────────────────────────────────│                       │
     │                             │                        │                       │
     │  filterDisabledPluginWebapps(app)                    │                       │
     │──────────┐                  │                        │                       │
     │          │ Remove disabled  │                        │                       │
     │          │ plugin webapps   │                        │                       │
     │          │ from app.webapps │                        │                       │
     │◄─────────┘                  │                        │                       │
     │                             │                        │                       │
     │  filterDisabledWasmWebapps(app)                      │                       │
     │─────────────────────────────────────────────────────────────────────────────►│
     │                             │                        │                       │
     │◄─────────────────────────────────────────────────────────────────────────────│
     │                             │                        │                       │
     │  emitFilteredWebappsList(app)                        │                       │
     │──────────┐                  │                        │                       │
     │          │ Update           │                        │                       │
     │          │ lastServerEvents │                        │                       │
     │          │ cache            │                        │                       │
     │◄─────────┘                  │                        │                       │
     │                             │                        │                       │
     │  Server ready               │                        │                       │
     │  app.webapps = [enabled only]                        │                       │
     │  lastServerEvents.RECEIVE_WEBAPPS_LIST = filtered    │                       │
```

### WASM Interface Hotplug Flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        WASM Interface DISABLE Flow                        │
└───────────────────────────────────────────────────────────────────────────┘

  Admin UI                serverroutes.ts           wasm.ts            plugin-lifecycle.ts
     │                          │                      │                      │
     │  PUT /settings           │                      │                      │
     │  {interfaces.wasm:false} │                      │                      │
     │─────────────────────────►│                      │                      │
     │                          │                      │                      │
     │                          │  wasmInterface.stop()│                      │
     │                          │─────────────────────►│                      │
     │                          │                      │                      │
     │                          │                      │ shutdownAllWasmPlugins(app)
     │                          │                      │─────────────────────►│
     │                          │                      │                      │
     │                          │                      │      ┌───────────────┤
     │                          │                      │      │ stopWasmPlugin│
     │                          │                      │      │ for each      │
     │                          │                      │      │ running plugin│
     │                          │                      │      └───────────────┤
     │                          │                      │                      │
     │                          │                      │      ┌───────────────┤
     │                          │                      │      │removePluginWebapp
     │                          │                      │      │ for each      │
     │                          │                      │      └───────────────┤
     │                          │                      │                      │
     │                          │                      │      ┌───────────────┤
     │                          │                      │      │emitWebappsUpdate
     │◄─────────────────────────────────────────────────────────(RECEIVE_WEBAPPS_LIST)
     │                          │                      │      └───────────────┤
     │                          │                      │                      │
     │                          │                      │      ┌───────────────┤
     │                          │                      │      │shutdown runtime
     │                          │                      │      │clear registry │
     │                          │                      │      └───────────────┤
     │                          │                      │                      │
     │  Webapps menu updated    │                      │                      │
     │  (WASM apps removed)     │                      │                      │


┌───────────────────────────────────────────────────────────────────────────┐
│                        WASM Interface ENABLE Flow                         │
└───────────────────────────────────────────────────────────────────────────┘

  Admin UI                serverroutes.ts                    plugin-lifecycle.ts
     │                          │                                   │
     │  PUT /settings           │                                   │
     │  {interfaces.wasm:true}  │                                   │
     │─────────────────────────►│                                   │
     │                          │                                   │
     │                          │  discoverAndRegisterWasmPlugins(app)
     │                          │──────────────────────────────────►│
     │                          │                                   │
     │                          │                    ┌──────────────┤
     │                          │                    │ Initialize   │
     │                          │                    │ WASM runtime │
     │                          │                    └──────────────┤
     │                          │                                   │
     │                          │                    ┌──────────────┤
     │                          │                    │ Scan         │
     │                          │                    │ node_modules │
     │                          │                    │ for WASM     │
     │                          │                    │ plugins      │
     │                          │                    └──────────────┤
     │                          │                                   │
     │                          │                    ┌──────────────┤
     │                          │                    │registerWasmPlugin
     │                          │                    │ for each     │
     │                          │                    │ discovered   │
     │                          │                    └──────────────┤
     │                          │                                   │
     │                          │                    ┌──────────────┤
     │                          │                    │ Auto-start   │
     │                          │                    │ enabled      │
     │                          │                    │ plugins      │
     │                          │                    └──────────────┤
     │                          │                                   │
     │◄─────────────────────────────────────────────(RECEIVE_WEBAPPS_LIST)
     │                          │                                   │
     │  Webapps menu updated    │                                   │
     │  (WASM apps appear)      │                                   │
```

---

## Implementation Details

### 1. Plugin Configuration Toggle Fix

**Problem:** Plugins without configuration schemas (like `freeboard-sk`, `kip`) could not be disabled because the UI was forcing `enabled=true` on every save.

**Root Cause:** In `Configuration.js`, the auto-enable logic checked if `configuration === undefined`, which was always true for plugins with empty schemas.

**Solution:** Changed the condition to check `data.enabled === undefined` instead:

```javascript
// packages/server-admin-ui/src/views/Configuration/Configuration.js (lines 341-351)
saveData={(data) => {
  // Only auto-enable on first-ever configuration save
  // Check if plugin was never configured before (no enabled state set)
  if (
    this.state.selectedPlugin.data.enabled === undefined &&
    data.enabled === undefined
  ) {
    data.enabled = true
  }
  return this.saveData(this.state.selectedPlugin.id, data)
}}
```

### 2. Default-Enabled Plugins Config Persistence

**Problem:** Plugins with `"signalk-plugin-enabled-by-default": true` in their `package.json` were enabled in memory but the config file wasn't written to disk, causing toggle issues.

**Solution:** Added `savePluginOptions()` call when default-enable triggers:

```typescript
// src/interfaces/plugins.ts (lines 821-833)
if (isEnabledByPackageEnableDefault(startupOptions, metadata)) {
  startupOptions.enabled = true
  startupOptions.configuration = {}
  plugin.enabledByDefault = true
  // Persist the default-enabled state to disk so the plugin can be disabled later
  savePluginOptions(plugin.id, startupOptions, (err) => {
    if (err) {
      console.error(
        `Error saving default-enabled options for ${plugin.id}:`,
        err
      )
    }
  })
}
```

### 3. Webapp List Hotplug (Node.js Plugins)

**Problem:** When disabling a plugin that provides a webapp, the webapp still appeared in the Webapps menu.

**Solution:** Added functions to dynamically add/remove webapps from `app.webapps` and emit server events:

```typescript
// src/interfaces/plugins.ts

// Remove webapp from app.webapps when plugin is disabled
function removePluginWebapp(app: any, plugin: any) {
  if (
    !plugin.keywords?.includes('signalk-webapp') &&
    !plugin.keywords?.includes('signalk-embeddable-webapp')
  ) {
    return
  }
  // Remove from app.webapps and app.embeddablewebapps arrays
  // ...
}

// Emit server event to update admin UI
function emitWebappsUpdate(app: any) {
  const allWebapps = []
    .concat(app.webapps || [])
    .concat(app.embeddablewebapps || [])
  app.emit('serverevent', {
    type: 'RECEIVE_WEBAPPS_LIST',
    from: 'signalk-server',
    data: uniqBy(allWebapps, 'name')
  })
}
```

### 4. Webapp List Hotplug (WASM Plugins)

**Problem:** Same issue for WASM plugins - webapps remained visible after disabling.

**Solution:** Added `stopAndRemoveWasmPluginWebapp()` function and server event emission:

```typescript
// src/wasm/loader/plugin-lifecycle.ts (lines 306-319)
export async function stopAndRemoveWasmPluginWebapp(
  app: any,
  pluginId: string
): Promise<void> {
  await stopWasmPlugin(pluginId)

  const plugin = wasmPlugins.get(pluginId)
  if (plugin) {
    removePluginWebapp(app, plugin)
  }
}

// src/wasm/loader/plugin-routes.ts (lines 618-639)
// Called when plugin is disabled via config endpoint
if (!plugin.enabled && plugin.status === 'running') {
  await stopAndRemoveWasmPluginWebapp(app, plugin.id)
}
// Emit RECEIVE_WEBAPPS_LIST event to update UI
```

### 5. Route Blocking for Disabled Plugins

**Problem:** Even after disabling a plugin, its HTTP routes and static files remained accessible.

**Solution:** Added middleware to block requests to disabled plugins:

#### Node.js Plugin Routes

```typescript
// src/interfaces/plugins.ts (lines 901-924)
const pluginEnabledMiddleware = (req, res, next) => {
  // Always allow access to config endpoints for admin UI
  if (req.path === '/config' || req.path === '/') {
    return next()
  }
  const options = getPluginOptions(plugin.id)
  if (!options.enabled) {
    res.status(503).json({ error: `Plugin ${plugin.id} is disabled` })
    return
  }
  next()
}
app.use(
  backwardsCompat(`/plugins/${plugin.id}`),
  pluginEnabledMiddleware,
  router
)
```

#### WASM Plugin Routes

```typescript
// src/wasm/loader/plugin-routes.ts (lines 710-734)
const pluginEnabledMiddleware = (req, res, next) => {
  if (req.path === '/config' || req.path === '/') {
    return next()
  }
  if (!plugin.enabled) {
    res.status(503).json({ error: `Plugin ${plugin.id} is disabled` })
    return
  }
  next()
}
app.use(
  backwardsCompat(`/plugins/${plugin.id}`),
  pluginEnabledMiddleware,
  router
)
```

#### Webapp Static Files

```javascript
// src/interfaces/webapps.js (lines 63-105)
const webappEnabledMiddleware = (req, res, next) => {
  // Check if WASM runtime is disabled for WASM plugin webapps
  const isWasmPlugin = moduleData.metadata.keywords?.includes(
    'signalk-wasm-plugin'
  )
  if (isWasmPlugin) {
    const wasmEnabled = app.config?.settings?.interfaces?.wasm !== false
    if (!wasmEnabled) {
      res
        .status(503)
        .send(`Webapp ${moduleData.module} is disabled (WASM runtime disabled)`)
      return
    }
  }

  // Find associated plugin and check if enabled
  let plugin = app.pluginsMap[pluginIdFromModule]
  if (!plugin && app.plugins) {
    plugin = app.plugins.find((p) => p.packageName === moduleData.module)
  }

  if (plugin) {
    if (plugin.type === 'wasm') {
      if (plugin.enabled === false) {
        res.status(503).send(`Webapp ${moduleData.module} is disabled`)
        return
      }
    } else {
      const pluginOptions = app.getPluginOptions?.(plugin.id)
      if (pluginOptions?.enabled === false) {
        res.status(503).send(`Webapp ${moduleData.module} is disabled`)
        return
      }
    }
  }
  next()
}
```

### 6. Exposed `getPluginOptions` on App Object

To allow `webapps.js` to check plugin enabled state:

```typescript
// src/interfaces/plugins.ts (lines 405-406)
async function startPlugins(app: any) {
  app.plugins = []
  app.pluginsMap = {}
  // Expose getPluginOptions for use by other modules (e.g., webapps.js)
  app.getPluginOptions = getPluginOptions
  // ...
}
```

### 7. Startup Filtering of Disabled Plugin Webapps

**Problem:** When the server starts, all plugin webapps are mounted by `webapps.js` before the plugin system knows which plugins are disabled. This meant disabled plugin webapps appeared in the Webapps menu on initial page load.

**Solution:** Multi-layered approach to ensure consistent filtering:

#### Layer 1: Startup Filter (index.ts)

Added `filterDisabledPluginWebapps()` function in `index.ts` that runs after all interfaces have started:

```typescript
// src/index.ts (lines 467-475) - Called in startup sequence
await startInterfaces(app)
// Filter out disabled plugin webapps after all interfaces have started
filterDisabledPluginWebapps(app)
try {
  const { filterDisabledWasmWebapps } = require('./wasm')
  filterDisabledWasmWebapps(app)
} catch (_err) {
  // WASM support may not be available, ignore
}

// src/index.ts (lines 637-685) - Filter implementation
function filterDisabledPluginWebapps(app: any) {
  if (!app.plugins) return

  const enabledPluginNames = new Set<string>()
  const allPluginNames = new Set<string>()

  for (const plugin of app.plugins) {
    if (plugin.packageName) {
      allPluginNames.add(plugin.packageName)

      let isEnabled = false
      if (plugin.type === 'wasm') {
        // WASM plugin - check the enabled flag directly
        isEnabled = plugin.enabled === true
      } else {
        // Node.js plugin - use getPluginOptions (reads config file)
        const pluginOptions = app.getPluginOptions?.(plugin.id)
        isEnabled = pluginOptions?.enabled === true
      }

      if (isEnabled) {
        enabledPluginNames.add(plugin.packageName)
      }
    }
  }

  // Filter webapps - keep non-plugins and enabled plugins only
  if (app.webapps) {
    app.webapps = app.webapps.filter((w: any) => {
      const isPluginWebapp = allPluginNames.has(w.name)
      if (!isPluginWebapp) return true // Keep standalone webapps (instrumentpanel, etc.)
      return enabledPluginNames.has(w.name)
    })
  }

  // Same for embeddable webapps
  if (app.embeddablewebapps) {
    app.embeddablewebapps = app.embeddablewebapps.filter((w: any) => {
      const isPluginWebapp = allPluginNames.has(w.name)
      if (!isPluginWebapp) return true
      return enabledPluginNames.has(w.name)
    })
  }
}
```

#### Layer 2: Inline Filtering at API Request Time (webapps.js)

**Problem:** There's a race condition during server startup - the HTTP server accepts requests during `startInterfaces()` BEFORE `filterDisabledPluginWebapps()` runs. This means early requests to `/skServer/webapps` could return unfiltered data.

**Solution:** Added inline filtering directly in the `/skServer/webapps` API endpoint:

```javascript
// src/interfaces/webapps.js (lines 106-150)
function mountApis(app) {
  app.get(`${SERVERROUTESPREFIX}/webapps`, function (req, res) {
    let allWebapps = [].concat(app.webapps).concat(app.embeddablewebapps)

    // Filter out disabled plugin webapps at request time
    // This handles the race condition during startup where the list
    // may not have been filtered yet by filterDisabledPluginWebapps()
    if (app.plugins && app.getPluginOptions) {
      const enabledPluginNames = new Set()
      const allPluginNames = new Set()

      for (const plugin of app.plugins) {
        if (plugin.packageName) {
          allPluginNames.add(plugin.packageName)

          let isEnabled = false
          if (plugin.type === 'wasm') {
            isEnabled = plugin.enabled === true
          } else {
            const pluginOptions = app.getPluginOptions(plugin.id)
            isEnabled = pluginOptions?.enabled === true
          }

          if (isEnabled) {
            enabledPluginNames.add(plugin.packageName)
          }
        }
      }

      allWebapps = allWebapps.filter((w) => {
        const isPluginWebapp = allPluginNames.has(w.name)
        if (!isPluginWebapp) return true // Keep standalone webapps
        return enabledPluginNames.has(w.name)
      })
    }

    // Disable caching to prevent browser from showing stale data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.json(uniqBy(allWebapps, 'name'))
  })
}
```

#### Layer 3: Filtered WebSocket Push Events

**Problem:** The Admin UI receives webapps list updates via WebSocket (`RECEIVE_WEBAPPS_LIST` server event). If these events emit unfiltered data, the UI shows disabled plugin webapps even when the REST API returns correct data.

**Solution:** Added filtering to all `emitWebappsUpdate()` functions:

```typescript
// src/interfaces/plugins.ts, src/wasm/loader/plugin-lifecycle.ts, src/wasm/loader/plugin-routes.ts

/**
 * Filter webapps to only include enabled plugin webapps
 */
function filterEnabledWebapps(app: any, webapps: any[]): any[] {
  if (!app.plugins || !app.getPluginOptions) {
    return webapps
  }

  const enabledPluginNames = new Set<string>()
  const allPluginNames = new Set<string>()

  for (const plugin of app.plugins) {
    if (plugin.packageName) {
      allPluginNames.add(plugin.packageName)

      let isEnabled = false
      if (plugin.type === 'wasm') {
        isEnabled = plugin.enabled === true
      } else {
        const pluginOptions = app.getPluginOptions(plugin.id)
        isEnabled = pluginOptions?.enabled === true
      }

      if (isEnabled) {
        enabledPluginNames.add(plugin.packageName)
      }
    }
  }

  return webapps.filter((w: any) => {
    const isPluginWebapp = allPluginNames.has(w.name)
    if (!isPluginWebapp) return true // Keep standalone webapps
    return enabledPluginNames.has(w.name)
  })
}

/**
 * Emit server event to update admin UI webapps list (for hotplug support)
 */
function emitWebappsUpdate(app: any): void {
  let allWebapps: any[] = []
    .concat(app.webapps || [])
    .concat(app.embeddablewebapps || [])

  // Filter to only include enabled plugin webapps
  allWebapps = filterEnabledWebapps(app, allWebapps)

  app.emit('serverevent', {
    type: 'RECEIVE_WEBAPPS_LIST',
    from: 'signalk-server',
    data: uniqBy(allWebapps, 'name')
  })
}
```

### 8. Static Assets Bypass for Plugin Icons

**Problem:** When plugins are disabled, their logos/icons were returning 503 errors, breaking the Admin UI plugin list display.

**Solution:** Added bypass in webapp middleware for static image files:

```javascript
// src/interfaces/webapps.js (lines 65-70)
const webappEnabledMiddleware = (req, res, next) => {
  // Always allow static assets (logos, icons, images) for the Admin UI plugin list
  const isStaticAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(req.path)
  if (isStaticAsset) {
    return next()
  }
  // ... rest of middleware
}
```

### 9. Plugin Type Field in API Response

**Problem:** The Admin UI needed to distinguish WASM plugins from Node.js plugins to show the "No WASM" badge when WASM runtime is disabled.

**Solution:** Added `type` field to plugin API response and minimal WASM plugin registration:

```typescript
// src/interfaces/plugins.ts - When WASM is disabled, create minimal plugin entry
if (packageJson.wasmManifest) {
  const wasmEnabled = app.config.settings.interfaces?.wasm !== false
  if (!wasmEnabled) {
    const minimalPlugin = {
      id: pluginId,
      name: displayName,
      type: 'wasm', // <-- Type field for Admin UI
      packageName: pluginName,
      enabled: false,
      state: 'disabled',
      statusMessage: () => 'WASM interface disabled'
      // ... other minimal fields
    }
    app.plugins.push(minimalPlugin)
    app.pluginsMap[pluginId] = minimalPlugin
    return
  }
}
```

The Admin UI checks `plugin.type === 'wasm'` and `!this.state.wasmEnabled` to display "No WASM" (red badge).

---

## Files Modified

| File                                                                | Changes                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server-admin-ui/src/views/Configuration/Configuration.js` | Fixed auto-enable logic for plugins without configuration, added "No WASM" status badge for WASM plugins when interface is disabled, fetches settings to check WASM status                                                                                    |
| `src/index.ts`                                                      | Added `filterDisabledPluginWebapps()` function to remove disabled plugin webapps from `app.webapps` at startup, **added `emitFilteredWebappsList()` to update lastServerEvents cache after filtering**                                                        |
| `src/interfaces/plugins.ts`                                         | Added webapp removal, config persistence, route middleware, exposed `getPluginOptions`, added `type` field to plugin API response, minimal WASM plugin registration when WASM disabled, **added `filterEnabledWebapps()` helper and filtered websocket push** |
| `src/interfaces/webapps.js`                                         | Added middleware to block disabled plugin webapps, static assets bypass for plugin icons, **added inline filtering at API request time with cache-control headers**                                                                                           |
| `src/wasm/loader/plugin-routes.ts`                                  | Added route middleware, webapp update events, **added inline filtering for RECEIVE_WEBAPPS_LIST emit**                                                                                                                                                        |
| `src/wasm/loader/plugin-lifecycle.ts`                               | Added `stopAndRemoveWasmPluginWebapp()`, `filterDisabledWasmWebapps()`, `discoverAndRegisterWasmPlugins()` functions, **added `filterEnabledWebapps()` helper and filtered websocket push**                                                                   |
| `src/wasm/loader/plugin-registry.ts`                                | Wired up lifecycle function references                                                                                                                                                                                                                        |
| `src/wasm/loader/index.ts`                                          | Added exports for lifecycle functions                                                                                                                                                                                                                         |
| `src/wasm/index.ts`                                                 | Added exports for `filterDisabledWasmWebapps`, `discoverAndRegisterWasmPlugins`                                                                                                                                                                               |
| `test/plugin-hotplug.ts`                                            | Unit tests for plugin hotplug filtering logic (12 tests, mock-based)                                                                                                                                                                                          |

---

## Behavior Summary

### At Server Startup:

1. **Interfaces start** - webapps.js mounts all plugin webapps (enabled and disabled)
2. **Plugins register** - plugins.ts registers all plugins with their metadata
3. **Startup filter runs** - `filterDisabledPluginWebapps()` removes disabled plugin webapps from `app.webapps`
4. **API ready** - `/skServer/webapps` returns only enabled plugin webapps

### When a Plugin is Disabled (at runtime):

1. **Plugin stops** - `stopPlugin()` or `stopWasmPlugin()` is called
2. **Webapp removed from list** - `removePluginWebapp()` removes it from `app.webapps`
3. **UI updated** - `RECEIVE_WEBAPPS_LIST` server event notifies the admin UI
4. **Routes blocked** - Middleware returns 503 for requests to plugin endpoints
5. **Static files blocked** - Middleware returns 503 for webapp static file requests (except icons/logos)

### When a Plugin is Enabled (at runtime):

1. **Plugin starts** - `doPluginStart()` or `startWasmPlugin()` is called
2. **Webapp added to list** - `addPluginWebapp()` adds it to `app.webapps`
3. **UI updated** - `RECEIVE_WEBAPPS_LIST` server event notifies the admin UI
4. **Routes active** - Middleware allows requests through

### When WASM Runtime is Disabled:

1. WASM plugins are stopped (via hotplug) or not loaded at startup
2. WASM plugin webapps return 503 with "WASM runtime disabled" message
3. WASM plugin webapps removed from Webapps menu
4. **Plugin Config UI shows "No WASM" badge** (red) for WASM plugins instead of "Enabled"/"Disabled"
5. **WASM plugins still appear in Plugin Config** - with minimal registration for UI display

### Static Assets Exception:

Plugin icons and images (`.png`, `.jpg`, `.svg`, etc.) are **always accessible** even for disabled plugins. This allows the Admin UI to display plugin logos in the plugin list.

---

## Testing

### Manual Testing

1. **Enable/disable Node.js plugin with webapp** (e.g., freeboard-sk)
   - Toggle should work without page refresh
   - Webapp should appear/disappear from Webapps menu
   - Accessing disabled webapp URL returns 503

2. **Enable/disable WASM plugin with webapp** (e.g., mayara-radar)
   - Same behavior as Node.js plugins
   - Plugin routes return 503 when disabled

3. **Disable WASM runtime globally**
   - Set `interfaces.wasm: false` in settings.json
   - Restart server
   - WASM plugin webapps return 503

4. **First-time plugin configuration**
   - Plugins with `signalk-plugin-enabled-by-default: true` create proper config files
   - Config file includes `configuration: {}` for proper toggle behavior

### Automated Tests

#### Plugin Hotplug Filtering Tests (`test/plugin-hotplug.ts`)

Unit tests for the plugin hotplug filtering logic using mock data. Tests both Node.js and WASM plugin filtering without requiring any plugins to be installed.

**Run:** `npx mocha --require ts-node/register test/plugin-hotplug.ts`

| Test                                                             | Description                                         |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `returns all webapps when no plugins exist`                      | Verifies standalone webapps pass through unfiltered |
| `keeps standalone webapps that have no associated plugin`        | Standalone webapps (instrumentpanel) always visible |
| `filters disabled Node.js plugin webapps`                        | Disabled Node.js plugin webapps hidden from list    |
| `filters disabled WASM plugin webapps`                           | Disabled WASM plugin webapps hidden from list       |
| `handles mixed Node.js and WASM plugins correctly`               | Both plugin types filtered correctly together       |
| `includes embeddable webapps in filtering`                       | Embeddable webapps also filtered by plugin state    |
| `handles plugins without packageName gracefully`                 | Edge case: plugins missing packageName don't crash  |
| `handles empty webapps array`                                    | Edge case: empty list returns empty                 |
| `returns unfiltered list when app.plugins is undefined`          | Graceful fallback when no plugins registered        |
| `returns unfiltered list when app.getPluginOptions is undefined` | Graceful fallback for missing function              |
| `detects Node.js plugin enabled state from getPluginOptions`     | Verifies Node.js enabled state detection            |
| `detects WASM plugin enabled state from plugin.enabled property` | Verifies WASM enabled state detection               |

### Test Results Summary

```
npm run test-only

  Plugin Hotplug Filtering
    filterEnabledWebapps
      ✔ returns all webapps when no plugins exist
      ✔ keeps standalone webapps that have no associated plugin
      ✔ filters disabled Node.js plugin webapps
      ✔ filters disabled WASM plugin webapps
      ✔ handles mixed Node.js and WASM plugins correctly
      ✔ includes embeddable webapps in filtering
      ✔ handles plugins without packageName gracefully
      ✔ handles empty webapps array
      ✔ returns unfiltered list when app.plugins is undefined
      ✔ returns unfiltered list when app.getPluginOptions is undefined
    Plugin enabled state detection
      ✔ detects Node.js plugin enabled state from getPluginOptions
      ✔ detects WASM plugin enabled state from plugin.enabled property

  12 passing
```

---

## Known Limitations

1. **Express routes cannot be truly removed** - The middleware approach blocks requests but the routes remain registered in Express. This is a limitation of the Express framework.

## Resolved Issues

1. **Router vs IRouter typing** - Changed from `Router` to `IRouter` in `src/wasm/loader/types.ts` to follow signalk-server conventions. `IRouter` is the interface used throughout the codebase (14 occurrences) for function parameters and type annotations, following the dependency inversion principle.

2. **WebSocket cache showing unfiltered webapps** - When a new admin UI client connects via WebSocket, the server sends cached events from `app.lastServerEvents`. The `RECEIVE_WEBAPPS_LIST` event was being cached before filtering ran, causing new clients to receive unfiltered webapp lists even though the REST API returned filtered data. **Fixed** by adding `emitFilteredWebappsList()` in `index.ts` that runs after startup filtering to update the cache with the filtered list.

---

## WASM Interface Hotplug

The WASM interface now supports true hotplug when disabled via Server Settings:

### When WASM Interface is Disabled:

1. **Hotplug handler triggered** - `serverroutes.ts` detects the `interfaces.wasm` change
2. **WASM interface stop called** - `wasm.ts` `stop()` method invoked
3. **All WASM plugins stopped** - `shutdownAllWasmPlugins(app)` called:
   - Clears all restart timers
   - Stops all running WASM plugins (`stopWasmPlugin()`)
   - Removes webapps from `app.webapps` and `app.embeddablewebapps`
   - Emits `RECEIVE_WEBAPPS_LIST` event to update Admin UI
   - Shuts down WASM runtime
   - Clears plugin registry
4. **UI updates** - Webapps menu removes WASM plugin entries immediately
5. **Routes blocked** - Middleware continues to block requests to WASM plugin routes

### When WASM Interface is Re-enabled:

1. **Hotplug handler triggered** - `serverroutes.ts` detects the change
2. **WASM interface created** - New interface instance created
3. **Plugin discovery initiated** - `discoverAndRegisterWasmPlugins(app)` called:
   - Initializes WASM runtime and subscription manager
   - Scans `node_modules` for plugins with `signalk-node-server-plugin` keyword
   - Filters for WASM plugins (those with `wasmManifest` in package.json)
   - Registers each WASM plugin via `registerWasmPlugin()`
   - Auto-starts enabled plugins
   - Emits `RECEIVE_WEBAPPS_LIST` event to update Admin UI
4. **UI updates** - Webapps menu shows WASM plugin entries immediately
5. **Routes active** - WASM plugin routes become accessible

### Implementation Files:

| File                                  | Changes                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/serverroutes.ts` (lines 645-681) | Hotplug handler for WASM interface toggle                                                                 |
| `src/interfaces/wasm.ts`              | Interface `stop()` method calls shutdown                                                                  |
| `src/wasm/loader/plugin-lifecycle.ts` | `shutdownAllWasmPlugins(app)` removes webapps, `discoverAndRegisterWasmPlugins(app)` re-discovers plugins |
| `src/wasm/loader/index.ts`            | Exports `discoverAndRegisterWasmPlugins`                                                                  |
| `src/wasm/index.ts`                   | Exports `discoverAndRegisterWasmPlugins`                                                                  |
