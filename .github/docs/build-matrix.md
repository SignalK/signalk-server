# Docker build matrix

`.github/build-matrix.json` is the single source of truth for the OS × Node × Arch (× Edition) combinations the Docker workflows build. The three Docker workflows — `build-base-image.yml`, `build-docker.yml` and `release.yml` — read it in their `prepare` job to derive the actual build / manifest / copy matrices. `build-base-image.yml` builds only the OS × Node × Arch base images and ignores `editions`; `build-docker.yml` and `release.yml` also cross-product `editions` to produce the full and core application images.

## Top-level fields

- `architectures` — list of build runner / arch pairs. Each entry:
  - `id` — short suffix used in intermediate GHCR image tags (e.g. `amd`, `arm`). **Keep stable** to preserve existing tags.
  - `vm` — `runs-on` runner label (e.g. `ubuntu-latest`, `ubuntu-24.04-arm`).
  - `platform` — Docker buildx platform string (e.g. `linux/amd64`).
- `os_variants` — list of OS variants. Each entry:
  - `id` — version identifier (e.g. `24.04`, `alpine`).
  - `family` — OS family (e.g. `ubuntu`, `alpine`). Used for image-tag rendering and dispatch-input naming.
  - `os_arg` — value passed to Docker build-args / used in image tags as the `os_label`.
  - `dockerfile_base` — path to the OS-specific base Dockerfile.
  - `tag_suffix` — appended to `build-docker.yml` / `release.yml` image tags for this row, after the family-based rendering described in Naming conventions. Empty for the primary row of a family (the one that owns the bare `latest` / `vX.Y.Z` tags); set on any additional row that shares a `family` with another row (e.g. `-26.04`) so the two don't collide on the same tags. `build-base-image.yml` doesn't use this field — its tags already key on `os_label` directly.
  - `default_enabled` — when scheduled / push / tag runs occur (i.e. when no `workflow_dispatch` inputs are provided), the variant is included only if this is `true` on both the OS row and the Node row.
- `node_versions` — list of Node major versions. Each entry:
  - `id` — Node major (e.g. `24`).
  - `primary` — exactly one row must be `true`: it owns the bare release tags (`latest`, `vX.Y.Z`, `latest-alpine`, …). `release.yml` prepends the node label (`-<node>.x` for ubuntu, `-<node>` otherwise) to every tag of a non-primary row (e.g. `latest-26.x`, `v2.21.3-26-alpine`) so two Node majors never collide on the same release tags. `build-base-image.yml` and `build-docker.yml` ignore this field — their tags already include the node label.
  - `default_enabled` — see above.
  - `extra_platforms` — optional `{ <arch.id>: <platform string> }` appended to that arch's base platform for this Node major.
  - `exclude_archs` — optional `[<arch.id>, …]` listing archs that should not be built for this Node major.
- `editions` — list of image editions (used by `build-docker.yml` and `release.yml` only). Each entry:
  - `id` — edition identifier (e.g. `full`, `core`). Used in job display names and passed as the `EDITION` build-arg to a single Dockerfile (`./docker/Dockerfile` for dev, `./docker/Dockerfile_rel` for release), which branches on it internally.
  - `tag_suffix` — appended to every image tag for this edition (e.g. `-core`). Empty for the default edition.
  - `default_enabled` — whether this edition is built. Editions are **not** `workflow_dispatch` inputs; they always follow this flag (the per-`(OS × Node)` dispatch checkbox enables the row, and each enabled edition within it is built when its own `default_enabled` is `true`).

## Naming conventions

- **Image tags.** For the ubuntu family the node label is rendered as `<node>.x` (e.g. `24.x`); for other families it is `<node>` (e.g. `24`). Arch suffix (`amd`, `arm`) comes from `architectures[].id`. Each os_variant's own `tag_suffix` is appended next (e.g. `-26.04` for a secondary ubuntu row), then the edition `tag_suffix` (e.g. `-core`) last, so the core variant rolls up as `latest-core` / `latest-alpine-core` / `latest-26.04-core` and pins as `X.Y.Z-core` / `X.Y.Z-alpine-core` / `X.Y.Z-26.04-core`.
- **Dispatch input names.** `<family>_<id_with_-_and_._mapped_to__>_node_<node_id>` when `family != id`, otherwise `<id>_node_<node_id>`. Examples: `ubuntu_24_04_node_24`, `alpine_node_24`. The leading `<family>_` segment exists because GitHub Actions input names must start with a letter — `24_04_…` would be rejected.

## Adding things

- **New OS:** append a row to `os_variants`. Each Docker workflow exposes one `workflow_dispatch` toggle per row (keyed by `family` + `id`, see Naming conventions), so the row needs a matching input in every workflow where it should be independently selectable. If the row shares a `family` with an existing row, give it a non-empty `tag_suffix` — otherwise the two rows resolve to the same manifest tags and each build silently overwrites the other's `latest` / `vX.Y.Z` image.
- **New Node major:** append a row to `node_versions` (with `primary: false` — promote it later by swapping which row is `primary`) and add inputs to the same three workflows.
- **New arch:** append a row to `architectures`. No workflow input changes needed — arches aren't part of the dispatch input UI.
- **New edition:** append a row to `editions` with its `tag_suffix`, and add a matching `case` branch keyed on `EDITION` in `./docker/Dockerfile` (dev) and `./docker/Dockerfile_rel` (release). No workflow input changes needed — editions aren't part of the dispatch input UI.

## Behavior

Scheduled / push / tag runs ignore `workflow_dispatch` inputs and use `default_enabled` from the JSON. On `workflow_dispatch`, the per-`(OS × Node)` checkbox overrides `default_enabled` for that row; editions are never dispatch-controlled and always follow their own `default_enabled`.
