---
title: Plotter Extension Provider plugins
---

# Plotter Extension Provider plugins

A _plotter extension provider_ is a Signal K server plugin that adds optional
UI and behaviour to **chartplotter applications** — widgets overlaid on the
chart, interactive panels, toolbar buttons, resource display filters and
headless background runtimes — without the chartplotter needing to know the
plugin exists. The user installs your plugin from the App Store; any host
chartplotter that supports the mechanism then offers what your plugin
contributes. Freeboard-SK is the reference host.

This guide is the how-to for **writing one**. The wire contract it builds on —
the `plotterExtensions` resource type, the manifest shape, capability
negotiation, the message bus and the host API — is defined in the
[Plotter Extensions API](../rest-api/proposed/plotter-extensions-api.md); keep
it open alongside this guide. General plugin mechanics (`package.json`
keywords, `start`/`stop`, `schema`, `npm link`, debugging) are **not** repeated
here — see [Server plugins](./README.md) for those.

## It is more than "iframes on a chart"

The visible part of an extension is an iframe (a widget or panel). What makes
it powerful is what that iframe is plugged into:

- **A host API.** From inside the iframe you call host methods to manipulate the plotter UI — drive the map, add a button to open a panel, subscribe to
  live Signal K values, filter resource queries, listen for and react to events.
- **A publish/subscribe message bus.** Every context (widget, panel,
  background runtime) and the host share an event bus. The host emits contract
  events (`state.changed`, `sk.<path>`, `filters.changed`); a button can
  publish a topic; contexts from the _same or different_ plugins can coordinate
  over it.
- **Headless background runtimes.** A hidden iframe that runs while your plugin
  is enabled — a client-side service that holds session state and reacts to
  events, so a panel can close without losing work.
- **New resource types with UI around them.** Because a plugin can be a
  resource provider _and_ contribute the panels/widgets/filters that present
  those resources, a single plugin can introduce an entirely new kind of data
  and everything needed to work with it on the chart.

So a "Display value" widget and a route-optimising background service are the
same mechanism at different points on a spectrum.

### Good candidates

- Glanceable instrument readouts overlaid on the chart (a single SK value).
- A search/filter panel over a resource type ("show anchorages within 10 nm").
- A workflow that creates or curates resources (a dive-site logger that
  provides a custom resource type, drops symbols for it, and offers a panel to
  search and route to sites).
- A background service that reacts to host events (route created, waypoint
  added) and computes something.

### Poor candidates

- A full-screen standalone application with its own navigation — that is a
  [webapp](../webapps.md), not an extension. Extensions are guests inside the
  host's chrome.
- Anything that needs to take over the chart, the host's menus, or the whole
  viewport. Extensions interact only through the host API, never the host DOM.
- Heavy, always-running computation in a visible widget. Put work in a
  background runtime and keep widgets glanceable.

## Who does what

The single most important thing to understand before building:

| Concern              | The **host** provides                                                                            | Your **plugin** provides                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Integration surface  | The bus, the handshake, the capabilities it advertises, the host API methods, the iframe sandbox | A manifest declaring contributions, and the iframe assets that fill them |
| Widget **placement** | The widget areas, the placement UI, and persistence of the chosen layout                         | Only the widget's **size** (`1x1`…`2x2`) and its content                 |
| Panel **chrome**     | The drawer/dialog the panel is shown in, and the open/close controls                             | The panel's content and behaviour                                        |
| Live data, resources | A multiplexed Signal K connection and authenticated resource access, relayed over the bus        | The calls that consume them                                              |
| Enablement           | Nothing — there is no host-side per-extension switch                                             | Enablement _is_ the server plugin being enabled                          |

Two consequences worth stating plainly because they surprise people:

- **A widget never chooses where it appears.** It declares a size; the _user_
  picks the area and cells through host UI, and the host persists that. Your
  code receives a stable `instanceId` for each placement and nothing about
  position. (The spec does not prescribe a layout to the host either — the
  reference host happens to offer five anchor areas, each a 2×2 cell grid.)
- **There is no "enable extension" step in the host.** Presence in the
  `plotterExtensions` collection — i.e. the providing plugin is installed and
  enabled — _is_ the consent signal.

### What is the minimum?

- **Minimum a plugin must deliver:** register the `plotterExtensions` resource
  provider returning a manifest with `apiVersion`, `requires`, and **one**
  contribution (e.g. a single widget), plus the iframe asset that contribution
  points at. That is a working extension.
- **Minimum a host must support to run it:** the bus handshake plus every
  capability your manifest lists in `requires`. A host that cannot meet your
  `requires` simply does not offer your extension; capabilities in `optional`
  are used when present and skipped when not. The reference host implements all
  version-1 capabilities.

## Server side: two responsibilities

The plugin's Node code is deliberately tiny — all UI lives in iframes. It does
two things.

### 1. Register the manifest as a read-only resource

Expose your manifest as a single, read-only resource of the custom type
`plotterExtensions`. No server upgrade is required — it works on current
servers as a user-defined resource type. The manifest is code, not user data,
so the write methods reject:

```js
module.exports = (app) => {
  const PLUGIN_ID = 'my-plotter-extension'
  let running = false

  const buildManifest = () => ({
    /* see "The manifest" below */
  })

  return {
    id: PLUGIN_ID,
    name: 'My Plotter Extension',
    start() {
      running = true
      app.registerResourceProvider({
        type: 'plotterExtensions',
        methods: {
          listResources: async () =>
            running ? { [PLUGIN_ID]: buildManifest() } : {},
          getResource: async (id) => {
            if (!running || id !== PLUGIN_ID) {
              throw new Error(`No such plotterExtensions resource: ${id}`)
            }
            return buildManifest()
          },
          setResource: async () => {
            throw new Error(`${PLUGIN_ID} is a read-only provider`)
          },
          deleteResource: async () => {
            throw new Error(`${PLUGIN_ID} is a read-only provider`)
          }
        }
      })
    },
    stop() {
      running = false
    }
  }
}
```

`registerResourceProvider` is the same server method used by every
[resource provider plugin](./resource_provider_plugins.md); here the resource
type just happens to be your manifest.

### 2. Serve the iframe assets

Widget, panel and background pages must be reachable from the browser at the
server-relative URLs your manifest declares. The `app` object passed to your
plugin is the Signal K server API — a copy of the server's Express application
extended with the server methods — so it also exposes Express's `use()`. Mount
your asset directory as a top-level static route during startup:

```js
const path = require('path')
const ASSET_BASE = `/plotterext/${PLUGIN_ID}`
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

// in start():
app.use(ASSET_BASE, require('express').static(PUBLIC_DIR))
// manifest urls then point at `${ASSET_BASE}/<page>.html`
```

Express is provided by the server, so requiring it adds no runtime dependency
of your own. A namespaced prefix such as `/plotterext/<package-name>/` keeps
the top-level path collision-free.

Two routes to **avoid**:

- **`/plugins/*`** (e.g. via `registerWithRouter`) — the server gates the
  entire `/plugins` path behind _admin_ authentication, so read-only users
  could not load the assets.
- **The `signalk-webapp` keyword** — it auto-mounts `public/` at
  `/<package-name>/`, but it also lists the package in the server's Webapps
  launcher. Extension assets are only ever loaded inside the host's iframe,
  never launched standalone, so they should not appear there. Omit the keyword
  and self-mount instead.

Serving the asset _bytes_ publicly is not a data-exposure concern: the files
are inert UI code, all data flows through the bus over the user's own
authenticated session, and extension _discovery_ is gated by the authenticated
resources API — an unauthenticated user sees no extensions regardless of how
the assets are served.

## The manifest

The manifest is the contract between your plugin and any host. It names your
required and optional capabilities and lists your contributions. A real one
(from `signalk-poi-search`, which contributes all three visible kinds):

```js
{
  name: 'POI Search',
  description: 'Search points of interest (notes) by name, category and distance.',
  version: pkg.version,
  apiVersion: '1',                                  // extension API major version
  requires: ['panels.iframe', 'resources', 'resources.filter'],
  optional: ['buttons', 'widgets', 'map', 'units'],
  buttons: [
    {
      id: 'open-poi-search',
      title: 'POI Search',
      slot: 'mapToolbar',                           // host-defined placement
      icon: 'travel_explore',                       // Material icon name
      action: { type: 'togglePanel', panel: 'poi-search-panel' }
    }
  ],
  panels: [
    {
      id: 'poi-search-panel',
      title: 'POI Search',
      type: 'iframe',
      url: `${ASSET_BASE}/panel.html`,
      lifecycle: 'keepAlive'                        // stay alive when hidden
    }
  ],
  widgets: [
    {
      id: 'poi-results',
      title: 'POI Search Results',
      type: 'iframe',
      url: `${ASSET_BASE}/widget.html`,
      size: '2x1',                                  // 2 cols × 1 row
      lifecycle: 'whileEnabled'
    }
  ]
}
```

**Top-level fields**

- `apiVersion` (**required**) — the extension API major version your manifest
  targets; this document and spec define `"1"`. A host ignores manifests
  targeting a newer version.
- `requires` — capability ids the host **must** support or it will not offer
  your extension at all. List only what you genuinely cannot work without.
- `optional` — capabilities you _use when present_. Absence must not stop your
  extension running; check at runtime with `client.hasCapability(id)` and
  degrade gracefully.
- Contribution arrays — `widgets`, `panels`, `buttons`, `background`. Include
  only the ones you provide.

**Capabilities you will reach for** (full list in the spec):

| Capability          | What it lets you do                                           |
| ------------------- | ------------------------------------------------------------- |
| `widgets`           | Contribute chart-overlay widgets (and config panels)          |
| `panels.iframe`     | Contribute iframe panels                                      |
| `buttons`           | Add toolbar buttons                                           |
| `signalk.stream`    | Subscribe to live SK path values (`client.signalk.subscribe`) |
| `signalk.put`       | Send SK PUT requests (`client.signalk.put`)                   |
| `resources`         | Run resource queries (`resources.list`)                       |
| `resources.filter`  | Push display filters (`resources.setFilter`)                  |
| `map`               | Read/drive the map view (`map.*`)                             |
| `units`             | Read the user's display-unit preferences (`units.get`)        |
| `background.iframe` | Run a headless background runtime                             |

**Contribution fields**

- **Widget:** `id`, `title`, `type: 'iframe'`, `url`, `size`
  (`1x1`|`2x1`|`1x2`|`2x2`), optional `configPanel` (id of a panel in the same
  manifest), optional `lifecycle`.
- **Panel:** `id`, `title`, `type: 'iframe'`, `url`, optional `lifecycle`.
- **Button:** `id`, `title`, `slot` (`mapToolbar` is the well-known slot),
  `icon` (Material icon name), `action` — one of
  `{ type: 'togglePanel'|'openPanel', panel }` or
  `{ type: 'sendMessage', topic, params? }`.
- **Background:** `id`, `title?`, `type: 'iframe'`, `url`.

**Lifecycle** controls when the host loads a context's iframe:

- `onOpen` — load when shown, unload when closed (good for config panels).
- `keepAlive` — load on first open, keep running hidden; state survives
  close/reopen.
- `whileEnabled` — load while the extension is available regardless of
  visibility (the norm for placed widgets).

## Inside an extension iframe

All the reference contributions are plain JavaScript built on the reference
client library [`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
(the `/extension` entry point). No framework, no TypeScript required. You
connect once, then talk to the host through the returned `client`:

```js
import { connectExtension } from 'signalk-plotterext-bus/extension'

const client = await connectExtension() // resolves after the host handshake

client.context // { kind, id, instanceId, targetInstance, targetWidget }
client.hasCapability('map') // is an optional capability available?

await client.call('method', params) // call any host API method (table in spec)
await client.subscribe(['event.name'], (name, params) => {}) // bus events
```

`client` also wraps the most common calls so you do not hand-assemble them:

- `client.state.get(keys?, scope?)` / `client.state.set(values, scope?)` —
  host-persisted key/value storage. Scope defaults to the widget `instance`;
  pass `'extension'` for state shared across all your contexts.
- `client.signalk.subscribe(paths, ev => …)` — live SK values; the callback
  gets `{ path, value, … }`. Returns an unsubscribe function.
- `client.signalk.put(path, value)` — a SK PUT through the user's session.

The full host method list and the contract events (`state.changed`,
`sk.<path>`, `filters.changed`) are in the
[Host API section of the spec](../rest-api/proposed/plotter-extensions-api.md#host-api-version-1).
The two examples below show the surface in practice.

## Example: a widget (the simplest contribution)

The "Display value" widget shows one Signal K value as text. The HTML is
trivial — a single mount point — so this section is all host API:

```
<!-- display.html (skeleton) -->
<div id="root"></div>
<script type="module" src="display.js"></script>
```

The whole widget lifecycle is four host interactions: **load config**,
**follow the configured path**, **reload when the config panel saves**, and
**open the config panel on long-press**.

```js
import { connectExtension } from 'signalk-plotterext-bus/extension'

const root = document.getElementById('root')
const client = await connectExtension()

let unsubscribe = null

async function applyConfig() {
  // Per-instance config — two placements of this widget are independent.
  const config = await client.state.get() // default scope: this instance

  if (unsubscribe) await unsubscribe()
  root.textContent = config.path ? '--' : 'Not configured'

  if (config.path) {
    // Live values arrive over the host's multiplexed SK connection.
    unsubscribe = await client.signalk.subscribe([config.path], (ev) => {
      root.textContent = ev.value ?? '--'
    })
  }
}

// The config panel writes instance state, which fires state.changed; reload.
await client.subscribe(['state.changed'], () => applyConfig())
await applyConfig()

// Pointer events inside a sandboxed iframe are invisible to the host, so the
// widget detects its own long-press and asks the host to open its config panel.
let timer
addEventListener('pointerdown', () => {
  timer = setTimeout(
    () => client.call('ui.openConfigPanel').catch(() => {}),
    1500
  )
})
addEventListener('pointerup', () => clearTimeout(timer))
```

Points that generalise to every widget:

- **It never positions itself.** It declares `size: '1x1'`; the user placed it
  and the host gave this placement an `instanceId`. `client.state.get()` is
  scoped to that instance automatically.
- **Live data is relayed, not fetched.** `client.signalk.subscribe` rides the
  host's single upstream Signal K connection — you do not open your own.
- **The config loop is the bus.** The config panel saves to this instance's
  state → the host emits `state.changed` → the widget re-reads and re-renders.

(The reference plugin factors this shared wiring into a `common.js` so each
widget file is just a `render()` — but the calls above are exactly what it
does.)

### The config panel side

A widget names a panel with `configPanel: 'instrument-config'`. When the host
opens it, `client.context.targetInstance` is the widget instance being
configured, and `state.set` writes **that** instance's scope:

```js
const client = await connectExtension()
const target = client.context.targetInstance
// read current settings, render a form, then on save:
await client.state.set({ path: chosenPath /* … */ }) // fires state.changed
```

A widget with no `configPanel` still gets a host-provided dialog on long-press
so the user can remove it; the host always provides a Remove affordance.

## Example: a panel that drives the host

`signalk-poi-search` is a `keepAlive` panel opened by a toolbar button. It runs
a resource query, shows only the matches on the chart with a display filter,
and fits the map to them — exercising `resources.list`, `resources.setFilter`,
`map.*` and extension-scope state. The form HTML is ordinary (`<input>`s and a
`<button>`); the host API is the interesting part:

```js
import { connectExtension } from 'signalk-plotterext-bus/extension'

const client = await connectExtension()
// Extension-scope state: shared with the companion results widget and a
// reopened panel (a keepAlive panel survives hide/show, but this also lets a
// sibling widget read the summary).
const saved = await client.state.get(undefined, 'extension').catch(() => ({}))

// …render the form from `saved`…

async function runSearch(keyword, category, distanceNm) {
  // Relayed through the host's authenticated session — same auth as the user.
  const collection = await client.call('resources.list', {
    type: 'notes',
    query: { position: [lon, lat], distance: distanceNm * 1852 }
  })

  const matches = Object.entries(
    collection ?? {}
  ).filter(/* keyword/category */)
  const label = `POI: ${matches.length} matches`

  if (matches.length) {
    // Display-only: the host shows just these ids and renders a clearable
    // chip with `label`. It never modifies the stored resources.
    await client.call('resources.setFilter', {
      type: 'notes',
      filter: { mode: 'include', ids: matches.map(([id]) => id), label }
    })

    // `map` is optional — guard before using it.
    if (client.hasCapability('map')) {
      await client.call('map.fitBounds', { bounds }).catch(() => {})
    }
  } else {
    await client.call('resources.clearFilter', { type: 'notes' })
  }

  // Publish a summary for the results widget; also survives reopen.
  await client.state.set({ label, count: matches.length }, 'extension')
}

// The host renders the active filter as a chip the user can dismiss without
// reopening this panel. Reflect that so our UI/state stay in sync.
await client.subscribe(['filters.changed'], (_name, params) => {
  if (params.type === 'notes' && params.active === false) {
    // clear our own state / status
  }
})
```

Points that generalise:

- **Prefer the relayed calls over direct REST.** `resources.list` keeps you
  inside the host's auth/session and its resource semantics. (You _may_ call
  the server REST API directly same-origin when the host API does not suffice —
  the reference panel does that for the vessel position.)
- **Filters are display-only and user-owned.** You push an id set or a property
  `match`; the host must surface it as something the user can clear. Watch
  `filters.changed` so an externally-cleared filter updates your UI.
- **Guard optional capabilities** with `hasCapability` and carry on without
  them.

## Background runtimes

A `background` contribution is a hidden iframe with no UI that the host loads
**while your plugin is enabled** (capability `background.iframe`), independent
of any panel or widget being open. It speaks the same bus protocol; its
`client.context.kind` is `'background'`.

The canonical pattern: a panel does its real work in a runtime that holds the
session state, so the panel can **close itself** (`ui.closePanel`) without
losing it and reattach on reopen. To poke a runtime, give a button a
`sendMessage` action publishing a topic the runtime subscribed to with
`client.subscribe`; results flow back through the normal events
(`state.changed`, `filters.changed`). A runtime drives the host, not the other
way around, in this version.

## Reference implementations

Copy these — they are written to be read and adapted (an AI coding agent does
well pointed at the spec plus one of these as a template):

- [`signalk-instrument-widgets`](https://github.com/joelkoz/signalk-instrument-widgets)
  — gauge, meter, switch and display-value widgets with a shared, unit-aware
  configuration panel. The smallest end-to-end example.
- [`signalk-poi-search`](https://github.com/joelkoz/signalk-poi-search) — a
  toolbar button, a `keepAlive` search panel and a results widget exercising
  resource queries, display filters and map control.
- [`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
  — the client/host library and the authoritative wire-format documentation.

## Declaring companion plugins

When your extension is more useful alongside another plugin (e.g. it searches
resources another plugin provides), declare the relationship through the App
Store recommendation mechanism rather than a hard dependency:

```json
{
  "signalk": { "recommends": ["<plugin-name>"] }
}
```
