# Signal K AssemblyScript Plugin SDK

Build WASM plugins for Signal K Server using TypeScript-like syntax.

## Features

- TypeScript-like syntax (strict subset)
- Compiles directly to WASM
- Small binaries (3-10 KB typical)
- Good performance (80-90% of Rust)
- Familiar tooling (npm, TypeScript)

## Installation

```bash
npm install @signalk/assemblyscript-plugin-sdk
npm install --save-dev assemblyscript
```

## Documentation

For complete documentation including:

- Step-by-step tutorial
- API reference
- Resource providers
- Troubleshooting

See the [AssemblyScript Plugin Guide](../../docs/develop/plugins/wasm/assemblyscript.md) in the Signal K Server documentation.

## Examples

See [examples/wasm-plugins/](../../examples/wasm-plugins/) for working examples:

- `example-hello-assemblyscript` - Basic plugin
- `example-weather-plugin` - Resource provider with network requests

## License

Apache-2.0
