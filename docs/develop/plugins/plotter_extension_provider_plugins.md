---
title: Plotter Extension Provider plugins
---

# Plotter Extension Provider plugins

A _plotter extension provider_ is a Signal K server plugin that contributes
optional UI and behaviour to chartplotter applications (widgets, panels,
toolbar buttons, resource filters, background runtimes) without those
applications needing to know about the plugin. The contract — the
`plotterExtensions` resource type, the manifest shape, capability negotiation
and the host/extension message bus — is defined in the
[Plotter Extensions API](../rest-api/proposed/plotter-extensions-api.md). This
guide covers the two server-side concerns a provider plugin must implement:
exposing the manifest, and serving its browser assets.

## Registering the resource provider

A provider exposes its manifest as a single, read-only resource of the custom
type `plotterExtensions`. Register it during plugin startup with
`registerResourceProvider`. The manifest is plugin code, not user data, so the
write methods reject:

```js
module.exports = (app) => {
  const PLUGIN_ID = 'my-plotter-extension'
  let running = false

  const buildManifest = () => ({
    /* apiVersion, name, requires, widgets/panels/buttons/background, … */
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

No server upgrade is required — `plotterExtensions` works on current servers
as a user-defined resource type.

## Serving extension assets

Widget, panel and background pages must be reachable from the browser at the
server-relative URLs declared in the manifest. The `app` object passed to your
plugin is the Signal K server API — a copy of the server's Express application
extended with the server methods (`registerResourceProvider` and friends) — so
it also exposes Express's `use()`. Mount the asset directory as a top-level
static route during startup:

```js
const path = require('path')
const ASSET_BASE = `/plotterext/${PLUGIN_ID}`
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

// in start():
app.use(ASSET_BASE, require('express').static(PUBLIC_DIR))
// manifest widget/panel/background urls then point at `${ASSET_BASE}/...`
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

## Declaring companion plugins

When an extension is more useful alongside another plugin (for example one that
filters resources another provider supplies), declare the relationship through
the App Store recommendation mechanism rather than a hard dependency:

```json
{
  "signalk": { "recommends": ["<plugin-name>"] }
}
```

## Reference implementations

- [`signalk-instrument-widgets`](https://github.com/joelkoz/signalk-instrument-widgets)
  — gauge, meter, switch and display-value widgets with a shared, unit-aware
  configuration panel.
- [`signalk-poi-search`](https://github.com/joelkoz/signalk-poi-search) — a
  toolbar button, a keepAlive search panel and a results widget exercising
  resource queries, display filters and map control.
