---
title: Symbols API
---

# Working with the Symbols API

Signal K applications often need a shared vocabulary of visual symbols. Each
application may ship its own fixed icon set, and users who need domain-specific
symbols must fork the client or request that icons be bundled upstream.

The **Symbols API** defines a Signal K resource type — `symbols` — that any
plugin can provide via the [Resource Provider API](../resources_api.md).
Consumer applications such as chartplotters, logbooks, dashboards, route
planners, note editors, and alert panels can discover and render the provided
symbols without being tied to a specific plugin.

`symbols` is a user-defined resource type hosted under the `resources` path, so
the collection is accessible at:

```text
/signalk/v2/api/resources/symbols
```

---

## Symbol Identity

Each symbol has two identity fields:

- **`id`** — the local symbol id, e.g. `dive-site`.
- **`namespace`** — a provider-chosen vocabulary label, e.g. `user` or `mycustom`.

The canonical consumer reference combines them:

```text
<namespace>:<id>
```

Examples:

```text
user:dive-site
mycustom:dive-site
```

The namespace value `default` is reserved for symbols built into the consuming
application (e.g. `default:dive-site` means "use this app's built-in dive-site
icon"). External providers must not use the `default` namespace.

`namespace` is symbol payload metadata and is intentionally separate from the
Signal K `$source` response field. `$source` identifies the provider plugin;
`namespace` identifies the symbol vocabulary for consumer lookup and collision
resolution.

**Namespace rules:**

- Required, must not be blank.
- Must match `[A-Za-z0-9_]+` (no colon — `:` is the namespace/id separator).
- Must not be `default` (reserved for application built-ins).

**Local id rules:**

- Required, must not be blank.
- Must not contain `:`.

---

## Retrieving Symbols

### List all symbols

```typescript
HTTP GET "/signalk/v2/api/resources/symbols"
```

Returns an object keyed by canonical `namespace:id`:

```JSON
{
  "user:dive-site": {
    "id": "dive-site",
    "namespace": "user",
    "$source": "signalk-symbol-manager",
    "timestamp": "2026-06-05T12:30:00.000Z",
    "name": "Dive Site",
    "description": "A custom dive site marker.",
    "mediaType": "image/svg+xml",
    "url": "/signalk/symbol-manager/symbols/dive-site.svg",
    "roles": ["note", "waypoint", "map-marker"],
    "tags": ["diving"],
    "scale": 0.65,
    "anchor": [1, 37],
    "gpxType": "Waypoint",
    "gpxSym": "Diver Down Flag 1"
  },
  "user:anchorage": {
    "id": "anchorage",
    "namespace": "user",
    "$source": "signalk-symbol-manager",
    "timestamp": "2026-06-04T09:00:00.000Z",
    "name": "Anchorage",
    "mediaType": "image/svg+xml",
    "url": "/signalk/symbol-manager/symbols/anchorage.svg",
    "roles": ["map-marker"],
    "tags": [],
    "scale": 0.65,
    "anchor": [24, 48]
  }
}
```

### Retrieve a single symbol

By canonical `namespace:id`:

```typescript
HTTP GET "/signalk/v2/api/resources/symbols/user:dive-site"
```

By unqualified local id (succeeds only when exactly one symbol with that id
exists across all namespaces — see _Symbol Resolution_ below):

```typescript
HTTP GET "/signalk/v2/api/resources/symbols/dive-site"
```

---

## Symbol Resource Shape

Each symbol entry in the collection contains:

| Field         | Required | Description                                                              |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `id`          | ✓        | Local symbol id, e.g. `dive-site`                                        |
| `namespace`   | ✓        | Symbol namespace, e.g. `user`                                            |
| `name`        | ✓        | Human-readable name                                                      |
| `mediaType`   | ✓        | Asset media type — `image/svg+xml`                                       |
| `url`         | ✓        | URL of the primary symbol asset                                          |
| `$source`     | ✓        | Provider plugin id (Signal K resource response metadata)                 |
| `timestamp`   | ✓        | ISO 8601 last-modified timestamp (resource response metadata)            |
| `description` |          | Human-readable description                                               |
| `roles`       |          | Intended usage categories (see _Roles_ below)                            |
| `tags`        |          | Free-form search/filter keywords                                         |
| `scale`       |          | Recommended OpenLayers icon scale for map-marker rendering               |
| `anchor`      |          | Recommended anchor point `[x, y]` in pixels from the top-left of the SVG |
| `gpxType`     |          | Mapping to a GPX waypoint `<type>` value (see _GPX mapping_ below)       |
| `gpxSym`      |          | Mapping to a GPX waypoint `<sym>` value (see _GPX mapping_ below)        |

The object key in the collection must equal `` `${namespace}:${id}` ``.

### Roles

The `roles` array uses an advisory vocabulary. Known values:

| Role                | Meaning                                     |
| ------------------- | ------------------------------------------- |
| `note`              | Used as a chart note / annotation marker    |
| `waypoint`          | Used as a navigation waypoint               |
| `map-marker`        | Displayed at a specific position on a chart |
| `region`            | Associated with a geographic region         |
| `button`            | Used as a UI button icon                    |
| `alert`             | Used in alert or alarm contexts             |
| `logbook`           | Used in logbook entries                     |
| `vector-style-icon` | Used as an icon in a vector map style       |

Consumers should ignore unknown role values. A symbol may have multiple roles.

### `scale` and `anchor`

For symbols intended as chart markers (`note`, `waypoint`, `map-marker` roles),
providers should supply `scale` and `anchor`. When present, these follow the
OpenLayers `Icon` style convention:

```text
displayed width  = SVG width  × scale
displayed height = SVG height × scale
anchor position  = [anchorX, anchorY] in source pixels from the SVG top-left
```

The `anchor` point is the pixel that consumer apps pin to the geographic
location on the chart. Without these values a consumer can still render the
symbol, but size and placement will be renderer-default rather than precise.

### GPX mapping

`gpxType` and `gpxSym` are optional free-form strings that relate a symbol to a
GPX waypoint's `<type>` and `<sym>` elements. They let a symbol-aware consumer:

- **On GPX import** — choose a symbol whose `gpxType` / `gpxSym` matches the
  imported waypoint's `<type>` / `<sym>`, instead of falling back to a default
  icon.
- **On GPX export** — write the symbol's `gpxType` / `gpxSym` back into the
  exported waypoint so the mapping round-trips.

Matching semantics (case sensitivity, `type` vs. `sym` precedence) are left to
the consumer. Providers should emit these fields only when they carry a value.

### Deferred fields

The following fields are intentionally omitted from this specification:

- `variants` — alternate light/dark/selected/alert assets.
- `assets` — renderer-specific assets such as PNG fallbacks or sprite entries.
- `license` / `attribution` — for future shared symbol libraries.
- `symbolSet` — grouping of related symbols.
- `size` — nominal display size (consumers can infer this from the SVG `viewBox`).

---

## Symbol Resolution

Consumers should support both unqualified and qualified symbol references.

### Unqualified reference — `dive-site`

Resolution order:

1. Search enabled external symbol providers for a symbol whose local `id` matches.
2. If none found, search the consumer's built-in/default symbols.
3. If none found, display a fallback symbol.

If more than one external provider defines the same local id, the result is
ambiguous and consumers may choose their own method of resolving. Consumers
should store qualified references (`namespace:id`) to avoid this ambiguity.

### Qualified reference — `mycustom:dive-site`

Resolve only within the named namespace. If unavailable, show a fallback — do
not silently substitute a different namespace's symbol.

### Explicit default reference — `default:dive-site`

Resolve only within the consumer's built-in symbols, ignoring all external
providers.

---

## Referencing Symbols from Other Resources

A symbol-aware consumer can interpret existing fields such as
`properties.skIcon` as symbol references using the same `namespace:id` form.

Preferred reference form (string):

```text
user:dive-site
```

Object form (optional equivalent):

```JSON
{ "namespace": "user", "id": "dive-site" }
```

When a user selects an external provider's symbol, consumers should persist
the qualified `namespace:id` form so the reference remains stable if another
provider later defines the same local id.

When a user selects one of the consumer app's own built-in symbols from a
picker, the consumer should persist the **unqualified** id (not `default:id`),
so a future external provider can override it by matching that id. Only persist
`default:id` when the user explicitly requests the built-in/default namespace.

---

## Provider Behavior

A plugin registers as a symbol provider using the existing Resource Provider API:

```js
app.registerResourceProvider({
  type: 'symbols',
  methods: {
    listResources, // return all symbols keyed by namespace:id
    getResource, // return one symbol by canonical or unqualified id
    setResource, // may reject for read-only providers
    deleteResource // may reject for read-only providers
  }
})
```

All four methods must be implemented because the Resource Provider API requires
them — a read-only provider may reject `setResource` and `deleteResource`.

The provider should:

- Return collection entries keyed by canonical `namespace:id`.
- Accept canonical `namespace:id` for single-resource lookups.
- For unqualified id lookups, succeed only when exactly one symbol with that id
  exists; reject ambiguous lookups.
- Serve SVG assets at a URL accessible to read-only consumers. Note: the Signal
  K server gates every `/plugins/*` route behind admin authentication regardless
  of `allow_readonly`. A provider that wants its asset `url` to be loadable by
  read-only consumers should serve assets from a path **outside** `/plugins`
  (e.g. `/signalk/<plugin-name>/symbols/...`).
- Sanitize and validate any user-supplied SVG before storage and serving.
- Use stable ids so consumer references to symbols remain valid over time.

---

## Consumer Behavior

A consumer application may:

- Fetch `/signalk/v2/api/resources/symbols` during startup.
- Build a local index by `namespace:id` and by local id.
- Register compatible SVG assets with its icon and/or map rendering system.
- Use `scale` and `anchor` when rendering symbols as map markers.
- Filter icon selectors by `roles` by default, with a "show all" option.
- Resolve existing fields like `properties.skIcon` as symbol references.
- Ignore symbols it cannot safely or usefully render.
- Display a deterministic fallback symbol when a reference cannot be resolved.
- Ignore unknown fields and unsupported future extensions.

---

## Security

SVG can carry executable or risky content. Both providers and consumers should
be defensive.

**Providers** should:

- Sanitize all SVG before storage — remove `<script>`, event-handler
  attributes, `<foreignObject>`, and external references.
- Enforce a file-size limit on uploaded assets.
- Serve assets with `Content-Type: image/svg+xml`.

**Consumers** should:

- Validate the `mediaType` field before registering a symbol.
- Avoid injecting unsanitized SVG directly into the DOM.
- Prefer safe loading mechanisms (e.g. `<img src="...">`) where practical.
- Fall back gracefully when an asset URL fails to load.

---

## Non-Goals

- This does not define a Freeboard-specific extension system.
- This does not require every Signal K application to use the same icon
  renderer.
- This does not require symbols to be bundled into the Signal K server core.
- This does not define a full cartographic portrayal system.
- This does not replace S-57/ENC symbol catalogs.
- Mapbox/MapLibre sprite metadata, PNG sprite generation, and S-57/ENC native
  portrayal are out of scope.

---

## Reference Implementation

[`signalk-symbol-manager`](https://github.com/joelkoz/signalk-symbol-manager)
is the reference implementation of this API. It provides:

- A `symbols` resource provider serving user-managed SVG symbols.
- A built-in Signal K web app for creating, editing, and managing symbols.
- Starter templates (POI note marker, Flag, Waypoint, Blank canvas).
- SVG sanitization, map-marker metadata (`scale` / `anchor`), and a
  Freeboard-accurate preview.
