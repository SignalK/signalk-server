# Event Handler WASM Plugin (Rust)

Demonstrates server event handling for WASM plugins.

## What it does

- Subscribes to `SERVERSTATISTICS` events
- Monitors delta rate and emits `PLUGIN_HIGH_DELTA_RATE` alert when threshold exceeded
- Clears alert when rate returns to normal

## Configuration

| Option               | Type    | Default | Description                  |
| -------------------- | ------- | ------- | ---------------------------- |
| `deltaRateThreshold` | number  | 100     | Alert threshold (deltas/sec) |
| `enableDebug`        | boolean | false   | Log all events               |

## Building

```bash
cargo build --release --target wasm32-wasip1
npm run postbuild
```

## License

Apache-2.0
