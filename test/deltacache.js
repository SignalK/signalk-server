const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('@signalk/signalk-schema').chaiModule)
const _ = require('lodash')
import { startServer } from './ts-servertestutilities'

const testDelta = {
  context: 'vessels.self',
  updates: [
    {
      timestamp: '2014-05-03T09:14:11.100Z',
      values: [
        {
          path: 'navigation.trip.log',
          value: 43374
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.099Z',
      values: [
        {
          path: 'imaginary.path',
          value: 17404540
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.098Z',
      values: [
        {
          path: 'navigation.courseOverGroundTrue',
          value: 172.9
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.097Z',
      values: [
        {
          path: 'navigation.speedOverGround',
          value: 3.85
        }
      ]
    },
    {
      timestamp: '2014-05-03T09:14:11.096Z',
      $source: 'defaults',
      values: [
        {
          path: '',
          value: { name: 'TestBoat' }
        }
      ]
    }
  ]
}

const expectedOrder = [
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.096Z',
        values: [
          {
            path: '',
            value: {
              name: 'TestBoat'
            }
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.097Z',
        values: [
          {
            path: 'navigation.speedOverGround',
            value: 3.85
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.098Z',
        values: [
          {
            path: 'navigation.courseOverGroundTrue',
            value: 172.9
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:db826a2c-c80a-4f69-8199-a83e41f45127',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.099Z',
        values: [
          {
            path: 'imaginary.path',
            value: 17404540
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'deltaFromHttp',
        timestamp: '2014-05-03T09:14:11.100Z',
        values: [
          {
            path: 'navigation.trip.log',
            value: 43374
          }
        ]
      }
    ]
  },
  {
    context:
      'vessels.urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e',
    updates: [
      {
        $source: 'defaults',
        timestamp: '2018-06-14T18:19:39.083Z',
        values: [
          {
            path: '',
            value: {
              uuid: 'urn:mrn:signalk:uuid:2204ae24-c944-5ffe-8d1d-4d411c9cea2e'
            }
          }
        ]
      }
    ]
  }
]

describe('Deltacache', () => {
  let doStop, theServer, doSendADelta

  before(() =>
    startServer().then((s) => {
      const { sendADelta, stop, server } = s
      doStop = stop
      theServer = server
      doSendADelta = sendADelta
      return sendADelta(testDelta)
    })
  )

  after(() => doStop())

  it('returns valid full tree', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, [])

    const self = _.get(fullTree, fullTree.self)
    self.should.have.nested.property('navigation.trip.log.value', 43374)
    self.should.have.nested.property('imaginary.path.value', 17404540)
    self.should.have.nested.property(
      'navigation.courseOverGroundTrue.value',
      172.9
    )
    self.should.have.nested.property('navigation.speedOverGround.value', 3.85)
    self.should.have.nested.property('name', 'TestBoat')

    delete self.imaginary
    delete self.navigation.course //FIXME until in schema
    fullTree.should.be.validSignalK
  })

  it('deltas ordered properly', function () {
    var deltas = theServer.app.deltaCache
      .getCachedDeltas(() => true, null)
      .filter((delta) => delta.updates[0].$source !== 'courseApi')
    // console.log(JSON.stringify(deltas, null, 2))
    deltas.length.should.equal(expectedOrder.length)
    for (var i = 0; i < expectedOrder.length; i++) {
      if (!deltas[i].updates[0].meta) {
        deltas[i].updates[0].values[0].path.should.equal(
          expectedOrder[i].updates[0].values[0].path
        )
      } else {
        deltas[i].updates[0].meta[0].path.should.equal(
          expectedOrder[i].updates[0].meta[0].path
        )
      }
    }
  })

  it('returns /sources correctly', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, ['sources'])
    const self = _.get(fullTree, fullTree.self)
    delete self.imaginary
    delete self.navigation.course //FIXME until in schema
    fullTree.should.be.validSignalK
    fullTree.sources.should.deep.equal({
      defaults: {},
      deltaFromHttp: {}
    })
  })

  it('ingestDelta stores all sources in cache', function () {
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'gps.primary',
          timestamp: '2024-01-15T10:30:00.000Z',
          values: [
            {
              path: 'navigation.magneticVariation',
              value: 0.12
            }
          ]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'gps.backup',
              timestamp: '2024-01-15T10:30:01.000Z',
              values: [
                {
                  path: 'navigation.magneticVariation',
                  value: 0.13
                }
              ]
            }
          ]
        })
      )
      .then(() => {
        // Both sources should be in the cache (ingestDelta stores all)
        const selfId = theServer.app.selfId
        const leaf = _.get(theServer.app.deltaCache.cache, [
          'vessels',
          selfId,
          'navigation',
          'magneticVariation'
        ])
        leaf.should.have.property('gps.primary')
        leaf.should.have.property('gps.backup')
        leaf['gps.primary'].value.should.equal(0.12)
        leaf['gps.backup'].value.should.equal(0.13)
      })
  })

  it('ingestDelta stamps sourceMeta freshness for every source', function () {
    // The priority engine drops non-winner deltas before they reach
    // fullsignalk.addUpdate (the other sourceMeta stamper). Without
    // ingestDelta also stamping, filtered-out sources would age out
    // and badge Offline in admin Priority Groups despite the cache
    // holding fresh data for them. Both sources sent above should
    // therefore have a sourceMeta entry now.
    const sourceMeta = theServer.app.signalk.sourceMeta
    sourceMeta.should.have.property('gps.primary')
    sourceMeta.should.have.property('gps.backup')
    sourceMeta['gps.primary'].lastSeen.should.be.above(0)
    sourceMeta['gps.backup'].lastSeen.should.be.above(0)
  })

  it('getCachedDeltas fans out unrouted multi-source paths', function () {
    // With no priority configuration, every cached source is delivered
    // — preferredSources stays empty for unrouted paths so the
    // bootstrap snapshot mirrors what the live unfiltered stream
    // produces. (Earlier the test asserted last-writer-wins dedup,
    // but that was an artefact of preferredSources being written
    // before the engine's routesPath gate was wired up; the gate
    // now correctly skips paths the user hasn't priorited.)
    const selfContext = 'vessels.' + theServer.app.selfId
    const cachedDeltas = theServer.app.deltaCache.getCachedDeltas(
      (d) => d.context === selfContext,
      null
    )
    const magVarDeltas = cachedDeltas.filter(
      (d) =>
        d.updates[0].values &&
        d.updates[0].values[0].path === 'navigation.magneticVariation'
    )
    magVarDeltas.length.should.equal(2)
    const sources = magVarDeltas.map((d) => d.updates[0].$source).sort()
    sources.should.deep.equal(['gps.backup', 'gps.primary'])
  })

  it('buildFull includes all sources in values object', function () {
    const fullTree = theServer.app.deltaCache.buildFull(null, [])
    const self = _.get(fullTree, fullTree.self)
    const magVar = self.navigation.magneticVariation
    // Top-level value should exist
    magVar.should.have.property('value')
    // Both sources should appear in .values
    magVar.should.have.property('values')
    magVar.values.should.have.property('gps.primary')
    magVar.values.should.have.property('gps.backup')
  })

  it('getCachedDeltas with sourcePolicy=all returns all sources per path', function () {
    const selfContext = 'vessels.' + theServer.app.selfId
    const allDeltas = theServer.app.deltaCache.getCachedDeltas(
      (d) => d.context === selfContext,
      null,
      undefined,
      'all'
    )
    const magVarDeltas = allDeltas.filter(
      (d) =>
        d.updates[0].values &&
        d.updates[0].values[0].path === 'navigation.magneticVariation'
    )
    // Should return deltas from both sources
    magVarDeltas.length.should.equal(2)
    const sources = magVarDeltas.map((d) => d.updates[0].$source).sort()
    sources.should.deep.equal(['gps.backup', 'gps.primary'])
  })

  it('getMultiSourcePaths excludes notifications', function () {
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'i70.a',
          timestamp: '2024-01-15T10:30:00.000Z',
          values: [
            {
              path: 'notifications.instrument.AISConnectionLost',
              value: { state: 'alarm', message: 'AIS lost' }
            }
          ]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'i70.b',
              timestamp: '2024-01-15T10:30:01.000Z',
              values: [
                {
                  path: 'notifications.instrument.AISConnectionLost',
                  value: { state: 'alarm', message: 'AIS lost' }
                }
              ]
            }
          ]
        })
      )
      .then(() => {
        const paths = theServer.app.deltaCache.getMultiSourcePaths()
        paths.should.not.have.property(
          'notifications.instrument.AISConnectionLost'
        )
        for (const path of Object.keys(paths)) {
          path.startsWith('notifications').should.equal(false)
        }
      })
  })

  it('getMultiSourcePaths surfaces fan-out paths even with one publisher', function () {
    // When the user has tagged a path as fan-out (sentinel `*` entry
    // in priorities.json) and only one source is currently emitting,
    // the path would normally drop below the multi-source threshold
    // and disappear from the priorities UI. The fan-out branch in
    // getMultiSourcePaths must keep the path in the result so its
    // group affiliation survives.
    const fanOutPath = 'navigation.gnss.satellitesInView'
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'fanout.solo',
          timestamp: '2024-01-15T10:30:02.000Z',
          values: [{ path: fanOutPath, value: 7 }]
        }
      ]
    })
      .then(() => {
        // Stamp the fan-out marker into the running config (simulates
        // a save from the admin UI).
        const settings = theServer.app.config.settings
        if (!settings.priorityOverrides) settings.priorityOverrides = {}
        settings.priorityOverrides[fanOutPath] = [
          { sourceRef: '*', timeout: 0 }
        ]
        // Prime a priority group that lists the live publisher so the
        // fan-out branch can find the matching group and inject all
        // its sources as publishers, anchoring the path back to the
        // group.
        settings.priorityGroups = [
          {
            id: 'fanout.test.group',
            sources: ['fanout.solo', 'fanout.partner']
          }
        ]
        const paths = theServer.app.deltaCache.getMultiSourcePaths()
        paths.should.have.property(fanOutPath)
        paths[fanOutPath].should.include('fanout.solo')
        paths[fanOutPath].should.include('fanout.partner')
      })
      .finally(() => {
        // Always restore so a failing assertion doesn't leak state to
        // subsequent tests.
        const settings = theServer.app.config.settings
        if (settings.priorityOverrides) {
          delete settings.priorityOverrides[fanOutPath]
        }
        delete settings.priorityGroups
      })
  })

  it('getReconciledGroups attaches a source to at most one group', function () {
    // Reproduces the "Saving priorities settings failed!" bug: when
    // a new source publishes BOTH a path covered by a saved group
    // (so it gets added as a newcomer) AND a path published by other
    // unsaved sources (so it would otherwise also surface as part of
    // an "unsaved residue" connected component), the source must end
    // up in only one reconciled group. Otherwise the save validator
    // — which forbids the same source in two active groups — rejects
    // the payload and the user can't save.
    const PATH_GROUPED = 'environment.depth.shared'
    const PATH_RESIDUE = 'environment.depth.residueOnly'
    const settings = theServer.app.config.settings
    settings.priorityGroups = [
      {
        id: 'savedGroup',
        sources: ['savedA', 'savedB']
      }
    ]
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'savedA',
          timestamp: '2024-02-01T10:00:00.000Z',
          values: [{ path: PATH_GROUPED, value: 1 }]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'savedB',
              timestamp: '2024-02-01T10:00:01.000Z',
              values: [{ path: PATH_GROUPED, value: 2 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerX',
              timestamp: '2024-02-01T10:00:02.000Z',
              values: [{ path: PATH_GROUPED, value: 3 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerX',
              timestamp: '2024-02-01T10:00:03.000Z',
              values: [{ path: PATH_RESIDUE, value: 4 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'unattachedY',
              timestamp: '2024-02-01T10:00:04.000Z',
              values: [{ path: PATH_RESIDUE, value: 5 }]
            }
          ]
        })
      )
      .then(() => {
        const reconciled = theServer.app.deltaCache.getReconciledGroups()
        const sourceToGroupCount = new Map()
        for (const g of reconciled) {
          for (const s of g.sources) {
            sourceToGroupCount.set(s, (sourceToGroupCount.get(s) || 0) + 1)
          }
        }
        const dups = [...sourceToGroupCount.entries()].filter(([, n]) => n > 1)
        dups.should.deep.equal([])
        // newcomerX was claimed by savedGroup as a newcomer; the
        // residue branch must NOT also create a card containing it.
        const newcomerInSaved = reconciled.find(
          (g) =>
            g.matchedSavedId === 'savedGroup' && g.sources.includes('newcomerX')
        )
        newcomerInSaved.should.not.equal(undefined)
        const newcomerInResidue = reconciled.find(
          (g) => g.matchedSavedId === null && g.sources.includes('newcomerX')
        )
        ;(newcomerInResidue === undefined).should.equal(true)
      })
      .finally(() => {
        delete settings.priorityGroups
      })
  })

  it('getReconciledGroups does not add the same newcomer to two active saved groups', function () {
    // A live publisher that fans out across paths owned by TWO different
    // saved groups must not be added as a newcomer to both. Before the
    // fix, the second group's newcomer loop saw the source as unclaimed
    // (sourceToSavedGroup was never updated when the first group claimed
    // it) and added it again, so the PUT /skServer/priorities validator
    // — a source may belong to at most one active group — rejected the
    // save and the user saw "Saving priorities settings failed!".
    const PATH_A = 'environment.depth.groupA'
    const PATH_B = 'environment.depth.groupB'
    const settings = theServer.app.config.settings
    settings.priorityGroups = [
      {
        id: 'groupA',
        sources: ['savedA1', 'savedA2']
      },
      {
        id: 'groupB',
        sources: ['savedB1', 'savedB2']
      }
    ]
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'savedA1',
          timestamp: '2024-03-01T10:00:00.000Z',
          values: [{ path: PATH_A, value: 1 }]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'savedA2',
              timestamp: '2024-03-01T10:00:01.000Z',
              values: [{ path: PATH_A, value: 2 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'savedB1',
              timestamp: '2024-03-01T10:00:02.000Z',
              values: [{ path: PATH_B, value: 3 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'savedB2',
              timestamp: '2024-03-01T10:00:03.000Z',
              values: [{ path: PATH_B, value: 4 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerDual',
              timestamp: '2024-03-01T10:00:04.000Z',
              values: [{ path: PATH_A, value: 5 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerDual',
              timestamp: '2024-03-01T10:00:05.000Z',
              values: [{ path: PATH_B, value: 6 }]
            }
          ]
        })
      )
      .then(() => {
        const reconciled = theServer.app.deltaCache.getReconciledGroups()
        const sourceToGroupCount = new Map()
        for (const g of reconciled) {
          for (const s of g.sources) {
            sourceToGroupCount.set(s, (sourceToGroupCount.get(s) || 0) + 1)
          }
        }
        const dups = [...sourceToGroupCount.entries()].filter(([, n]) => n > 1)
        dups.should.deep.equal([])
        const groupsWithNewcomer = reconciled.filter((g) =>
          g.sources.includes('newcomerDual')
        )
        groupsWithNewcomer.length.should.equal(1)
      })
      .finally(() => {
        delete settings.priorityGroups
      })
  })

  it('getReconciledGroups collapses a device seen under both numeric and canName refs', function () {
    // Canonicalisation skew (cold boot / UDP gateway that missed the ISO
    // Address Claim): one physical N2K device leaks a stale numeric-src
    // leaf AND a canName leaf on the same path. buildSrcToCanonicalMap is
    // blind because app.signalk.sources has no n2k.canName for the src,
    // but the resolved canName already sits in sourceDeltas keyed by the
    // numeric src. Reconcile must collapse the two onto the canName form
    // so one device does not present two refs across two groups and trip
    // the PUT validator ("a source may belong to at most one active
    // group"). A genuinely different device on the same path must stay
    // separable.
    const PATH = 'environment.depth.canonSkew'
    const NUMERIC = 'canbus0.172'
    const CANNAME = 'canbus0.c0509635e7664732'
    const OTHER = 'canbus0.c0788c00e7e04312'
    const deltaCache = theServer.app.deltaCache
    // The recovered numeric→canName association the late address claim
    // wrote to the per-source delta store (keyed by numeric src).
    deltaCache.setSourceDelta(NUMERIC, {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: 'canbus0',
            type: 'NMEA2000',
            canName: 'c0509635e7664732',
            src: '172'
          },
          timestamp: '2024-04-01T10:00:00.000Z',
          values: []
        }
      ]
    })
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: NUMERIC,
          timestamp: '2024-04-01T10:00:01.000Z',
          values: [{ path: PATH, value: 1 }]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: CANNAME,
              timestamp: '2024-04-01T10:00:02.000Z',
              values: [{ path: PATH, value: 2 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: OTHER,
              timestamp: '2024-04-01T10:00:03.000Z',
              values: [{ path: PATH, value: 3 }]
            }
          ]
        })
      )
      .then(() => {
        const reconciled = deltaCache.getReconciledGroups()
        const allSources = []
        for (const g of reconciled) {
          for (const s of g.sources) allSources.push(s)
        }
        // The numeric ref must have been rewritten to its canName twin,
        // so it never appears verbatim and the device is a single ref.
        allSources.should.not.include(NUMERIC)
        allSources.filter((s) => s === CANNAME).length.should.equal(1)
        // The genuinely different device stays as its own distinct ref.
        allSources.filter((s) => s === OTHER).length.should.equal(1)
      })
      .finally(() => {
        deltaCache.removeSourceDelta(NUMERIC)
      })
  })

  it('lets an active group claim a newcomer that an inactive group also publishes', function () {
    // The newcomer loop runs for inactive groups too. An inactive group
    // must not claim a newcomer first and thereby suppress it on a later
    // active group's card: the save validator ignores inactive groups, so
    // an inactive claim is pure downside. With groupA inactive and groupB
    // active, the shared newcomer must surface on the active groupB.
    const PATH_A = 'environment.depth.inactiveGroupA'
    const PATH_B = 'environment.depth.activeGroupB'
    const settings = theServer.app.config.settings
    settings.priorityGroups = [
      {
        id: 'inactiveA',
        sources: ['inactiveA1', 'inactiveA2'],
        inactive: true
      },
      {
        id: 'activeB',
        sources: ['activeB1', 'activeB2']
      }
    ]
    return doSendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'inactiveA1',
          timestamp: '2024-04-01T10:00:00.000Z',
          values: [{ path: PATH_A, value: 1 }]
        }
      ]
    })
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'inactiveA2',
              timestamp: '2024-04-01T10:00:01.000Z',
              values: [{ path: PATH_A, value: 2 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'activeB1',
              timestamp: '2024-04-01T10:00:02.000Z',
              values: [{ path: PATH_B, value: 3 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'activeB2',
              timestamp: '2024-04-01T10:00:03.000Z',
              values: [{ path: PATH_B, value: 4 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerShared',
              timestamp: '2024-04-01T10:00:04.000Z',
              values: [{ path: PATH_A, value: 5 }]
            }
          ]
        })
      )
      .then(() =>
        doSendADelta({
          context: 'vessels.self',
          updates: [
            {
              $source: 'newcomerShared',
              timestamp: '2024-04-01T10:00:05.000Z',
              values: [{ path: PATH_B, value: 6 }]
            }
          ]
        })
      )
      .then(() => {
        const reconciled = theServer.app.deltaCache.getReconciledGroups()
        const activeGroupCount = new Map()
        for (const g of reconciled) {
          if (g.inactive) continue
          for (const s of g.sources) {
            activeGroupCount.set(s, (activeGroupCount.get(s) || 0) + 1)
          }
        }
        const dups = [...activeGroupCount.entries()].filter(([, n]) => n > 1)
        dups.should.deep.equal([])
        const active = reconciled.find((g) => g.matchedSavedId === 'activeB')
        active.should.not.equal(undefined)
        active.sources.should.include('newcomerShared')
      })
      .finally(() => {
        delete settings.priorityGroups
      })
  })
})
