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
| Linux    | x64              | 22, 24, 26    | GitHub-hosted runner                             |
| Linux    | arm64            | 22, 24, 26    | GitHub-hosted runner — Raspberry Pi 4/5          |
| macOS    | arm64            | 22, 24, 26    | GitHub-hosted runner                             |
| Windows  | x64              | 22, 24, 26    | GitHub-hosted runner                             |
| Linux    | armv7 (Cerbo GX) | 20            | QEMU emulation — matches Venus OS 3.70 (Node 20) |

### Validation Checks

The desktop jobs (Linux, Linux arm64, macOS, Windows) run these checks, even if your plugin has no test suite. The list below is a summary for readers — the authoritative source for what the CI actually validates is the workflow itself: [.github/workflows/plugin-ci.yml](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml).

**package.json** — `signalk-node-server-plugin` keyword, `main` or `exports` field, `engines.node` declaration

**Entry point** — After build, verifies the plugin exports a constructor function

**plugin.schema()** — Calls `schema()` and checks it returns a JSON-serializable schema-like object without crashing (not fully validated against the JSON Schema meta-schema)

**Lifecycle** — Runs `start()` → `stop()` → `start()` (restart) with an empty configuration, then once more with a configuration built from your `schema`'s own declared `default` values (skipped if your schema declares none). The empty-config pass alone can miss a bug that only fires once a real default value is present — e.g. an assumed-present default array field. Validates delta messages emitted during startup and checks that `registerDeltaInputHandler` handlers forward deltas correctly.

**API usage** — Scans source files for:

- Deprecated APIs (`setProviderStatus` → `setPluginStatus`, `setProviderError` → `setPluginError`)
- Internal server properties (`app.server`, `app.deltaCache`, `app.pluginsMap`)
- Route registration anti-patterns (direct `app.get()` instead of `registerWithRouter()`)
- File storage anti-patterns (writing to `__dirname` or `process.cwd()` instead of `app.getDataDirPath()`)
- Security anti-patterns (accessing `app.securityStrategy` or `isDummy()` — plugin routes are already protected by the server)
- Node built-in module version mismatches (`node:sqlite` requires `engines.node >= 22.5.0`)

**npm pack** — Verifies all files referenced by `main`/`exports` are included in the published package

**App Store compatibility** — Installs the plugin with `--ignore-scripts` (as the App Store does) and checks for native addon dependencies. Lint, formatting, and the test run below all then run against that same uncompiled install (not the earlier, fully-built one) — this is the only place a required or poorly-guarded optional native addon actually gets exercised at runtime, which matters most since `enable-signalk-integration` defaults to off.

**Stray files** — Warns when build and test steps leave untracked files

**npm audit** — Runs once, in the `build` job (not per desktop platform/Node combination, since results don't vary by OS/arch). Warns — does not fail the build — with a severity breakdown when `npm audit` finds known vulnerabilities in your dependency tree.

### Failures vs. warnings

Not every check above can fail your build. Some findings are treated as **blocking** (they fail
the job, turn the run red, and — if you have GitHub's own Actions notification setting enabled
for your account — trigger the notification GitHub already sends by default when a run you
triggered fails). Everything else is **advisory**: logged as a `::warning::` annotation in the
run, visible in the job summary and the Annotations panel, but the run still succeeds and
nothing gets notified. This is a deliberate split — the blocking checks are things that break
the plugin or the App Store listing outright; the advisory ones are best-practice nudges that
don't stop the plugin from working.

**Blocking (fails the run):**

- Missing `signalk-node-server-plugin` keyword, missing `main`/`exports`, or a missing/invalid `version`
- A hardcoded `/home/user/...` path in source
- Entry point doesn't export a constructor function
- `plugin.schema()` throws, returns a non-object, or returns values that can't survive `JSON.stringify` (functions, symbols, circular references, `undefined` properties)
- `stop()`, or the restart `start()` call, throws a genuine error (not a "mock gap" — see below)
- Access to an internal server property (`app.server`, `app.deltaCache`, `app.pluginsMap`, `historyApiHttpRegistry`)
- Malformed delta messages emitted while the plugin runs during lifecycle testing
- A file referenced by `main`/`exports` is missing from the published package
- A required native addon dependency, or an optional one used unconditionally with no fallback once tested against a real, uncompiled App Store-style install
- `format-check-command`, if you set one, failing

**Advisory only (warns, does not fail the run, by default):**

- Missing `CHANGELOG.md`/`.github/release.yml`, missing `signalk.screenshots`, or an `appIcon`/`screenshots` path that doesn't resolve to a real file
- Missing `engines.node`
- `preinstall`/`postinstall`/`install` scripts declared (informational — the App Store install step is the real enforcement)
- Bundling `baconjs` < 3.x, or React < 19 on a `webapp`-keyword plugin
- `plugin.schema()` missing `type`/`properties`/`oneOf`/`anyOf`
- Deprecated calls (`setProviderStatus`, `setProviderError`) and the other API-usage anti-patterns (direct Express routes, file-storage anti-patterns, security anti-patterns)
- `node:sqlite`/`node:test` used with an `engines.node` that allows an older Node, if the usage is already wrapped in a try/catch
- ES2024+ syntax that would crash on Cerbo GX (Node 20)
- `npm audit` findings
- Stray untracked files left after build/test
- Lint failures (`npm run lint --if-present` is always advisory)
- The lifecycle check's "mock gap" warnings — `registerWithRouter()` throwing, or `start()`/`stop()` hitting a `"X is not a function"`/`"Cannot read propert…"` pattern. These specifically mean this workflow's test harness doesn't model something your plugin depends on, not necessarily a defect in your plugin — see `fail-on-warning` below for why these are the one category that stays advisory no matter what.

Set `fail-on-warning: true` to promote every advisory item above **except** the lifecycle
mock-gap warnings into a blocking failure. Off by default, since these checks are advisory by
design — turn it on if you'd rather your CI (and GitHub's own failure notification) catch them
than rely on someone reading the job summary.

```yaml
with:
  fail-on-warning: true
```

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

| Input                        | Default                      | Description                                                                                                                                                                                 |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-command`               | `npm test`                   | Command to run your test suite                                                                                                                                                              |
| `build-command`              | `npm run build --if-present` | Build command                                                                                                                                                                               |
| `build-node-version`         | `24`                         | Node version used to run `build-command` — the plugin is built once, on this version, and every job below tests that same build output                                                      |
| `artifact-name-suffix`       | _(empty)_                    | Suffix appended to the shared build artifact name; set this only if your caller workflow invokes this reusable workflow more than once in a single run, to avoid an artifact name collision |
| `format-check-command`       | _(empty)_                    | Blocking format check (e.g. `npm run prettier:check`, `npx biome check .`); skipped when empty                                                                                              |
| `coverage-command`           | _(empty)_                    | Runs tests with coverage (e.g. `npm run coverage`); replaces the standard test run and writes output to the step summary                                                                    |
| `node-versions`              | `["22", "24", "26"]`         | Node versions for desktop platforms                                                                                                                                                         |
| `enable-armv7`               | `true`                       | Test on armv7 (Cerbo GX) via QEMU                                                                                                                                                           |
| `enable-signalk-integration` | `false`                      | Start SignalK server for integration tests                                                                                                                                                  |
| `signalk-server-versions`    | `["latest"]`                 | JSON array of signalk-server versions; the integration job fans out over each                                                                                                               |
| `signalk-integration-matrix` | _(empty)_                    | JSON array of explicit `{node-version, signalk-server-version}` pairs for the integration job, overriding the `node-versions` × `signalk-server-versions` cross product                     |
| `fail-on-warning`            | `false`                      | Treat advisory findings as failures instead of warnings — see [Failures vs. warnings](#failures-vs-warnings). Never applies to the lifecycle check's mock-gap warnings                       |

### Build once, test broadly

The plugin is built exactly once — on `build-node-version`, `ubuntu-latest` — and every platform/Node combination below installs and tests that same build output, instead of rebuilding it. This means CI no longer verifies that `build-command` itself succeeds on Windows, macOS, or on Node versions other than `build-node-version` — only that the built output installs and runs correctly there. That's a deliberate trade: build failures are overwhelmingly Node/tooling-version issues, not OS issues, whereas install and runtime behavior (native addon compilation, path handling, ESM/CJS interop) genuinely varies by platform — that's where the matrix's breadth pays for itself. If your build process itself needs verifying across platforms or Node versions, that's no longer covered here.

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

The armv7 job downloads the centrally-built artifact and runs install and tests — build already happened once, centrally (see [Build once, test broadly](#build-once-test-broadly)) — and it does not repeat the full validation suite (that's covered by the desktop jobs). The armv7 Node version is fixed to match the Cerbo GX and is not user-configurable. Expect armv7 jobs to take 3-5x longer than native x64. armv7 failures are **advisory and non-blocking**.

### Limitations

- **Native addons** compile for armv7 inside the container (slow but works — pre-built binaries rarely exist for ARM32)
- **Hardware peripherals** (GPIO, CAN bus, serial) are not emulated — use a self-hosted runner for those

## Integration Tests

Enable `enable-signalk-integration: true` to run your plugin against a real Signal K server.

The job installs a Signal K server, packs and installs your plugin, auto-enables it, and starts the server with sample NMEA 0183 + NMEA 2000 data so the plugin has a realistic data environment (navigation, wind, depth, temperature, battery, and more). It then verifies the plugin loaded, checks provider API registrations, and runs `npm run test:integration` if defined. Your tests receive `SIGNALK_URL=http://localhost:3000` to connect to the running server.

The authoritative sequence of steps lives in the workflow itself: [.github/workflows/plugin-ci.yml](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml).

Pass `signalk-server-versions` as a JSON array to fan the integration job out over multiple server versions — useful for catching regressions across the baconjs 1 → 3 transition (server 2.23.x vs 2.24.0+) and similar cross-generation breakage:

```yaml
with:
  enable-signalk-integration: true
  signalk-server-versions: '["2.23.0", "latest"]'
```

The integration job runs the full Cartesian product of `node-versions × signalk-server-versions`. The default `["22", "24", "26"] × ["latest"]` is 3 jobs; `["22", "24", "26"] × ["2.23.0", "latest"]` is 6. To keep the matrix small, shrink either dimension — integration coverage often only needs a single Node version (`node-versions: '["22"]'`) even when the desktop jobs exercise several.

Some combinations may not make sense together — e.g. a Node version an older `signalk-server` release doesn't support. Pass `signalk-integration-matrix` as an explicit JSON array of `{node-version, signalk-server-version}` pairs to test exactly the combinations you want instead of the full cross product:

```yaml
with:
  enable-signalk-integration: true
  signalk-integration-matrix: '[{"node-version": "20", "signalk-server-version": "2.14.0"}, {"node-version": "22", "signalk-server-version": "latest"}]'
```

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
    - uses: actions/checkout@v6
    - run: npm ci
    - run: npm test
```

## See also

- [Releases and Changelogs](./release.md) — once CI passes, automate the release cut and publish step.
