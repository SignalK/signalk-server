# Plan: Consolidate Signal K Documentation into the Server

Bring all Signal K documentation into one TypeDoc-built home (`docs/dist/`), served by the server and hosted at demo.signalk.org, organized into three distinct audience paths. The Paths Reference, OpenAPI (Swagger), and AsyncAPI stay as **separate webapp viewers** that the main docs link to — not inlined. Full model is de-emphasized as a v1 legacy concept, and the v1 schema package (`@signalk/signalk-schema`) is removed from runtime code.

## End state — three documentation paths

**1. Operate (server end-users)** — install, configure, run, and access marine data.
Sources: `docs/installation/`, `docs/setup/`, `docs/guides/`, `docs/security.md`, `docs/oidc.md`, `docs/support/`.

**2. Signal K Protocol & Data Model (protocol users)** — what Signal K is; the Data Model (delta-first, full model de-emphasized); and reference links out to the three live viewers:
- Paths / Keys Reference → `/documentation/paths` (existing `PathReference.tsx`, backed by `packages/path-metadata/`)
- HTTP API reference → `/doc/openapi` (swagger-ui-express, 13 APIs from `src/api/*/openApi.ts`)
- WebSocket API reference → `/asyncapi` (6 APIs from `src/api/*/asyncApi.ts`)
Sources: new overview pages + `docs/develop/rest-api/`, `docs/whats_new.md`.

**3. Develop (plugin & webapp developers)** — plugin model, writing/deploying, accessing SK data, plugin APIs + TypeScript types (TypeDoc from `@signalk/server-api`).
Sources: `docs/develop/plugins/`, `docs/develop/webapps.md`, `docs/develop/plugins/wasm/`.

`internal/` stays out of public nav (maintainer-only). TypeDoc remains the generator (minimal churn vs. switching to Docusaurus).

## Steps (each isolated, sequential)

1. **Restructure navigation** into the 3 sections — update frontmatter `children:` arrays, `typedoc.json` `projectDocuments`, and add section landing READMEs (operate/protocol/develop). No content rewrites yet.
2. **Author Protocol overview pages** — "What is Signal K" and "Data Model" (delta-first), porting essentials from the external spec mdbook so the server docs are self-contained.
3. **Wire cross-links** from the Protocol section to the three separate viewers, and align `Sidebar.tsx` grouping with the 3-path model.
4. **De-emphasize full model** — revise `docs/develop/plugins/deltas.md`, `docs/develop/README.md`, `docs/develop/plugins/resource_provider_plugins.md` to lead with delta/API model and mark full model as v1 legacy. *(parallel with step 2)*
5. **Replace external spec deep-links** (8 files) with internal pages where content now lives; keep external links only for v1-only spec areas. *(depends on steps 2, 4)*
6. **Remove v1 schema usage** — replace `@signalk/signalk-schema` `getMetadata()` in `packages/streams/src/mdns-ws.ts` with the path-metadata registry; drop the declaration in `vendor.d.ts` and the `package.json` dependency.
7. **Hosting** — confirm demo.signalk.org serves `docs/dist` via the existing `/documentation` route (`src/serverroutes.ts` L424) and ensure `build:docs` runs in the release pipeline.
8. **Fix Keys Reference content** — replace the generic "Data should be of type number" description on ~126 `@signalk/path-metadata` paths with real descriptions, add the 14 missing `course*.nextPoint.*` paths, and add a test that every path has a specific description. Makes path-metadata fit to be the canonical Keys Reference. *(independent; prerequisite for relying on the registry in step 6)*
9. **Author a "Build a Client" guide** in the Protocol section — discovery, connecting, subscribing, authentication and REST access for non-JavaScript clients, linking into the HTTP and WebSocket API references. *(depends on steps 2, 3)*
10. **Check links in CI** — fail `build:docs` on broken internal links and on external links pinned to versioned spec URLs (`signalk.org/specification/1.x.y/`). Guards step 5. *(after step 5)*

## Relevant files
- `typedoc.json` — nav/projectDocuments, section landing pages
- `docs/develop/README.md`, `docs/README.md` — section entry points, frontmatter `children:`
- `packages/streams/src/mdns-ws.ts` + `vendor.d.ts` — remove v1 schema `getMetadata`
- `packages/server-admin-ui/src/components/Sidebar/Sidebar.tsx` — 4 doc links regrouped into 3 paths

## Verification
1. `npm run build:docs` passes (with `treatWarningsAsErrors`).
2. Nav shows 3 sections; links to `/documentation/paths`, `/doc/openapi`, `/asyncapi` resolve.
3. `grep -r "@signalk/signalk-schema" src packages` returns nothing; dependency removed; `npm test` passes.
4. path-metadata test fails on any path without a specific description.
5. CI link check passes; no versioned spec links remain outside v1-only areas.
6. Manual: `demo.signalk.org/documentation` renders the new structure.

## Decisions & assumptions
- **Included**: reorganization, overview authoring, full-model de-emphasis, v1 schema removal, cross-linking, Keys Reference content fixes, client guide, link checking.
- **Excluded**: rewriting the external spec repo; replacing TypeDoc; merging viewers into one page.
- **Assumed**: port essential Data Model prose into this repo (not link-only); path-metadata is the canonical Keys Reference.

## Further considerations
1. **Scope of v1 schema removal** — `@signalk/signalk-schema` is only used in `mdns-ws.ts` for path validation. Recommendation: **Option A** swap to path-metadata registry. (A: full removal now / B: defer removal to a separate PR to keep the docs PR focused).
2. **Spec content ownership** — Recommendation: **Option A** port a concise Data Model page here and deep-link the external spec for formal detail. (A: port essentials / B: link-only / C: fully absorb the spec).

## PR split (per repo guidelines)
Steps 1–5 (docs) and step 6 (v1 schema removal) are different logical changes and should become **separate PRs**.
