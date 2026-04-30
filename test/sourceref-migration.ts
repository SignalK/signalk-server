import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SourceRef } from '@signalk/server-api'
import { migrateSourceRef } from '../src/sourceref-migration'

const OLD_REF = 'canhat.c08cbe00e7e00b16'
const NEW_REF = 'canhat.c08cbe05e7e00b16'

function createMockApp(
  settingsOverrides: Record<string, unknown> = {},
  configPath?: string
) {
  const removedSources: string[] = []
  let activateCalled = false

  const app = {
    argv: { s: 'settings.json' },
    config: {
      configPath: configPath ?? os.tmpdir(),
      settings: {
        ...settingsOverrides
      }
    },
    activateSourcePriorities() {
      activateCalled = true
    },
    deltaCache: {
      removeSource(sourceRef: SourceRef) {
        removedSources.push(sourceRef)
      }
    },
    emit() {
      return true
    },
    // Test accessors
    get _removedSources() {
      return removedSources
    },
    get _activateCalled() {
      return activateCalled
    }
  }
  return app
}

describe('migrateSourceRef', () => {
  it('updates sourcePriorities entries across paths', () => {
    const app = createMockApp({
      sourcePriorities: {
        'navigation.position': [
          { sourceRef: OLD_REF, timeout: 60000 },
          { sourceRef: 'canhat.other', timeout: 30000 }
        ],
        'navigation.speedOverGround': [
          { sourceRef: 'canhat.other', timeout: 30000 },
          { sourceRef: OLD_REF, timeout: 60000 }
        ]
      }
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prios = app.config.settings.sourcePriorities as any
    expect(prios['navigation.position'][0].sourceRef).to.equal(NEW_REF)
    expect(prios['navigation.position'][1].sourceRef).to.equal('canhat.other')
    expect(prios['navigation.speedOverGround'][1].sourceRef).to.equal(NEW_REF)
  })

  it('re-keys sourceAliases', () => {
    const app = createMockApp({
      sourceAliases: {
        [OLD_REF]: 'My GPS',
        'canhat.other': 'Other device'
      }
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    const aliases = app.config.settings.sourceAliases as Record<string, string>
    expect(aliases[NEW_REF]).to.equal('My GPS')
    expect(aliases).to.not.have.property(OLD_REF)
    expect(aliases['canhat.other']).to.equal('Other device')
  })

  it('re-keys ignoredInstanceConflicts with sorted pair', () => {
    const key = [OLD_REF, 'canhat.zzz'].sort().join('+')
    const app = createMockApp({
      ignoredInstanceConflicts: {
        [key]: '2026-01-01T00:00:00.000Z'
      }
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    const conflicts = app.config.settings.ignoredInstanceConflicts as Record<
      string,
      string
    >
    expect(conflicts).to.not.have.property(key)
    const newKey = [NEW_REF, 'canhat.zzz'].sort().join('+')
    expect(conflicts[newKey]).to.equal('2026-01-01T00:00:00.000Z')
  })

  it('re-keys channel labels file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sktest-'))
    try {
      const labelsPath = path.join(tmpDir, 'n2k-channel-labels.json')
      fs.writeFileSync(
        labelsPath,
        JSON.stringify({
          [`${OLD_REF}:130316:0`]: 'Engine Room',
          [`${OLD_REF}:130316:1`]: 'Main Cabin',
          'canhat.other:130316:0': 'Outside'
        })
      )

      const app = createMockApp({}, tmpDir)
      migrateSourceRef(app, OLD_REF, NEW_REF)

      const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf-8'))
      expect(labels[`${NEW_REF}:130316:0`]).to.equal('Engine Room')
      expect(labels[`${NEW_REF}:130316:1`]).to.equal('Main Cabin')
      expect(labels['canhat.other:130316:0']).to.equal('Outside')
      expect(labels).to.not.have.property(`${OLD_REF}:130316:0`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('calls deltaCache.removeSource with old ref', () => {
    const app = createMockApp()
    migrateSourceRef(app, OLD_REF, NEW_REF)
    expect(app._removedSources).to.include(OLD_REF)
  })

  it('calls activateSourcePriorities', () => {
    const app = createMockApp()
    migrateSourceRef(app, OLD_REF, NEW_REF)
    expect(app._activateCalled).to.be.true
  })

  it('does not write settings when nothing matches', () => {
    const app = createMockApp({
      sourcePriorities: {
        'navigation.speedOverGround': [
          { sourceRef: 'canhat.other', timeout: 60000 }
        ]
      }
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    // Priority entry should be unchanged
    const prios = app.config.settings.sourcePriorities as Record<
      string,
      Array<{ sourceRef: string }>
    >
    expect(prios['navigation.speedOverGround'][0].sourceRef).to.equal(
      'canhat.other'
    )
  })

  it('handles missing channel labels file gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sktest-'))
    try {
      const app = createMockApp({}, tmpDir)
      // Should not throw
      migrateSourceRef(app, OLD_REF, NEW_REF)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('rewrites sourceRef inside priorityGroups[].sources', () => {
    const app = createMockApp({
      priorityGroups: [
        { id: 'g1', sources: [OLD_REF, 'canhat.other'] },
        { id: 'g2', sources: ['unrelated'] }
      ]
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    const groups = app.config.settings.priorityGroups as Array<{
      id: string
      sources: string[]
    }>
    expect(groups[0].sources[0]).to.equal(NEW_REF)
    expect(groups[0].sources[1]).to.equal('canhat.other')
    expect(groups[1].sources[0]).to.equal('unrelated')
  })

  it('dedupes priorityGroups when newRef already present', () => {
    const app = createMockApp({
      priorityGroups: [{ id: 'g1', sources: [OLD_REF, NEW_REF, 'canhat.z'] }]
    })
    migrateSourceRef(app, OLD_REF, NEW_REF)

    const groups = app.config.settings.priorityGroups as Array<{
      id: string
      sources: string[]
    }>
    expect(groups[0].sources).to.deep.equal([NEW_REF, 'canhat.z'])
  })

  it('aborts migration on bus-address takeover (old CAN Name still present elsewhere)', () => {
    // canboatjs sees address 4's CAN Name flip from c050a0…→c032890…
    // because a different physical device joined and arbitrated. The
    // original device (c050a0…) is still on the bus under a new
    // address (12 here). The takeover guard must skip the rewrite.
    const TAKEOVER_OLD = 'canhat.c050a0002fb310c2'
    const TAKEOVER_NEW = 'canhat.c032890022245ab4'
    const app = createMockApp({
      priorityGroups: [
        {
          id: 'g1',
          sources: [TAKEOVER_OLD, 'canhat.other']
        }
      ],
      sourcePriorities: {
        'navigation.headingMagnetic': [
          { sourceRef: TAKEOVER_OLD, timeout: 0 },
          { sourceRef: 'canhat.other', timeout: 5000 }
        ]
      }
    })
    // Simulate the moved-original device having claimed a new address
    // before the migration runs (the deferred 10s window in index.ts).
    ;(app as unknown as { signalk: { sources: unknown } }).signalk = {
      sources: {
        canhat: {
          type: 'NMEA2000',
          '4': { n2k: { canName: 'c032890022245ab4' } },
          '12': { n2k: { canName: 'c050a0002fb310c2' } }
        }
      }
    }
    migrateSourceRef(app, TAKEOVER_OLD, TAKEOVER_NEW)

    const groups = app.config.settings.priorityGroups as Array<{
      id: string
      sources: string[]
    }>
    expect(groups[0].sources[0]).to.equal(TAKEOVER_OLD)
    expect(groups[0].sources[1]).to.equal('canhat.other')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prios = app.config.settings.sourcePriorities as any
    expect(prios['navigation.headingMagnetic'][0].sourceRef).to.equal(
      TAKEOVER_OLD
    )
    expect(app._activateCalled).to.equal(false)
    expect(app._removedSources).to.have.length(0)
  })

  it('still migrates on a true reclaim (old CAN Name no longer on the bus)', () => {
    const RECLAIM_OLD = 'canhat.c050a0002fb310c2'
    const RECLAIM_NEW = 'canhat.c08cbe05e7e00b16'
    const app = createMockApp({
      priorityGroups: [{ id: 'g1', sources: [RECLAIM_OLD, 'canhat.other'] }]
    })
    ;(app as unknown as { signalk: { sources: unknown } }).signalk = {
      sources: {
        canhat: {
          type: 'NMEA2000',
          '4': { n2k: { canName: 'c08cbe05e7e00b16' } }
          // No address still carries c050a0… — true reclaim.
        }
      }
    }
    migrateSourceRef(app, RECLAIM_OLD, RECLAIM_NEW)

    // priorityGroups is mutated synchronously even when the settings
    // write is deferred; that is enough to confirm the migration ran
    // (the takeover guard would have returned early before any
    // mutation).
    const groups = app.config.settings.priorityGroups as Array<{
      id: string
      sources: string[]
    }>
    expect(groups[0].sources[0]).to.equal(RECLAIM_NEW)
  })

  it('migrates when signalk.sources is unavailable (legacy callers)', () => {
    const app = createMockApp({
      priorityGroups: [{ id: 'g1', sources: [OLD_REF] }]
    })
    // No signalk prop on app — guard returns false, migration proceeds.
    migrateSourceRef(app, OLD_REF, NEW_REF)
    const groups = app.config.settings.priorityGroups as Array<{
      id: string
      sources: string[]
    }>
    expect(groups[0].sources[0]).to.equal(NEW_REF)
  })
})
