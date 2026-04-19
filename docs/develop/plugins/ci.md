---
title: Plugin CI/CD
---

# Continuous Integration for Plugins

Signal K provides a reusable GitHub Actions workflow that tests your plugin across all platforms where Signal K server runs. Even plugins without a test suite benefit — the workflow validates your plugin's structure, entry point, configuration schema, lifecycle, and API usage.

## Quick Start

Create `.github/workflows/signalk-ci.yml` in your plugin repository:

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

Push to GitHub — your plugin is now tested on Linux (x64 + arm64), macOS, Windows, and armv7 (Cerbo GX).

## Manual Trigger with Custom Settings

Add `workflow_dispatch` to get a **"Run workflow"** button in the GitHub Actions UI where you can override Node versions, toggle armv7/Cerbo GX testing, enable integration tests, and more — without editing your workflow file.

Because `workflow_call` and `workflow_dispatch` inputs are separate namespaces in GitHub Actions, the workflow needs two jobs: one for automatic runs (push/PR) with hardcoded defaults, and one for manual runs that passes through your form inputs.

See [`examples/plugin-caller-example.yml`](examples/plugin-caller-example.yml) for the full workflow with manual trigger support.

## What Gets Tested

### Platforms

| Platform | Architecture     | Node versions | Notes                                            |
| -------- | ---------------- | ------------- | ------------------------------------------------ |
| Linux    | x64              | 22, 24        | GitHub-hosted runner                             |
| Linux    | arm64            | 22, 24        | GitHub-hosted runner — Raspberry Pi 4/5          |
| macOS    | arm64            | 22, 24        | GitHub-hosted runner                             |
| Windows  | x64              | 22, 24        | GitHub-hosted runner                             |
| Linux    | armv7 (Cerbo GX) | 20            | QEMU emulation — matches Venus OS 3.70 (Node 20) |

### Validation Checks

The desktop jobs (Linux, Linux arm64, macOS, Windows) run these checks, even if your plugin has no test suite. The list below is a summary for readers — the authoritative source for what the CI actually validates is the workflow itself: [.github/workflows/plugin-ci.yml](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml).

**package.json** — `signalk-node-server-plugin` keyword, `main` or `exports` field, `engines.node` declaration

**Entry point** — After build, verifies the plugin exports a constructor function

**plugin.schema()** — Calls `schema()` and checks it returns a valid JSON Schema object without crashing

**Lifecycle** — Runs `start()` → `stop()` → `start()` (restart) with an empty configuration. Validates delta messages emitted during startup and checks that `registerDeltaInputHandler` handlers forward deltas correctly.

**API usage** — Scans source files for:

- Deprecated APIs (`setProviderStatus` → `setPluginStatus`, `setProviderError` → `setPluginError`)
- Internal server properties (`app.server`, `app.deltaCache`, `app.pluginsMap`)
- Route registration anti-patterns (direct `app.get()` instead of `registerWithRouter()`)
- File storage anti-patterns (writing to `__dirname` or `process.cwd()` instead of `app.getDataDirPath()`)
- Security anti-patterns (accessing `app.securityStrategy` or `isDummy()` — plugin routes are already protected by the server)
- Node built-in module version mismatches (`node:sqlite` requires `engines.node >= 22.5.0`)

**npm pack** — Verifies all files referenced by `main`/`exports` are included in the published package

**App Store compatibility** — Installs the plugin with `--ignore-scripts` (as the App Store does) and checks for native addon dependencies

**Stray files** — Verifies that build and test steps don't leave untracked files

## Configuration

Override defaults by passing inputs to the shared workflow:

```yaml
jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      test-command: 'npm run test:ci'
      build-command: 'npm run build:plugin'
      enable-armv7: false
      enable-signalk-integration: true
      node-versions: '["22"]'
```

| Input                        | Default                      | Description                                |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| `test-command`               | `npm test`                   | Command to run your test suite             |
| `build-command`              | `npm run build --if-present` | Build command                              |
| `format-check-command`       | _(empty)_                    | Blocking format check (e.g. `npm run prettier:check`, `npx biome check .`); skipped when empty |
| `coverage-command`           | _(empty)_                    | Runs tests with coverage (e.g. `npm run coverage`); replaces the standard test run and writes output to the step summary |
| `node-versions`              | `["22", "24"]`               | Node versions for desktop platforms        |
| `enable-armv7`               | `true`                       | Test on armv7 (Cerbo GX) via QEMU          |
| `enable-signalk-integration` | `false`                      | Start SignalK server for integration tests |
| `signalk-server-versions`    | `["latest"]`                 | JSON array of signalk-server versions; the integration job fans out over each |

### Formatting and coverage

Both are tool-agnostic command strings — the workflow doesn't care whether you use Prettier/Biome or c8/nyc/`jest --coverage`. Leave either empty to opt out.

```yaml
with:
  format-check-command: 'npm run prettier:check'
  coverage-command: 'npm run coverage'
```

`format-check-command` runs after lint and **blocks the job** if it fails (unlike `npm run lint --if-present`, which is advisory). `coverage-command` replaces the standard `Run tests` step — its stdout is captured and appended to the GitHub Actions step summary so you can see coverage output without digging through logs.

## package.json

The CI validates the same fields described in the [publishing guide](./publishing.md). The most important for CI:

- `keywords` must include `signalk-node-server-plugin`
- `main` or `exports` must point to your entry file
- `engines.node` should declare the minimum Node.js version (required if you use `node:sqlite` or other version-specific built-in modules)

Plugins without a `test` script still get all validation checks — tests are skipped with a notice.

## armv7 / Cerbo GX Testing

The Cerbo GX runs an Allwinner dual-core Cortex-A7 (ARMv7, 32-bit) with Venus OS. The CI emulates this environment using QEMU with a `node:20-bookworm-slim` Docker image plus `python3`, `make`, and `g++` — matching Venus OS 3.70 which ships Node 20 and has build tools available via opkg.

The armv7 job runs install, build, and tests — it does not repeat the full validation suite (that's covered by the desktop jobs). The armv7 Node version is fixed to match the Cerbo GX and is not user-configurable. Expect armv7 jobs to take 3-5x longer than native x64. armv7 failures are **advisory and non-blocking**.

### Limitations

- **Native addons** compile for armv7 inside the container (slow but works — pre-built binaries rarely exist for ARM32)
- **Hardware peripherals** (GPIO, CAN bus, serial) are not emulated — use a self-hosted runner for those

## Integration Tests

Enable `enable-signalk-integration: true` to have the workflow:

1. Install a Signal K server
2. Build your plugin and pack it with `npm pack`
3. Install the packed tarball into the server
4. Auto-configure the plugin to start (creates `plugin-config-data/<id>.json`)
5. Start the server with sample NMEA 0183 and NMEA 2000 data (navigation, wind, depth, temperature, battery, etc.)
6. Verify the plugin appears in `/skServer/plugins`
7. Verify provider API registrations (see below)
8. Run `npm run test:integration` if defined in your `package.json`

The integration test environment exports `SIGNALK_URL=http://localhost:3000` so your tests can connect to the running server.

Pass `signalk-server-versions` as a JSON array to fan the integration job out over multiple server versions — useful for catching regressions across the baconjs 1 → 3 transition (server 2.23.x vs 2.24.0+) and similar cross-generation breakage:

```yaml
with:
  enable-signalk-integration: true
  signalk-server-versions: '["2.23.0", "latest"]'
```

The integration job runs the full Cartesian product of `node-versions × signalk-server-versions`. The default `["22", "24"] × ["latest"]` is 2 jobs; `["22", "24"] × ["2.23.0", "latest"]` is 4. To keep the matrix small, shrink either dimension — integration coverage often only needs a single Node version (`node-versions: '["22"]'`) even when the desktop jobs exercise several.

### Provider API Verification

If your plugin registers as a provider for one of the server's provider APIs, the integration test verifies the registration actually works by calling the corresponding endpoint:

| Provider API   | Registration method                | Endpoint checked                                     |
| -------------- | ---------------------------------- | ---------------------------------------------------- |
| History API v2 | `app.registerHistoryApiProvider()` | `/signalk/v2/api/history/values` must not return 501 |

This catches a common class of bugs where a plugin calls a registration method but the endpoint still returns "no provider configured" — for example due to an API mismatch between the plugin and the server version being tested.

## Self-Hosted Runner for Real Hardware

For testing against actual hardware (GPIO, CAN bus, serial ports), add a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) on a Cerbo GX or Raspberry Pi:

```yaml
test-cerbo-hardware:
  name: Cerbo GX (real hardware)
  runs-on: [self-hosted, cerbo-gx]
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm test
```
