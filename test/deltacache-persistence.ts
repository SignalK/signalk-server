import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { performance } from 'perf_hooks'
import { Delta, FullSignalK } from '@signalk/server-api'
import DeltaCache from '../src/deltacache'
import {
  checkRestoreClock,
  DeltaCachePersistenceApp,
  deltaCacheFilePath,
  restoreDeltaCache,
  saveDeltaCache,
  StopOptions
} from '../src/deltacachePersistence'
import {
  freeport,
  SERVER_START_TIMEOUT,
  startServer
} from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

const SELF = 'vessels.urn:mrn:imo:mmsi:230000001'
const OTHER = 'vessels.urn:mrn:imo:mmsi:230000002'
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const BOOT_ID_PATH = '/proc/sys/kernel/random/boot_id'

function currentBootId(): string | undefined {
  try {
    return fs.readFileSync(BOOT_ID_PATH, 'utf-8').trim()
  } catch {
    return undefined
  }
}

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

  function writeSaved(
    deltas: unknown[],
    header: { savedAt?: number; bootId?: string; uptimeSeconds?: number } = {}
  ) {
    fs.mkdirSync(path.dirname(deltaCacheFilePath(configPath)), {
      recursive: true
    })
    fs.writeFileSync(
      deltaCacheFilePath(configPath),
      JSON.stringify({
        savedAt: Date.now(),
        bootId: currentBootId(),
        uptimeSeconds: os.uptime(),
        ...header,
        deltas
      })
    )
  }

  function fullTreeDepth(app: DeltaCachePersistenceApp) {
    return (app.signalk as FullSignalK).retrieve().vessels[
      'urn:mrn:imo:mmsi:230000001'
    ]?.environment?.depth?.belowKeel?.value
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

  it('lets a vessel saved with a future timestamp age out', async function () {
    const settings = { restoreOwnData: true, restoreOtherVessels: true }
    const before = makeApp(settings)
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
    before.deltaCache.ingestDelta(
      valueDelta(OTHER, 'navigation.speedOverGround', 3.1, future)
    )
    await saveDeltaCache(before)

    const after = makeApp(settings)
    const restoredAt = Date.now()
    restoreDeltaCache(after)
    expect(after.deltaCache.lastModifieds[OTHER]).to.be.within(
      restoredAt,
      Date.now()
    )
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

  it('does not save notifications', async function () {
    const before = makeApp({ restoreOwnData: true })
    const timestamp = new Date().toISOString()
    before.deltaCache.ingestDelta(
      valueDelta(
        SELF,
        'notifications.environment.depth.belowKeel',
        { state: 'alarm', method: ['sound'], message: 'Shallow water' },
        timestamp
      )
    )
    before.deltaCache.ingestDelta(
      valueDelta(SELF, 'environment.depth.belowKeel', 1.2, timestamp)
    )
    await saveDeltaCache(before)

    const after = makeApp({ restoreOwnData: true })
    restoreDeltaCache(after)
    expect(cachedPaths(after, SELF)).to.deep.equal([
      { path: 'environment.depth.belowKeel', value: 1.2 }
    ])
  })

  it('skips saved entries without a context', function () {
    const timestamp = new Date().toISOString()
    writeSaved([
      { updates: [{ $source: 'can0.35', timestamp, values: [] }] },
      {
        context: 42,
        updates: [{ $source: 'can0.35', timestamp, values: [] }]
      },
      valueDelta(SELF, 'environment.depth.belowKeel', 4.2, timestamp)
    ])
    const app = makeApp({ restoreOwnData: true, restoreOtherVessels: true })
    restoreDeltaCache(app)
    expect(cachedPaths(app, SELF)).to.deep.equal([
      { path: 'environment.depth.belowKeel', value: 4.2 }
    ])
  })

  it('does not mark a vessel restored when none of its values are usable', function () {
    writeSaved([
      {
        context: OTHER,
        updates: [
          {
            $source: 'can0.35',
            timestamp: new Date().toISOString(),
            values: [{ path: 'navigation.speedOverGround' }]
          }
        ]
      }
    ])
    const app = makeApp({ restoreOwnData: true, restoreOtherVessels: true })
    restoreDeltaCache(app)
    expect(app.deltaCache.lastModifieds).to.not.have.property(OTHER)
    expect(
      (app.signalk as FullSignalK).retrieve().vessels
    ).to.not.have.property('urn:mrn:imo:mmsi:230000002')
  })

  it('does not restore after a longer downtime within the same boot', function () {
    if (!currentBootId()) {
      this.skip()
    }
    // Saved "two hours of uptime ago", with the wall clock claiming it was
    // just now, as on a computer whose clock was set back meanwhile.
    writeSaved(
      [
        valueDelta(
          SELF,
          'environment.depth.belowKeel',
          4.2,
          new Date().toISOString()
        )
      ],
      { savedAt: Date.now(), uptimeSeconds: os.uptime() - 2 * 3600 }
    )
    const app = makeApp({ restoreOwnData: true, restoreMaxAgeMinutes: 60 })
    restoreDeltaCache(app)
    expect(cachedPaths(app, SELF)).to.deep.equal([])
  })

  it('restores within the same boot even if the clock jumped', function () {
    if (!currentBootId()) {
      this.skip()
    }
    writeSaved(
      [
        valueDelta(
          SELF,
          'environment.depth.belowKeel',
          4.2,
          new Date().toISOString()
        )
      ],
      { savedAt: Date.now() - 30 * 24 * HOUR_MS, uptimeSeconds: os.uptime() }
    )
    const app = makeApp({ restoreOwnData: true })
    restoreDeltaCache(app)
    expect(cachedPaths(app, SELF)).to.deep.equal([
      { path: 'environment.depth.belowKeel', value: 4.2 }
    ])
  })

  it('does not restore after a reboot when the clock shows a long downtime', function () {
    writeSaved(
      [
        valueDelta(
          SELF,
          'environment.depth.belowKeel',
          4.2,
          new Date().toISOString()
        )
      ],
      { savedAt: Date.now() - 2 * HOUR_MS, bootId: 'an-earlier-boot' }
    )
    const app = makeApp({ restoreOwnData: true, restoreMaxAgeMinutes: 60 })
    restoreDeltaCache(app)
    expect(cachedPaths(app, SELF)).to.deep.equal([])
  })

  describe('after a reboot with an unset clock', function () {
    const timestamp = new Date().toISOString()

    function restoreAfterReboot() {
      const savedAt = Date.now()
      writeSaved(
        [
          valueDelta(SELF, 'environment.depth.belowKeel', 4.2, timestamp),
          valueDelta(SELF, 'tanks.fuel.0.currentLevel', 0.62, timestamp)
        ],
        { savedAt, bootId: 'an-earlier-boot' }
      )
      const app = makeApp({ restoreOwnData: true, restoreMaxAgeMinutes: 60 })
      restoreDeltaCache(app)
      const clock = {
        savedAt,
        restoredAt: Date.now(),
        restoredAtMonotonic: performance.now()
      }
      return { app, clock }
    }

    it('drops restored values when the clock is set and shows a long downtime', function () {
      const { app, clock } = restoreAfterReboot()
      app.deltaCache.ingestDelta(
        valueDelta(
          SELF,
          'tanks.fuel.0.currentLevel',
          0.5,
          new Date().toISOString()
        )
      )

      const done = checkRestoreClock(
        app,
        clock,
        clock.restoredAt + 3 * 24 * HOUR_MS,
        clock.restoredAtMonotonic + 2 * MINUTE_MS
      )

      expect(done).to.equal(true)
      expect(cachedPaths(app, SELF)).to.deep.equal([
        { path: 'tanks.fuel.0.currentLevel', value: 0.5 }
      ])
      expect(fullTreeDepth(app)).to.equal(undefined)
    })

    it('keeps restored values when the clock is set and the downtime was short', function () {
      const { app, clock } = restoreAfterReboot()

      const done = checkRestoreClock(
        app,
        clock,
        clock.restoredAt + 20 * MINUTE_MS,
        clock.restoredAtMonotonic + 2 * MINUTE_MS
      )

      expect(done).to.equal(true)
      expect(fullTreeDepth(app)).to.equal(4.2)
      expect(cachedPaths(app, SELF)).to.have.length(2)
    })

    it('keeps waiting while the clock runs evenly', function () {
      const { app, clock } = restoreAfterReboot()

      const done = checkRestoreClock(
        app,
        clock,
        clock.restoredAt + 2 * MINUTE_MS,
        clock.restoredAtMonotonic + 2 * MINUTE_MS
      )

      expect(done).to.equal(false)
      expect(cachedPaths(app, SELF)).to.have.length(2)
    })
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

  async function savedAfterRestartRequest(body?: object) {
    const { server, host, sendDelta, stop } = await startServer({
      restoreOwnData: true
    })
    const filePath = deltaCacheFilePath(server.app.config.configPath)
    try {
      await sendDelta('tanks.fuel.0.currentLevel', 0.62)
      server.app.securityStrategy.allowRestart = () => true
      let requested: StopOptions | undefined
      // The real restart exits the process; stop the server in its place.
      server.app.stopAndExit = (options: StopOptions) => {
        requested = options
      }
      const res = await fetch(`${host}/skServer/restart`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body)
      })
      expect(res.status).to.equal(200)
      while (!requested) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await server.stop(undefined, requested)
      return fs.existsSync(filePath)
    } finally {
      await stop()
      fs.rmSync(filePath, { force: true })
    }
  }

  it('keeps data over a restart by default', async function () {
    expect(await savedAfterRestartRequest()).to.equal(true)
  })

  it('restarts with no data when asked', async function () {
    expect(await savedAfterRestartRequest({ keepData: false })).to.equal(false)
  })

  it('saves nothing when settings are reloaded in-process', async function () {
    const { server, sendDelta, stop } = await startServer({
      restoreOwnData: true
    })
    try {
      await sendDelta('tanks.fuel.0.currentLevel', 0.62)
      const start = server.start.bind(server)
      let restarted: Promise<unknown> | undefined
      server.start = () => {
        restarted = start()
        return restarted
      }
      server.reload(undefined)
      while (!restarted) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await restarted
      expect(
        fs.existsSync(deltaCacheFilePath(server.app.config.configPath))
      ).to.equal(false)
    } finally {
      await stop()
      fs.rmSync(deltaCacheFilePath(server.app.config.configPath), {
        force: true
      })
    }
  })
})
