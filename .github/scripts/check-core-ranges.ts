/*
 * Plugin CI: shared core package range check.
 *
 * The App Store installs every plugin into one shared tree
 * (~/.signalk/node_modules), where npm keeps a single hoisted copy of
 * packages shared across the server ecosystem. npm resolves that copy to the
 * newest version that satisfies EVERY installed plugin's range, so one
 * plugin's tight range holds the shared copy back for all plugins on the
 * server. This check errors when a plugin's declared range excludes the
 * newest release in the major line the range itself targets. A newer major
 * is never an error — staying on the current major is a legitimate
 * compatibility choice — it only gets an advisory notice.
 *
 * The pure logic (checkCoreRanges) takes an injected registry accessor so it
 * can be unit-tested without a live npm/registry. The CLI wrapper at the
 * bottom wires it to `npm view` and the GitHub Actions annotation protocol.
 */

import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { basename, resolve } from 'path'

// @canboat/ts-pgns is deliberately excluded: its own version policy states
// minor releases may include breaking changes and recommends pinning to a
// minor ("~1.10.0"). "Widen to a caret" would be wrong advice for it, so the
// shared-copy check does not apply.
export const CORE_PACKAGES = [
  '@canboat/canboatjs',
  '@signalk/n2k-signalk',
  '@signalk/nmea0183-signalk',
  '@signalk/path-metadata',
  '@signalk/server-admin-ui',
  '@signalk/server-api',
  '@signalk/streams'
]

const CORE_PACKAGE_SET = new Set(CORE_PACKAGES)

const EXACT_VERSION_RE = /^=?\s*\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const SEMVER_PARTS = 3

export interface PackageManifest {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export type FindingLevel = 'error' | 'warning' | 'notice'

export interface Finding {
  level: FindingLevel
  message: string
}

export interface CheckResult {
  findings: Finding[]
  errors: number
  skipped: number
}

/**
 * Registry accessor, injected so the check runs without a live npm.
 * `matching` throws a NoMatchError when the range matches no published
 * version, and any other error for a lookup failure that should be skipped.
 */
export interface Registry {
  latest(name: string): string
  releases(name: string): string[]
  matching(name: string, range: string): string[]
}

export class NoMatchError extends Error {
  readonly noMatch = true
}

function major(version: string): number {
  return parseInt(version, 10)
}

// release-version compare on the numeric triple — prereleases are already
// excluded by npm's range matching ('*' and plain ranges never admit them)
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((n) => parseInt(n, 10))
  const bParts = b.split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < SEMVER_PARTS; i++) {
    if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i]
  }
  return 0
}

function newest(versions: string[]): string {
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b))
}

export function checkCoreRanges(
  pkg: PackageManifest,
  registry: Registry
): CheckResult {
  const declared = [
    ...Object.entries(pkg.dependencies ?? {}),
    ...Object.entries(pkg.peerDependencies ?? {})
  ]
  const seen = new Set<string>()
  const findings: Finding[] = []
  let errors = 0
  let skipped = 0

  for (const [name, range] of declared) {
    if (!CORE_PACKAGE_SET.has(name)) continue
    if (seen.has(name + '@' + range)) continue
    seen.add(name + '@' + range)

    let latest: string
    let releases: string[]
    try {
      latest = registry.latest(name)
      releases = registry.releases(name)
    } catch {
      skipped++
      findings.push({
        level: 'notice',
        message:
          'Could not fetch the versions of ' +
          name +
          ' from the npm registry — skipping'
      })
      continue
    }

    const reportNoMatch = () => {
      errors++
      findings.push({
        level: 'error',
        message:
          name +
          ' range "' +
          range +
          '" matches no published version — npm install will fail. ' +
          'Use a range that includes the latest release, e.g. "^' +
          latest +
          '"'
      })
    }

    let matching: string[]
    try {
      matching = registry.matching(name, range)
    } catch (err) {
      if (err instanceof Error && (err as { noMatch?: boolean }).noMatch) {
        reportNoMatch()
      } else {
        skipped++
        findings.push({
          level: 'notice',
          message:
            name +
            '@' +
            range +
            ' could not be checked against the npm registry ' +
            '(non-registry spec or network error) — skipping'
        })
      }
      continue
    }
    if (matching.length === 0) {
      reportNoMatch()
      continue
    }

    // A range may target more than one major (e.g. "2.5.0 - 2.9.0 || ^3.0.0").
    // Every targeted major must reach the newest release in that major line —
    // a stale lower-major arm still holds the shared copy back for a plugin
    // pinned to that major. Judge each targeted major independently; use the
    // highest only for the exact-pin warning and newer-major advisory.
    const targetMajors = [...new Set(matching.map(major))].sort((a, b) => a - b)
    let heldBack = false
    for (const targetMajor of targetMajors) {
      const inMajor = releases.filter((v) => major(v) === targetMajor)
      if (inMajor.length === 0) continue
      const newestInMajor = newest(inMajor)
      if (!matching.includes(newestInMajor)) {
        heldBack = true
        errors++
        findings.push({
          level: 'error',
          message:
            name +
            ' range "' +
            range +
            '" excludes ' +
            newestInMajor +
            ', the newest ' +
            targetMajor +
            '.x release. All plugins on a server share one hoisted copy of ' +
            name +
            ', ' +
            "resolved to the newest version that satisfies every installed plugin's range — this range " +
            'holds the shared copy back for every other plugin. Widen the ' +
            targetMajor +
            '.x bound (e.g. "^' +
            newestInMajor +
            '")'
        })
      }
    }
    if (heldBack) continue

    // The exact-pin and newer-major advisories reference the newest stable
    // release in the highest targeted major. When that major has only
    // prereleases (matching() admits them, releases() filters them out) there
    // is nothing stable to advise against, so skip both.
    const highestMajor = targetMajors[targetMajors.length - 1]
    const highestStable = releases.filter((v) => major(v) === highestMajor)
    if (highestStable.length === 0) continue
    const newestInHighest = newest(highestStable)
    if (EXACT_VERSION_RE.test(range.trim())) {
      findings.push({
        level: 'warning',
        message:
          name +
          ' is pinned to the exact version ' +
          range +
          '. ' +
          'That equals the newest ' +
          highestMajor +
          '.x release today, but as soon as a newer version is ' +
          'published this pin holds the shared hoisted copy back for every plugin on the server. ' +
          'Use "^' +
          newestInHighest +
          '" instead'
      })
    }
    if (major(latest) > highestMajor) {
      findings.push({
        level: 'notice',
        message:
          name +
          ' ' +
          latest +
          ' is available, a newer major than this plugin\'s range "' +
          range +
          '" targets. Staying on ' +
          highestMajor +
          '.x is fine for compatibility — consider ' +
          'evaluating an update when convenient'
      })
    }
  }

  return { findings, errors, skipped }
}

// Bound each npm lookup so a stalled registry connection can't eat the whole
// job — a timeout throws and is handled as a skip.
const NPM_VIEW_TIMEOUT_MS = 30000

export function npmRegistry(): Registry {
  // 'name'/'name@range' resolves through npm, so no semver dependency is
  // needed.
  function viewField(spec: string, field: string): string[] {
    const out = execFileSync('npm', ['view', spec, field, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NPM_VIEW_TIMEOUT_MS
    }).trim()
    if (!out) return []
    const parsed = JSON.parse(out)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  // npm prints its error as JSON on stdout under --json; E404/ETARGET are its
  // "no version matches" answers, anything else is a lookup failure to skip.
  function npmErrorCode(err: unknown): string | undefined {
    try {
      return JSON.parse((err as { stdout: string }).stdout).error.code
    } catch {
      return undefined
    }
  }

  return {
    latest: (name) => viewField(name, 'version')[0],
    releases: (name) =>
      viewField(name, 'versions').filter((v) => !v.includes('-')),
    matching: (name, range) => {
      try {
        return viewField(name + '@' + range, 'version')
      } catch (err) {
        const code = npmErrorCode(err)
        if (code === 'E404' || code === 'ETARGET') {
          throw new NoMatchError('no match')
        }
        throw err
      }
    }
  }
}

// A finding message embeds the plugin's own range text, which is untrusted;
// escape the workflow-command data characters so it can't break out of the
// annotation line and inject another command.
function escapeCommandData(message: string): string {
  return message
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

function main(): void {
  const manifest = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
  const pkg = JSON.parse(manifest) as PackageManifest
  const { findings, errors, skipped } = checkCoreRanges(pkg, npmRegistry())
  for (const { level, message } of findings) {
    console.log('::' + level + '::' + escapeCommandData(message))
  }
  if (errors > 0) process.exit(1)
  console.log(
    skipped > 0
      ? 'Shared core package range check completed with ' +
          skipped +
          ' skipped lookup(s)'
      : 'Shared core package ranges OK'
  )
}

// Run only when executed directly (node/tsx/ts-node), not when imported.
// Compares the invoked script's basename rather than __filename, which is
// undefined when a plugin repo's "type": "module" makes tsx load this as ESM.
if (basename(process.argv[1] ?? '').startsWith('check-core-ranges')) {
  main()
}
