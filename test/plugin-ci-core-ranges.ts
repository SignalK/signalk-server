import { expect } from 'chai'
import {
  checkCoreRanges,
  CheckResult,
  NoMatchError,
  Registry
} from '../.github/scripts/check-core-ranges'

const SEMVER_PARTS = 3

// A fake registry driven by a fixture map, so the range logic is tested
// without touching the network. Each package entry lists its published
// stable versions; latest() is the highest, releases() is all of them, and
// matching() replays npm's range semantics closely enough for these cases.
function fakeRegistry(catalog: Record<string, string[]>): Registry {
  function compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number)
    const bParts = b.split('.').map(Number)
    for (let i = 0; i < SEMVER_PARTS; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i]
    }
    return 0
  }
  // A single comparator arm (no '||'); union ranges are split before this.
  function admitsArm(arm: string, version: string): boolean {
    const trimmed = arm.trim()
    const [versionMajor, versionMinor] = version.split('.').map(Number)
    if (trimmed === '*') return true
    let m: RegExpMatchArray | null
    if ((m = trimmed.match(/^\^(\d+)\.(\d+)\.(\d+)$/))) {
      return (
        Number(m[1]) === versionMajor &&
        compareVersions(version, m[1] + '.' + m[2] + '.' + m[3]) >= 0
      )
    }
    if ((m = trimmed.match(/^~(\d+)\.(\d+)\.(\d+)$/))) {
      return (
        Number(m[1]) === versionMajor &&
        Number(m[2]) === versionMinor &&
        compareVersions(version, m[1] + '.' + m[2] + '.' + m[3]) >= 0
      )
    }
    // inclusive hyphen range "a.b.c - d.e.f"
    if ((m = trimmed.match(/^(\d+\.\d+\.\d+)\s+-\s+(\d+\.\d+\.\d+)$/))) {
      return (
        compareVersions(version, m[1]) >= 0 &&
        compareVersions(version, m[2]) <= 0
      )
    }
    if ((m = trimmed.match(/^(\d+)\.(\d+)$/))) {
      return Number(m[1]) === versionMajor && Number(m[2]) === versionMinor
    }
    if ((m = trimmed.match(/^=?(\d+)\.(\d+)\.(\d+)$/))) {
      return version === m[1] + '.' + m[2] + '.' + m[3]
    }
    return false
  }
  function admits(range: string, version: string): boolean {
    return range.split('||').some((arm) => admitsArm(arm, version))
  }
  return {
    latest(name) {
      const versions = catalog[name]
      if (!versions) throw new Error('unknown ' + name)
      return versions[versions.length - 1]
    },
    releases(name) {
      const versions = catalog[name]
      if (!versions) throw new Error('unknown ' + name)
      return versions
    },
    matching(name, range) {
      const versions = catalog[name]
      if (!versions) throw new Error('unknown ' + name)
      const hits = versions.filter((version) => admits(range, version))
      if (hits.length === 0) throw new NoMatchError('no match')
      return hits
    }
  }
}

const CATALOG: Record<string, string[]> = {
  '@signalk/server-api': ['2.5.0', '2.9.0', '2.29.0', '2.30.0'],
  '@canboat/canboatjs': ['2.0.0', '2.9.0', '2.12.3', '3.0.0', '3.20.0']
}

function levels(result: CheckResult): FindingLevelList {
  return result.findings.map((f) => f.level)
}
type FindingLevelList = ('error' | 'warning' | 'notice')[]

describe('plugin-ci core package range check', () => {
  const registry = fakeRegistry(CATALOG)

  it('ignores non-core dependencies', () => {
    const r = checkCoreRanges({ dependencies: { lodash: '^4.0.0' } }, registry)
    expect(r.errors).to.equal(0)
    expect(r.findings).to.be.empty
  })

  it('ignores @canboat/ts-pgns (deliberate version-policy exception)', () => {
    const r = checkCoreRanges(
      { dependencies: { '@canboat/ts-pgns': '~1.10.0' } },
      registry
    )
    expect(r.errors).to.equal(0)
    expect(r.findings).to.be.empty
  })

  it('errors (no crash) when matching() returns an empty result', () => {
    const emptyMatch: Registry = {
      latest: registry.latest,
      releases: registry.releases,
      matching: () => []
    }
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '2.9' } },
      emptyMatch
    )
    expect(r.errors).to.equal(1)
    expect(r.findings[0].message).to.include('matches no published version')
  })

  it('errors when a range excludes the newest release in its major', () => {
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '2.9' } },
      registry
    )
    expect(r.errors).to.equal(1)
    expect(levels(r)).to.include('error')
    expect(r.findings[0].message).to.include('excludes 2.30.0')
  })

  it('passes a healthy caret range that admits the newest', () => {
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '^2.5.0' } },
      registry
    )
    expect(r.errors).to.equal(0)
    expect(r.findings).to.be.empty
  })

  it('errors when the range matches no published version', () => {
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '^99.0.0' } },
      registry
    )
    expect(r.errors).to.equal(1)
    expect(r.findings[0].message).to.include('matches no published version')
  })

  it('warns on an exact pin that equals the newest in its major', () => {
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '2.30.0' } },
      registry
    )
    expect(r.errors).to.equal(0)
    expect(levels(r)).to.include('warning')
  })

  it('emits an advisory notice (never an error) when only a newer major exists', () => {
    const r = checkCoreRanges(
      { dependencies: { '@canboat/canboatjs': '^2.0.0' } },
      registry
    )
    expect(r.errors).to.equal(0)
    expect(levels(r)).to.deep.equal(['notice'])
    expect(r.findings[0].message).to.include('newer major')
  })

  it('errors on a union range with a stale lower-major arm', () => {
    // ^3.0.0 arm is fine (reaches 3.20.0), but 2.5.0 - 2.9.0 caps 2.x below
    // the newest 2.x (2.12.3) — still holds the shared copy back for a
    // plugin pinned to 2.x.
    const r = checkCoreRanges(
      { dependencies: { '@canboat/canboatjs': '2.5.0 - 2.9.0 || ^3.0.0' } },
      registry
    )
    expect(r.errors).to.equal(1)
    expect(r.findings[0].message).to.include('excludes 2.12.3')
    expect(r.findings[0].message).to.include('the newest 2.x release')
  })

  it('passes a union range where every targeted major reaches its newest', () => {
    const r = checkCoreRanges(
      { dependencies: { '@canboat/canboatjs': '^2.0.0 || ^3.0.0' } },
      registry
    )
    expect(r.errors).to.equal(0)
    expect(levels(r)).to.not.include('error')
  })

  it('does not crash when the target major has only prereleases', () => {
    // matching() admits a prerelease that releases() filters out, so the
    // highest targeted major has no stable release — must not throw.
    const prereleaseOnly: Registry = {
      latest: () => '2.30.0',
      releases: () => ['2.5.0', '2.30.0'],
      matching: () => ['3.0.0-beta.1']
    }
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '^3.0.0-beta' } },
      prereleaseOnly
    )
    expect(r.errors).to.equal(0)
    expect(levels(r)).to.not.include('error')
  })

  it('checks peerDependencies as well as dependencies', () => {
    const r = checkCoreRanges(
      { peerDependencies: { '@signalk/server-api': '2.9' } },
      registry
    )
    expect(r.errors).to.equal(1)
  })

  it('skips (does not error) on a registry lookup failure', () => {
    const flaky: Registry = {
      latest() {
        throw new Error('network')
      },
      releases() {
        throw new Error('network')
      },
      matching() {
        throw new Error('network')
      }
    }
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': '2.9' } },
      flaky
    )
    expect(r.errors).to.equal(0)
    expect(r.skipped).to.equal(1)
    expect(levels(r)).to.deep.equal(['notice'])
  })

  it('skips a non-registry spec (git/tarball) without erroring', () => {
    const withGit: Registry = {
      latest: registry.latest,
      releases: registry.releases,
      matching() {
        // a git/tarball spec is not a range npm can evaluate against the
        // registry; the accessor rethrows a plain (non-NoMatch) error
        throw new Error('not a registry version')
      }
    }
    const r = checkCoreRanges(
      { dependencies: { '@signalk/server-api': 'github:foo/bar' } },
      withGit
    )
    expect(r.errors).to.equal(0)
    expect(r.skipped).to.equal(1)
  })

  it('skips a tarball spec without erroring', () => {
    const withTarball: Registry = {
      latest: registry.latest,
      releases: registry.releases,
      matching() {
        throw new Error('not a registry version')
      }
    }
    const r = checkCoreRanges(
      {
        dependencies: {
          '@signalk/server-api': 'https://example.invalid/server-api.tgz'
        }
      },
      withTarball
    )
    expect(r.errors).to.equal(0)
    expect(r.skipped).to.equal(1)
  })

  it('deduplicates identical name@range declarations', () => {
    const r = checkCoreRanges(
      {
        dependencies: { '@signalk/server-api': '2.9' },
        peerDependencies: { '@signalk/server-api': '2.9' }
      },
      registry
    )
    expect(r.errors).to.equal(1)
  })
})
