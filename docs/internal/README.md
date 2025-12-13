# Internal Documentation

This folder contains internal/maintainer documentation for Signal K Server. These documents describe implementation details, architecture decisions, and technical internals that are useful for maintainers but not intended for end users or plugin developers.

## Contents

| Document                                     | Description                                                    |
| -------------------------------------------- | -------------------------------------------------------------- |
| [hotplug.md](hotplug.md)                     | Plugin hotplug implementation (enable/disable without restart) |
| [wasm-architecture.md](wasm-architecture.md) | WASM plugin infrastructure overview                            |
| [wasm-asyncify.md](wasm-asyncify.md)         | Asyncify implementation for async HTTP in WASM                 |

## Related Documentation

- `docs/develop/` - Public developer documentation (plugin API, REST API, etc.)
- `docs/develop/plugins/wasm/` - WASM plugin developer guide
- `docs/` - User-facing documentation (installation, configuration, etc.)
