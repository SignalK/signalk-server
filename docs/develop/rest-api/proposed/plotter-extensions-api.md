---
title: Plotter Extensions API
---

# Working with the Plotter Extensions API

Web-based Signal K chartplotters (e.g. Freeboard-SK) are general-purpose
applications. Many valuable features — instrument widgets, custom panels,
domain-specific tooling — are too specific to bundle into a chartplotter's
core, yet forking the application to add them fragments the community.

The **Plotter Extensions API** defines a Signal K resource type —
`plotterExtensions` — through which any server plugin can offer optional
features to chartplotter applications without forking them. A host
chartplotter discovers extension manifests at runtime and lets the user
place and configure the contributions. Extensions are distributed through
the existing Signal K plugin/app-store flow.

`plotterExtensions` is a user-defined resource type hosted under the
`resources` path, so the collection is accessible at:

```text
/signalk/v2/api/resources/plotterExtensions
```

> **Status: draft.** This document describes extension API version `1` as
> implemented by the reference host (Freeboard-SK) and the reference
> extensions (`signalk-instrument-widgets`, `signalk-poi-search`): widgets,
> panels, toolbar buttons, state storage, Signal K data relay, unit
> preferences, resource display filters, map control, live route editing
> and headless background runtimes. Manifest-declared filter chains and
> host-into-runtime calls are out of scope for this version (see Non-Goals).

---

## Design Principles

1. **Host-agnostic.** Nothing in the manifest or wire protocol names a
   specific chartplotter. Hosts identify themselves and their capabilities
   at runtime; extensions declare what they need.
2. **Framework-neutral.** The baseline integration unit is a sandboxed
   iframe plus a plain-JSON message protocol. Extensions need no particular
   UI framework and no TypeScript.
3. **Capability negotiation, not version lockstep.** An extension declares
   required and optional capabilities; a host only offers extensions whose
   requirements it can meet.
4. **The host stays the orchestrator.** Extensions interact through a
   deliberate host API — never host internals or the host DOM.
5. **Enablement lives on the server.** The user installed and enabled the
   providing plugin; that is the consent signal. The server's plugin
   enable/disable switch turns the whole extension off. Hosts must not add
   a second per-extension enable gate — presence in the
   `plotterExtensions` collection means enabled.

---

## Discovery

A host fetches the collection and receives extension manifests keyed by
extension id (the providing plugin's id is the recommended key):

```json
{
  "signalk-instrument-widgets": {
    "name": "Instrument Widgets",
    "description": "Single-value instrument widgets: gauge, percent meter and switch.",
    "version": "0.2.0",
    "apiVersion": "1",
    "requires": ["widgets", "panels.iframe", "signalk.stream"],
    "optional": ["signalk.put", "units"],
    "widgets": [
      {
        "id": "gauge",
        "title": "Gauge",
        "type": "iframe",
        "url": "/plotterext/signalk-instrument-widgets/gauge.html",
        "size": "1x1",
        "configPanel": "instrument-config",
        "lifecycle": "whileEnabled"
      }
    ],
    "panels": [
      {
        "id": "instrument-config",
        "title": "Instrument Setup",
        "type": "iframe",
        "url": "/plotterext/signalk-instrument-widgets/config.html",
        "lifecycle": "onOpen"
      }
    ]
  }
}
```

**Manifest fields**

- `name`, `description`, `version` — display metadata.
- `apiVersion` (required) — extension API major version; this document
  defines `"1"`. Hosts must not offer manifests targeting a newer version.
- `requires` — capability ids the host must support for the extension to be
  offered at all.
- `optional` — capability ids the extension uses when present; absence must
  not prevent it from running.
- Contribution sections: `widgets`, `panels`, `buttons`, `background` (this
  version). Hosts must ignore unknown sections and fields.
- Any individual contribution entry may declare its own `apiVersion` when
  it needs a newer host API than the manifest baseline; hosts silently omit
  contributions they cannot satisfy while keeping the rest.

**Capability identifiers (version 1)**

| Capability          | Meaning                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `widgets`           | Host supports the widget grid described below (including the configuration-panel methods `ui.openConfigPanel` / `ui.closePanel`). |
| `panels.iframe`     | Host supports iframe panels.                                                                                                      |
| `background.iframe` | Host supports headless background-runtime iframes (no UI, loaded while the extension is present).                                 |
| `buttons`           | Host renders extension toolbar buttons in at least one slot.                                                                      |
| `signalk.stream`    | Host streams Signal K path values to extension contexts over the message bus.                                                     |
| `signalk.put`       | Host relays Signal K PUT requests from extension contexts.                                                                        |
| `units`             | Host exposes the user's preferred display units (`units.get`).                                                                    |
| `map`               | Host implements the `map.*` methods (view query and control).                                                                     |
| `resources`         | Host implements `resources.list` (relayed resource queries).                                                                      |
| `resources.filter`  | Host implements imperative resource display filters.                                                                              |
| `routes`            | Host implements live route edit-buffer commands (`route.*`) and emits route lifecycle/mutation events.                            |
| `ui`                | Host implements `ui.openPanel` / `ui.closePanel`.                                                                                 |

The vocabulary is open-ended: future versions add ids (buttons, resource
filters, map control), and hosts may expose vendor-specific experiments
under a prefix such as `x-<host>.<capability>`. Unknown ids in `optional`
are ignored; unknown ids in `requires` make the extension incompatible.

---

## Widgets

A widget is a small, always-visible tile overlaid on the chart — for
glanceable state, not complex interaction (interaction belongs in panels).

**Layout model.** The host defines _widget areas_ at fixed anchor positions
of the chartplotter window — typically corners and/or edge centers; the set
is the host's choice (the reference host uses top-right, top-center,
bottom-center, bottom-left and bottom-right, reserving top-left for its own
controls). Each area is a grid of **2 columns × 2 rows**. A widget declares
only its size in grid cells as `<columns>x<rows>`: `1x1`, `2x1`, `1x2`, or
`2x2`.

**Placement is entirely the user's choice.** The user decides which area
and cells a widget occupies; the host provides the placement UI and
persists the layout. A widget never requests a position. (Reference host
UI: press-and-hold an empty anchor cell lists the widgets that fit there;
widgets pack from the screen edge inward.)

**Instances.** Placement is cell-based, not area-exclusive: widgets from
different extensions may share an area, and the same widget definition may
be placed multiple times. The host assigns each placement a unique, stable
instance id (a GUID), persists it with the layout, and passes it in the
handshake `context.instanceId`. Per-instance state is keyed by that id, so
two instances of the same widget are configured independently.

**Configuration.** A widget entry may name a panel from the same manifest
via `configPanel`. Pointer events inside a sandboxed iframe are invisible
to the host, so the press-and-hold gesture is detected by the widget
content itself (the reference client library implements it), which calls
the host method `ui.openConfigPanel` or `ui.toggleConfigPanel`. The host
opens the named panel with `context.targetInstance` set to the widget's
instance id and `context.targetWidget` set to the widget's manifest-local
id, and must also provide a gesture-independent path to the same panel plus
an affordance to **remove** the widget instance (the reference host places a
Remove button in the configuration dialog). A widget that also handles a
short tap should distinguish it from a long press so the press-and-hold does
not trigger the tap action. A widget with **no** `configPanel` still gets a
configuration dialog on long-press so it can be removed (the reference host
shows a remove-only dialog).

**Widget fields:** `id`, `title`, `type` (`iframe`), `url`, `size`,
`configPanel?`, `lifecycle?`, `apiVersion?`.

---

## Panels

A panel is interactive content the host displays inside its existing UI
(dialog, drawer — the host chooses the chrome). The baseline type every
host supporting `panels.iframe` must implement is a sandboxed iframe served
by the providing plugin.

**Panel fields:** `id`, `title`, `type` (`iframe`), `url`, `lifecycle?`,
`apiVersion?`.

**Lifecycle values**

- `onOpen` — load when opened, unload when closed.
- `keepAlive` — load on first open, keep running (hidden) while available;
  panel state survives close/reopen.
- `whileEnabled` — load while the extension is available, independent of
  visibility (the expected default for placed widgets).

Panels are opened by toolbar buttons, by the host methods `ui.openPanel` /
`ui.togglePanel` (e.g. a widget tap), or — for configuration panels — by
`ui.openConfigPanel` / `ui.toggleConfigPanel`. The `toggle*` variants close
the panel if it is already the active one, otherwise open it. The reference
host shows general panels in a right-side drawer that pushes the chart
aside, and configuration panels in a dialog.

---

## Background Runtimes

A background runtime is a **headless** extension context — a hidden iframe
with no UI — declared in a `background` manifest section and gated by the
`background.iframe` capability:

```json
{
  "background": [
    {
      "id": "search-service",
      "title": "POI Search Service",
      "type": "iframe",
      "url": "/plotterext/signalk-poi-search/runtime.html"
    }
  ]
}
```

The host loads one iframe per declared runtime **while the extension is
present in the collection** (i.e. its providing plugin is enabled) and tears
it down when the extension leaves — independent of any panel or widget being
open. This is the distinction from a `keepAlive` panel: a kept-alive panel is
a _visible_ context that had to be opened at least once, whereas a runtime
runs from the moment the extension is available with no user interaction. A
host that supports `background.iframe` **must not** keep a visible panel
alive merely to give an extension background behavior — that is what runtimes
are for.

A runtime speaks the same bus protocol as widgets and panels; its handshake
`context.kind` is `background`. It may call the host API — `state.*`
(extension scope by default, as it has no widget instance), `signalk.*`,
`resources.*` including `resources.setFilter`, `route.*`, `units.get`,
`map.*`, and `ui.openPanel`/`ui.togglePanel`. It has no `ui.closePanel` or
`ui.*ConfigPanel` (those are panel/widget affordances). The typical use is a
client-side service that holds session state and keeps work alive so a panel
can **close itself** (`ui.closePanel`) without losing that state, then
reattach to the runtime's state when reopened.

`whileEnabled` is the only meaningful lifecycle for a runtime and is implied;
the host does not unload a runtime on its own while the extension is present.

To **trigger** a runtime, the runtime subscribes to a topic with
`events.subscribe` and a `sendMessage` button (see Buttons) publishes that
topic — fire-and-forget, the direction this version supports.

**Background fields:** `id`, `title?`, `type` (`iframe`), `url`,
`lifecycle?`, `apiVersion?`.

> Runtimes a host can _call into_ from a button or a declarative filter (the
> `callRuntime` action) are a further step not part of this version; a
> version-1 runtime drives the host, not the other way around.

---

## Buttons

An extension may contribute buttons to host-defined UI slots:

```json
{
  "id": "open-poi-search",
  "title": "POI Search",
  "slot": "mapToolbar",
  "icon": "travel_explore",
  "action": { "type": "openPanel", "panel": "poi-search-panel" }
}
```

- `slot` — host-defined placement; `mapToolbar` is the one well-known slot
  every host supporting `buttons` must map to a reasonable toolbar
  location. Hosts fall back to a default slot for unknown values.
- `icon` — a Material icon name the host may render; hosts without that
  icon set may substitute a generic extension icon. (A generic `symbol`
  reference field is reserved for the symbols resource integration.)
- `action` — what the button does:

  - `togglePanel` — open the named `panel` from the same manifest, or close
    it if it is already the active panel (recommended; matches the host's
    built-in panel-button behavior).
  - `openPanel` — always open (or switch to) the named `panel`.
  - `sendMessage` — publish a message onto the host bus. The button carries a
    `topic` (the event name) and optional `params`; the host publishes it as
    a bus event delivered to every live extension context that subscribed to
    that topic via `events.subscribe`. This is fire-and-forget — no reply.

    ```json
    {
      "id": "refresh-pois",
      "title": "Refresh nearby POIs",
      "slot": "mapToolbar",
      "icon": "refresh",
      "action": { "type": "sendMessage", "topic": "poi-search:refresh" }
    }
    ```

    The **primary use case is to reach the extension's own background
    runtime** — a button poke that a kept-alive headless context handles
    (re-run a search, recompute a filter, etc.), with any visible result
    flowing back through the normal event loop (`state.changed`,
    `filters.changed`, …). But it is a general message: the host delivers a
    topic to _any_ subscribed context, so it can also drive a panel or, across
    extensions, let a federation of plugins coordinate and even build ad-hoc
    service discovery over nothing but this messaging infrastructure.

    Delivery is subscription-gated — a context receives a topic only if it
    subscribed — so an unheard message simply does nothing. Topics **should**
    be namespaced (e.g. `<extension-id>:<name>` or an `ext.*` prefix) to avoid
    colliding with host events (`state.changed`, `sk.*`, `filters.changed`) or
    with another extension's topics. This is a **convention, not an enforced
    requirement**; the host does not validate topic names.

---

## Communication

Extension iframes talk to the host over a message bus: **JSON-RPC 2.0
inside a routing envelope over `postMessage`**:

```json
{ "bus": "plotterExt/1", "msg": { "jsonrpc": "2.0", "...": "..." } }
```

- **Calls** are JSON-RPC requests with a fresh per-call `id` nonce; exactly
  one response with `result` XOR `error`. Protocol errors use the JSON-RPC
  reserved codes; host API errors use implementation-defined codes with a
  stable string in `error.data.reason`.
- **Events** are JSON-RPC notifications whose `method` is a hierarchical
  dot-separated event name. Hosts only forward events a context subscribed
  to via `events.subscribe`; subscription patterns support
  eventemitter2-style wildcards (`*` one segment, `**` any remainder).
- **Connection**: the extension repeats the `bus.ready` notification until
  the host answers with `bus.handshake`:

```json
{
  "host": "freeboard-sk",
  "hostVersion": "2.24.0",
  "apiVersion": "1",
  "capabilities": [
    "widgets",
    "panels.iframe",
    "buttons",
    "signalk.stream",
    "signalk.put",
    "units",
    "map",
    "resources",
    "resources.filter",
    "routes",
    "background.iframe",
    "ui"
  ],
  "context": {
    "kind": "widget",
    "id": "gauge",
    "instanceId": "b9c1a7e2-4f3d-4c2a-9d1e-7a5b3c8e0f42",
    "targetInstance": null,
    "targetWidget": null
  }
}
```

`context.kind` is `widget`, `panel` or `background` (this version). For a
configuration panel, `targetInstance`/`targetWidget` identify the widget
being configured; a `background` runtime carries neither.

The reference implementation of both sides of this protocol is the
[`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
npm package (`/host` and `/extension` entry points). Its README documents
the full wire format; **the documented wire format, not the package, is the
contract** — any conforming implementation interoperates.

---

## Host API (version 1)

| Method                  | Params                                         | Result                     |
| ----------------------- | ---------------------------------------------- | -------------------------- |
| `events.subscribe`      | `{ patterns: string[] }`                       | `{ subscriptionId }`       |
| `events.unsubscribe`    | `{ subscriptionId }`                           | `{}`                       |
| `state.get`             | `{ scope?, keys? }`                            | `{ values }`               |
| `state.set`             | `{ scope?, values }`                           | `{}`                       |
| `signalk.subscribe`     | `{ paths: string[] }` (literal paths)          | `{ subscriptionId }`       |
| `signalk.unsubscribe`   | `{ subscriptionId }`                           | `{}`                       |
| `signalk.put`           | `{ path, value }`                              | server PUT response        |
| `units.get`             | —                                              | `{ units }`                |
| `resources.list`        | `{ type, query? }`                             | resource collection        |
| `resources.setFilter`   | `{ type, filter }`                             | `{}`                       |
| `resources.clearFilter` | `{ type }`                                     | `{}`                       |
| `route.list`            | —                                              | `{ routes }` (the visible set) |
| `route.create`          | `{ points (≥2), name?, description? }`         | `{ routeId, rev }`         |
| `route.show`            | `{ ref }` (stored route reference)             | `{ routeId, rev }`         |
| `route.hide`            | `{ routeId }`                                  | `{}`                       |
| `route.delete`          | `{ routeId }`                                  | `{}`                       |
| `route.get`             | `{ routeId }`                                  | `{ routeId, name, description, rev, saved, dirty, points }` |
| `route.replace`         | `{ routeId, points (≥2) }`                     | `{ rev }`                  |
| `route.save`            | `{ routeId, name?, description?, dialog? }`    | `{ href, rev }`            |
| `map.getView`           | —                                              | `{ center, zoom, bounds }` |
| `map.center`            | `{ position: [lon, lat], zoom? }`              | `{}`                       |
| `map.fitBounds`         | `{ bounds: [minLon, minLat, maxLon, maxLat] }` | `{}`                       |
| `ui.openPanel`          | `{ panel }`                                    | `{}`                       |
| `ui.togglePanel`        | `{ panel }`                                    | `{}`                       |
| `ui.openConfigPanel`    | — (widget contexts)                            | `{}`                       |
| `ui.toggleConfigPanel`  | — (widget contexts)                            | `{}`                       |
| `ui.closePanel`         | — (panel contexts)                             | `{}`                       |

**Host events**

These events are part of the API contract — any conforming host emits them,
they are not host-specific. Each is delivered only to contexts that have
subscribed to its name via `events.subscribe` (so a context that never
subscribes pays nothing). A host emits an event when the corresponding
capability is supported: `state.changed` always; `sk.<path>` with
`signalk.stream`; `filters.changed` with `resources.filter`; route events
(`route.*`) with `routes`. The
connection-level notifications `bus.ready` and `bus.handshake` (see
Communication) are the only other host/extension events and are
handled by the protocol layer, not subscribed to.

- `state.changed` — `{ scope, instanceId, keys }`: the extension's stored
  state changed (e.g. its configuration panel saved). Published to the
  extension's subscribed contexts.
- `sk.<path>` — `{ path, value, timestamp, $source }`: a subscribed
  Signal K path value, relayed over the host's multiplexed server
  connection (one upstream connection per host, not per widget).
- `filters.changed` — `{ type, active }`: the extension's display filter for
  a resource type was set (`active: true`) or cleared (`active: false`, e.g.
  the user dismissed the host's filter chip). Extensions should reflect a
  clear in their own UI/state.
- `route.visible` — `{ routeId, rev, name, pointCount, saved, dirty }`: a route
  entered the visible set (became rendered on the chart). A freshly drawn or
  `route.create`d draft arrives `saved:false, dirty:true`; a stored route brought
  into view (`route.show`, or the user displaying it) arrives `saved:true,
  dirty:false`.
- `route.dirty` — `{ routeId, rev, reason? }`: content changed — a reorder,
  multi-point edit, metadata change, or whole-geometry replace. Sets
  `dirty:true`; leaves `saved` unchanged. A subscriber should re-seed with
  `route.get`. This is the conformance floor — see *Live routes*.
- `route.saved` — `{ routeId, rev, href, name, saved, dirty }`: the route's
  current state was persisted to the `routes` resource collection; arrives
  `saved:true, dirty:false`. `href` is the stored resource id, and `name` is the
  persisted name (which the host's save dialog may have just set — e.g. an
  unnamed draft saved as "rt1"), so a follower can relabel without re-fetching.
  The route stays visible and addressable under the same `routeId`.
- `route.hidden` — `{ routeId, rev, saved }`: a route left the visible set.
  `saved:true` — a stored route was made invisible (the resource is untouched and
  can be shown again); `saved:false` — an unsaved draft was deleted (gone for
  good). The umbrella name never overstates what happened.

### Resource queries and display filters

`resources.list` relays a resource collection request through the host's
authenticated client: `{ type: "notes", query: { position: [lon, lat],
distance: 18520 } }` serializes to the resources API query string. This
keeps extensions inside the host's auth/session semantics; extensions may
still call the server REST API directly (same-origin) when needed.

`resources.setFilter` controls what the host _displays_ for a resource
type — it never modifies stored resources:

```json
{
  "type": "notes",
  "filter": {
    "mode": "include",
    "ids": ["urn:mrn:signalk:uuid:..."],
    "match": [
      { "path": "properties.skIcon", "op": "eq", "value": "anchorage" }
    ],
    "label": "Anchorage < 10 nm: 2 matches"
  }
}
```

- `mode` — `include` (show only matching) or `exclude` (hide matching).
- `ids` — resource ids;
- `match` — AND-combined property conditions with
  `op` one of `eq | ne | lt | lte | gt | gte | in | contains | regex |
exists`. `contains` is case-insensitive substring for strings, membership
  for arrays; `regex` tests a JavaScript regular-expression pattern string
  (in `value`) against the field's string value — a non-string field or an
  invalid pattern fails. Conditions on missing fields are false except
  `exists`. At least one of `ids`/`match` is required; when both are present
  a resource must satisfy both.

  **Symbol-reference tolerance.** `eq`, `ne` and `in` compare symbol
  references (per the [Symbols API](https://github.com/joelkoz/signalk-symbol-manager))
  namespace-tolerantly: a bare local id matches a qualified `namespace:id`
  with the same id, and vice versa. So `{ "path": "properties.skIcon",
"op": "eq", "value": "anchorage" }` matches a resource whose stored value
  the host has qualified to `default:anchorage` (or `custom:anchorage`).
  Differing namespaces (`custom:x` vs `fsk:x`) do not match, and only
  single-colon `namespace:id` values participate — multi-colon strings such
  as URNs keep strict equality. An extension that needs exact matching of a
  qualified reference should set `"exact": true` on the condition (or write
  the fully-qualified `value`, or use `regex`). With `exact`, `eq`/`ne`/`in`
  compare strictly and `anchorage` will not match `default:anchorage`.

- `label` — short human-readable description. **Hosts must surface active
  filters to the user** (the reference host renders clearable chips) and
  let the user clear any filter without opening the owning extension.

The host tracks at most one filter per (extension, resource type); a new
`setFilter` replaces it. Filters from multiple extensions compose by
intersection. Filters are not persisted across host reloads.

### Live routes

The `routes` capability gives an extension read/write access to the routes the
host currently has **visible on the chart**, plus a stream of lifecycle and
mutation events. The visible set is small and practical — the one or two routes a
user is actually working with — never the hundreds that may be stored on the
server.

**The visible set.** A host renders some routes on the chart: routes the user is
drawing or modifying, routes an extension created, and stored routes the user has
chosen to display. Every route in that set is addressable. Routes that exist only
on the server (the stored catalog) are **not** — an extension that wants one
browses the server's resources API directly (`GET /resources/routes` returns the
whole catalog with full geometry) and asks the host to display it (`route.show`).

**Addressing — opaque handles.** Each visible route has a host-assigned `routeId`
that is **opaque**: the extension treats it as a token and never parses it. The
host mints and decodes it (it may encode a stored resource id, an ephemeral draft
id, or anything else — that is implementation, kept behind the handle). A
`routeId` is stable for as long as the route stays visible. Every command and
event names its `routeId`. `route.list` enumerates the visible set; a host that
only ever shows one route at a time simply exposes one entry.

**Two flags: `saved` and `dirty`.** Orthogonal, and both appear on `route.get`,
`route.list`, and the lifecycle events:

- `saved` — is the route backed by a persisted `routes` resource? A never-saved
  draft is `false`; a stored route is `true`.
- `dirty` — does the in-memory geometry differ from what is persisted (pending
  unsaved changes)? A clean route is `false`; an edited one is `true`.

  | `saved` | `dirty` | state |
  | ------- | ------- | ----- |
  | `false` | `true`  | a draft with content — needs saving to persist |
  | `true`  | `false` | a clean stored route — matches the server |
  | `true`  | `true`  | a stored route with unsaved edits |

**Editing stages; it does not write through.** Manipulating a visible route —
`route.replace`, or the user's own native editing — changes the in-memory route
and emits `route.dirty` (setting `dirty:true`); it does **not** touch the server,
and it leaves `saved` unchanged. The change is committed only by `route.save`, or
discarded by the host's editing UI / `route.hide` (for a draft). This mirrors how
a native editor already works — manipulate, then save or discard — and applies
uniformly to drafts and stored routes.

**Bringing routes in and out of view.** The function calls are deliberately the
traditional **create / show / hide / delete**; the visibility/`saved`/`dirty`
model lives in the *events* and route properties, not in the verbs.

- `route.create({ points, name?, description? })` adds a new unsaved route to the
  visible set (`saved:false`). `points` is **required and must hold at least two
  waypoints** (a route needs a segment); fewer is rejected with
  `routes.badRequest`. `description` is the route-level description (distinct from
  a waypoint's per-point `description`) and round-trips through `route.get` and
  `route.save`.
- `route.show({ ref })` brings an existing **stored** route into the visible set
  and returns its `routeId`, so the extension can read and edit it in place.
- `route.hide({ routeId })` removes a route from the map. For a **stored** route
  this just unchecks its visibility — the resource is untouched
  (`route.hidden saved:true`). For an **unsaved** route it deletes it, since the
  only store it has is the visibility buffer (`route.hidden saved:false`).
- `route.delete({ routeId })` **permanently deletes a stored route** from the
  resource collection. Deleting an *unsaved* route has the same effect as hiding
  it (the draft is discarded). Either way the route leaves the visible set as
  `route.hidden saved:false` (gone — no longer retrievable).

So `hide` and `delete` both emit `route.hidden`; the event's `saved` flag tells a
follower the outcome (`true` = still on the server, `false` = gone), while the
*verb the extension called* carries the intent.

**Points and geometry.** A route's points are an ordered list (0-based). A point
is `{ position: [lon, lat, alt?], name?, description? }` — `name`/`description`
map to a host's per-point metadata and round-trip through `route.get`,
`route.replace`, and `route.save`. `route.create` and `route.replace` require at
least two points and reject a malformed point (a non-numeric `position`, or
non-string `name`/`description`) with `routes.badRequest`.

**Revisions and mirroring.** Each route carries a monotonic `rev` that
increments on every mutation. `route.get` and `route.list` report the current
`rev`, and every mutation event and every mutating command result carries the
post-change `rev`. In v1 the mutation signal is **`route.dirty`**: an extension
mirrors a route by calling `route.get` whenever it sees `route.dirty` (or a `rev`
gap). The protocol still offers a full snapshot (`route.get`) so the author never
has to reconstruct state from a partial stream.

**`route.dirty` is the conformance floor.** Every change to a visible route's
content — a multi-point edit, a whole-geometry `route.replace` (e.g. an
auto-router's), a metadata change, or the reference host's `Modify` flow (which
hands back a whole coordinate array with no "which vertex moved") — emits
`route.dirty`. A host emits `route.visible`, `route.hidden`, `route.saved`, and
`route.dirty` — geometry is always edited as a whole (`route.replace` or the
host's own native editing), so a single "on `route.dirty`, `route.get`" keeps a
follower in sync without tracking who changed what.

**Origin transparency.** Events are emitted for _every_ change regardless of
origin — an extension command, the user's native editing, or another
extension — so a follower stays consistent no matter who is driving. As with
all host events, a context receives them only after `events.subscribe` (e.g.
`{ patterns: ["route.**"] }`).

**Saving.** `route.save` persists the route's current state to the `routes`
resource collection through the user's authenticated session, returning the
stored resource `href` and emitting `route.saved` (`saved:true, dirty:false`).
The route **stays visible and addressable under the same `routeId`** — saving
does not remove or invalidate it. For a never-saved draft this creates a new
resource; for an already-stored route with pending edits it updates that
resource. It is **headless by default** — saved with the supplied
`name`/`description`, falling back to the route's current name. Pass
`dialog: true` to have the host prompt for the name/description instead, its
dialog prefilled from those params; the reference host (Freeboard-SK) opens its
Route Details dialog, and a cancelled dialog rejects with `routes.saveCancelled`.

Note the `routeId` is the host's **opaque handle**, distinct from the `href` of
the saved resource (an `/resources/routes/<id>` reference returned by the save) —
they are not interchangeable, and a saved route keeps the same `routeId` it had
before the save.

**Errors** use the standard `error.data.reason` convention: `routes.unknownId`
(no such `routeId`), `routes.badRequest` (invalid params — e.g. `route.create`
with fewer than two points, a non-numeric `position`, or non-string metadata),
`routes.badRef` (`route.show` reference not found), `routes.saveFailed` (server
rejected the persist — distinct from a user cancel), `routes.saveCancelled` (the
user dismissed the save dialog), `routes.notSupported` (host lacks `routes`).

### State storage

`state.get`/`state.set` give an extension small host-persisted key/value
storage. Two scopes:

- `instance` — keyed by the context's widget instance (default for widget
  contexts; configuration panels opened with `targetInstance` read and
  write the _target's_ instance scope).
- `extension` — shared across the extension's contexts.

Every successful `state.set` triggers a `state.changed` event — the loop
that lets a widget re-render live while its configuration panel edits it.
Quota and persistence backend are host-defined.

### Unit preferences

Signal K values are SI on the wire, and a path's `meta.units` names the
unit. What the _user_ wants displayed is host configuration. `units.get`
exposes it:

```json
{
  "units": {
    "speed": "kn",
    "distance": "naut-mile",
    "depth": "m",
    "length": "m",
    "temperature": "C"
  }
}
```

Vocabulary: `speed` `kn|m/s|km/h|mph`; `distance` `kilometer|naut-mile`;
`depth`/`length` `m|foot`; `temperature` `C|F`. Hosts may add keys;
extensions must tolerate missing ones. Extensions rendering path values
should combine a path's `meta.units` with these preferences to decide which
conversions to offer and which to preselect.

---

## Providing an Extension

A Signal K plugin:

1. Registers a resource provider for the custom type `plotterExtensions`
   (works on current servers — no server upgrade required):

   ```js
   app.registerResourceProvider({
     type: 'plotterExtensions',
     methods: {
       listResources: async () => ({ [PLUGIN_ID]: manifest }),
       getResource: async (id) => {
         /* ... */
       },
       setResource: async () => {
         throw new Error('read-only')
       },
       deleteResource: async () => {
         throw new Error('read-only')
       }
     }
   })
   ```

2. Serves its widget, panel and background assets from a **publicly
   readable**, non-admin-gated route. Manifest URLs are server-relative;
   hosts resolve them against the Signal K server origin. The asset files are
   inert UI code — all data flows through the bus over the user's own
   authenticated session, and extension _discovery_ is gated by the
   authenticated resources API, so an unauthenticated user sees no extensions
   regardless of how the assets are served. For how to mount such a route from
   a plugin, see
   [Plotter Extension Provider plugins](../../plugins/plotter_extension_provider_plugins.md).

3. Declares inter-plugin relationships through the App Store mechanism
   (`"signalk": { "recommends": ["<plugin-name>"] }` in `package.json`)
   rather than hard dependencies — e.g. an extension that searches another
   provider's resources.

---

## Security and Trust

By the time a manifest is visible, the user has already installed a server
plugin — code that runs unrestricted on the server. Install time is the
trust decision; browser-side isolation is **fault containment, not an
adversarial boundary**:

- Baseline iframe sandbox: `allow-scripts allow-same-origin allow-forms`.
  Same-origin assets plus scripts mean the sandbox attribute is not a
  security boundary; its value is lifecycle isolation, CSS/DOM separation
  and crash containment. `allow-top-navigation`, `allow-popups` and
  `allow-modals` are withheld to prevent accidents.
- The host API validates arguments and applies call timeouts; one broken
  extension must not prevent the host from loading.
- Extension contexts are same-origin with the Signal K server and may call
  its REST/WebSocket APIs directly with the user's session where the host
  API does not suffice.

---

## Reference Implementations

- **Protocol**: [`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
  — wire format documentation plus host/extension endpoints with a
  conformance test suite.
- **Extensions**: [`signalk-instrument-widgets`](https://github.com/joelkoz/signalk-instrument-widgets)
  — gauge, meter, switch and display-value widgets with a
  shared unit-aware configuration panel — and
  [`signalk-poi-search`](https://github.com/joelkoz/signalk-poi-search) — a
  toolbar button + keepAlive search panel + results widget exercising
  resource queries, display filters and map control — and
  `signalk-auto-route` *(planned)* — a toolbar button + parameter panel +
  server-side routing engine exercising the `routes` capability (land-avoidance
  auto-routing over the host's live route buffer; see its own SPEC).
- **Host**: Freeboard-SK (feature branch, in development) — anchor-area
  widget overlay, placement UI, state storage, multiplexed Signal K relay,
  toolbar buttons, panel drawer, filter chips, map control.

---

## Non-Goals

This version deliberately does not specify:

- **Manifest-declared filter chains.** Display filtering here is imperative:
  running extension code pushes an id set or `match` predicate via
  `resources.setFilter`. Filters declared _statically in the manifest_ and
  evaluated by the host on every resource fetch are out of scope for this
  version.
- **Host-into-runtime calls (`callRuntime`).** Background runtimes drive the
  host — they call host methods and react to host events; the host does not
  call into a runtime. The reverse call direction is out of scope for this
  version.
