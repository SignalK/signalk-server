# Docker build matrix

`.github/build-matrix.json` is the single source of truth for the OS × Node × Arch combinations the Docker workflows build. The three Docker workflows — `build-base-image.yml`, `build-docker.yml` and `release.yml` — read it in their `prepare` job to derive the actual build / manifest / copy matrices.

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
  - `default_enabled` — when scheduled / push / tag runs occur (i.e. when no `workflow_dispatch` inputs are provided), the variant is included only if this is `true` on both the OS row and the Node row.
- `node_versions` — list of Node major versions. Each entry:
  - `id` — Node major (e.g. `24`).
  - `default_enabled` — see above.
  - `extra_platforms` — optional `{ <arch.id>: <platform string> }` appended to that arch's base platform for this Node major.
  - `exclude_archs` — optional `[<arch.id>, …]` listing archs that should not be built for this Node major.

## Naming conventions

- **Image tags.** For the ubuntu family the node label is rendered as `<node>.x` (e.g. `24.x`); for other families it is `<node>` (e.g. `24`). Arch suffix (`amd`, `arm`) comes from `architectures[].id`.
- **Dispatch input names.** `<family>_<id_with_-_and_._mapped_to__>_node_<node_id>` when `family != id`, otherwise `<id>_node_<node_id>`. Examples: `ubuntu_24_04_node_24`, `alpine_node_24`. The leading `<family>_` segment exists because GitHub Actions input names must start with a letter — `24_04_…` would be rejected.

## Adding things

- **New OS:** append a row to `os_variants` and manually add a corresponding `workflow_dispatch` input to `build-base-image.yml`, `build-docker.yml`, and `release.yml`.
- **New Node major:** append a row to `node_versions` and add inputs to the same three workflows.
- **New arch:** append a row to `architectures`. No workflow input changes needed — arches aren't part of the dispatch input UI.

## Behavior

Scheduled / push / tag runs ignore `workflow_dispatch` inputs and use `default_enabled` from the JSON. On `workflow_dispatch`, the per-`(OS × Node)` checkbox overrides `default_enabled` for that row.
