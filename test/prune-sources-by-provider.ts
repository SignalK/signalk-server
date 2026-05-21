import { expect } from 'chai'
import { collectProviderIds, pruneSourcesByProvider } from '../src/deltacache'

// When a connection is deleted from (or disabled in) settings.pipedProviders,
// its devices used to remain in the Data Browser and skServer/deviceIdentities
// after every restart, because loadSourcesCache() blindly re-hydrates every
// key in ~/.signalk/sources-cache.json. The helper exercised here is what
// makes the load drop entries belonging to providers that no longer exist
// or are no longer enabled.

describe('collectProviderIds', function () {
  it('returns the ids of enabled providers', function () {
    const ids = collectProviderIds([
      { id: 'sensESP', enabled: true },
      { id: 'NMEA0183' }
    ])
    expect(ids.size).to.equal(2)
    expect(ids.has('sensESP')).to.equal(true)
    expect(ids.has('NMEA0183')).to.equal(true)
  })

  it('skips providers with enabled: false', function () {
    // A disabled provider has the same staleness shape as a deleted one:
    // it stops producing fresh deltas, so its cached devices never get a
    // fresh lastSeen and would otherwise linger forever.
    const ids = collectProviderIds([
      { id: 'sensESP', enabled: true },
      { id: 'YDEN02', enabled: false }
    ])
    expect(ids.size).to.equal(1)
    expect(ids.has('sensESP')).to.equal(true)
    expect(ids.has('YDEN02')).to.equal(false)
  })

  it('returns an empty set when input is not an array', function () {
    expect(collectProviderIds(undefined).size).to.equal(0)
    expect(collectProviderIds(null).size).to.equal(0)
    expect(collectProviderIds({}).size).to.equal(0)
  })

  it('skips entries without an id', function () {
    const ids = collectProviderIds([
      { id: 'sensESP' },
      { enabled: true },
      { id: '' }
    ])
    expect(ids.size).to.equal(1)
    expect(ids.has('sensESP')).to.equal(true)
  })
})

describe('pruneSourcesByProvider', function () {
  it('removes entries whose provider id is not in the known set', function () {
    const cached: Record<string, unknown> = {
      'sensESP.131': { foo: 1 },
      'sensESP.c078c30936a14904': { foo: 2 },
      'YDEN02.131': { foo: 3 },
      'YDEN02.c078c30936a14904': { foo: 4 }
    }
    const known = new Set(['sensESP'])
    const dropped = pruneSourcesByProvider(cached, known)
    expect(dropped).to.equal(2)
    expect(Object.keys(cached).sort()).to.deep.equal([
      'sensESP.131',
      'sensESP.c078c30936a14904'
    ])
  })

  it('leaves the cache untouched when no providers are known', function () {
    // Guard against wiping the cache on a misread settings file.
    const cached: Record<string, unknown> = {
      'sensESP.131': { foo: 1 },
      'YDEN02.131': { foo: 2 }
    }
    const dropped = pruneSourcesByProvider(cached, new Set())
    expect(dropped).to.equal(0)
    expect(Object.keys(cached).length).to.equal(2)
  })

  it('handles keys without a dot separator', function () {
    // Defensive: a cache key written by an older server version, or
    // some non-provider machinery, should not throw.
    const cached: Record<string, unknown> = {
      sensESP: { foo: 1 },
      'YDEN02.131': { foo: 2 }
    }
    const known = new Set(['sensESP'])
    const dropped = pruneSourcesByProvider(cached, known)
    expect(dropped).to.equal(1)
    expect('sensESP' in cached).to.equal(true)
    expect('YDEN02.131' in cached).to.equal(false)
  })
})
