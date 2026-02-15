# NMEA Converter WASM Plugin (Rust)

Demonstrates the generic event mechanism by converting NMEA 0183 sentences to NMEA 2000 PGN JSON format.

## What it does

- Subscribes to `nmea0183` and `nmea0183out` events
- Parses NMEA 0183 sentences (RMC, GGA)
- Emits `nmea2000JsonOut` events with PGN data for interop with other plugins

## Supported Conversions

| NMEA 0183 | NMEA 2000 PGN | Description             |
| --------- | ------------- | ----------------------- |
| RMC       | 129025        | Position, Rapid Update  |
| RMC       | 129026        | COG & SOG, Rapid Update |
| GGA       | 129025        | Position, Rapid Update  |

## Configuration

| Option        | Type    | Default               | Description                |
| ------------- | ------- | --------------------- | -------------------------- |
| `enableDebug` | boolean | false                 | Log all NMEA events        |
| `sourceId`    | string  | "wasm-nmea-converter" | Source ID for emitted PGNs |

## Event Flow

```
[Hardware/Provider] --nmea0183--> [This Plugin] --nmea2000JsonOut--> [N2K Output]
```

The plugin demonstrates how WASM plugins can:

1. Subscribe to generic events (not just server events)
2. Emit generic events for interop with the Signal K data pipeline

## Building

```bash
cargo build --release --target wasm32-wasip1
npm run postbuild
```

## License

Apache-2.0
