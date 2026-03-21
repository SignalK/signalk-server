# SignalK Plugin CI

Full documentation: [Plugin CI/CD](../docs/develop/plugins/ci.md) (also available on the [Signal K documentation site](https://signalk.org/signalk-server/develop/plugins/ci.html)).

## Quick start

Create `.github/workflows/signalk-ci.yml` in your plugin repo:

```yaml
name: SignalK Plugin CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
```

## Examples

- [`examples/plugin-caller-example.yml`](examples/plugin-caller-example.yml) — Recommended one-liner shared workflow

## Files

```
.github/
  workflows/
    plugin-ci.yml              <- Reusable workflow (lives in SignalK/signalk-server)
  examples/
    plugin-caller-example.yml  <- Drop into your plugin repo
  README.md                    <- This file
```
