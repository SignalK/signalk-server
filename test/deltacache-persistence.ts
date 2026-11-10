import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Delta, FullSignalK } from '@signalk/server-api'
import DeltaCache from '../src/deltacache'
import {
  DeltaCachePersistenceApp,
  deltaCacheFilePath,
  restoreDeltaCache,
  saveDeltaCache
} from '../src/deltacachePersistence'
import {
  freeport,
  SERVER_START_TIMEOUT,
  startServer
} from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

const SELF = 'vessels.urn:mrn:imo:mmsi:230000001'
const OTHER = 'vessels.urn:mrn:imo:mmsi:230000002'

function valueDelta(
  context: string,
  pathName: string,
  value: unknown,
  timestamp: string,
  $source = 'can0.35'
): Delta {
  return {
    context,
    updates: [{ $source, timestamp, values: [{ path: pathName, value }] }]
  } as unknown as Delta
}

describe('delta cache persistence', function () {
  let configPath: string

  function makeApp(
    settings: DeltaCachePersistenceApp['config']['settings']
  ): DeltaCachePersistenceApp {
    // DeltaCache's constructor arms periodic sweep timers that emit
    // server events, so the fake app must absorb them.
    const app = {
      selfContext: SELF,
      signalk: new FullSignalK('urn:mrn:imo:mmsi:230000001', 'mmsi'),
      config: { configPath, settings },
      on: () => undefined,
      emit: () => undefined
    }
    const streambundle = { keys: { onValue: () => undefined } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deltaCache = new DeltaCache(app as any, streambundle as any)
    return Object.assign(app, { deltaCache })
  }

  function cachedPaths(app: DeltaCachePersistenceApp, context: string) {
    return app.deltaCache
      .getCachedDeltas(
        (d) => d.context === context,
        undefined,
        undefined,
        'all',
        true
      )
      .map((d) => ('values' in d.updates[0] ? d.updates[0].values[0] : null))
  }

  beforeEach(function () {
    configPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-deltacache-'))
  })

  afterEach(function () {
    fs.rmSync(configPath, { recursive: true, force: true })
  })

  it('restores own vessel values with their original timestamps', async function () {
    const before = makeApp({ restoreOwnData: true })
    const timestamp = new Date(Date.now() - 3600 * 1000).toISOString()
    before.deltaCache.ingestDelta(
      valueDelta(SELF, 'tanks.fuel.0.currentLevel', 0.62, timestamp)
    )
    before.deltaCache.ingestDelta(
      valueDelta(OTHER, 'navigation.speedOverGround', 3.1, timestamp)
    )
    await saveDeltaCache(before)

    const after = makeApp({ restoreOwnData: true })
    restoreDeltaCache(after)

    const restored = after.deltaCache.getCachedDeltas(
      (d) => d.context === SELF,
      undefined,
      undefined,
      'all',
      true
    )
    expect(restored).to.have.length(1)
    expect(restored[0].updates[0].timestamp).to.equal(timestamp)
    expect(cachedPaths(after, SELF)).to.deep.equal([
      { path: 'tanks.fuel.0.currentLevel', value: 0.62 }
    ])
    expect(cachedPaths(after, OTHER)).to.deep.equal([])
    const fullTree = (after.signalk as FullSignalK).retrieve()
    expect(
      fullTree.vessels['urn:mrn:imo:mmsi:230000001'].tanks.fuel['0']
        .currentLevel.value
    ).to.equal(0.62)
  })

  it('restores other vessels only when enabled and recent enough', async function () {
    const settings = {
      restoreOwnData: true,
      restoreOtherVessels: true,
      pruneContextsMinutes: 60
    }
    const before = makeApp(settings)
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const old = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    before.deltaCache.ingestDelta(
      valueDelta(OTHER, 'navigation.speedOverGround', 3.1, recent)
    )
    before.deltaCache.ingestDelta(
      valueDelta(
        'vessels.urn:mrn:imo:mmsi:230000003',
        'navigation.speedOverGround',
        5,
        old
      )
    )
    await saveDeltaCache(before)

    const after = makeApp(settings)
    restoreDeltaCache(after)

    expect(cachedPaths(after, OTHER)).to.deep.equal([
      { path: 'navigation.speedOverGround', value: 3.1 }
    ])
    expect(
      cachedPaths(after, 'vessels.urn:mrn:imo:mmsi:230000003')
    ).to.deep.equal([])
    expect(after.deltaCache.lastModifieds[OTHER]).to.equal(Date.parse(recent))
  })

  it('reads the saved file only once', async function () {
    const before = makeApp({ restoreOwnData: true })
    before.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'environment.depth.belowKeel',
        4.2,
        new Date().toISOString()
      )
    )
    await saveDeltaCache(before)

    restoreDeltaCache(makeApp({ restoreOwnData: true }))
    expect(fs.existsSync(deltaCacheFilePath(configPath))).to.equal(false)

    const later = makeApp({ restoreOwnData: true })
    restoreDeltaCache(later)
    expect(cachedPaths(later, SELF)).to.deep.equal([])
  })

  it('saves nothing and discards an old file when turned off', async function () {
    const on = makeApp({ restoreOwnData: true })
    on.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'environment.depth.belowKeel',
        4.2,
        new Date().toISOString()
      )
    )
    await saveDeltaCache(on)

    const off = makeApp({})
    restoreDeltaCache(off)
    expect(cachedPaths(off, SELF)).to.deep.equal([])
    expect(fs.existsSync(deltaCacheFilePath(configPath))).to.equal(false)

    await saveDeltaCache(off)
    expect(fs.existsSync(deltaCacheFilePath(configPath))).to.equal(false)
  })

  it('keeps a value that arrived live before the restore', async function () {
    const before = makeApp({ restoreOwnData: true })
    before.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'environment.depth.belowKeel',
        4.2,
        new Date().toISOString()
      )
    )
    await saveDeltaCache(before)

    const after = makeApp({ restoreOwnData: true })
    after.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'environment.depth.belowKeel',
        7.5,
        new Date().toISOString()
      )
    )
    restoreDeltaCache(after)
    expect(cachedPaths(after, SELF)).to.deep.equal([
      { path: 'environment.depth.belowKeel', value: 7.5 }
    ])
  })

  it('does not save base data', async function () {
    const before = makeApp({ restoreOwnData: true })
    before.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'design.draft',
        1.8,
        new Date().toISOString(),
        'defaults'
      )
    )
    await saveDeltaCache(before)

    const after = makeApp({ restoreOwnData: true })
    restoreDeltaCache(after)
    expect(cachedPaths(after, SELF)).to.deep.equal([])
  })

  it('skips saved entries without a context', function () {
    fs.mkdirSync(path.dirname(deltaCacheFilePath(configPath)), {
      recursive: true
    })
    const timestamp = new Date().toISOString()
    fs.writeFileSync(
      deltaCacheFilePath(configPath),
      JSON.stringify([
        { updates: [{ $source: 'can0.35', timestamp, values: [] }] },
        {
          context: 42,
          updates: [{ $source: 'can0.35', timestamp, values: [] }]
        },
        valueDelta(SELF, 'environment.depth.belowKeel', 4.2, timestamp)
      ])
    )
    const app = makeApp({ restoreOwnData: true, restoreOtherVessels: true })
    restoreDeltaCache(app)
    expect(cachedPaths(app, SELF)).to.deep.equal([
      { path: 'environment.depth.belowKeel', value: 4.2 }
    ])
  })

  it('starts empty when the saved file is broken', function () {
    fs.mkdirSync(path.dirname(deltaCacheFilePath(configPath)), {
      recursive: true
    })
    fs.writeFileSync(deltaCacheFilePath(configPath), '[{"context":')
    const app = makeApp({ restoreOwnData: true })
    const errors: unknown[] = []
    const consoleError = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    try {
      restoreDeltaCache(app)
    } finally {
      console.error = consoleError
    }
    expect(cachedPaths(app, SELF)).to.deep.equal([])
    expect(errors).to.have.length(1)
    expect(fs.existsSync(deltaCacheFilePath(configPath))).to.equal(false)
  })
})

describe('delta cache persistence across a server restart', function () {
  this.timeout(SERVER_START_TIMEOUT)

  async function restartedValue(restoreOwnData: boolean) {
    const first = await startServer({ restoreOwnData })
    await first.sendDelta('tanks.fuel.0.currentLevel', 0.62)
    await first.stop()

    const port = await freeport()
    const second = await startServerP(port, false, {
      settings: { interfaces: { plugins: true }, restoreOwnData }
    })
    try {
      const res = await fetch(
        `http://localhost:${port}/signalk/v1/api/vessels/self/tanks/fuel/0/currentLevel`
      )
      return res.status === 200 ? (await res.json()).value : undefined
    } finally {
      await second.stop()
    }
  }

  it('serves own vessel values saved by the previous run', async function () {
    expect(await restartedValue(true)).to.equal(0.62)
  })

  it('starts empty when turned off', async function () {
    expect(await restartedValue(false)).to.equal(undefined)
  })
})
