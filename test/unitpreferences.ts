import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { rimraf } from 'rimraf'
import { startServer } from './ts-servertestutilities'
import { WsPromiser, serverTestConfigDirectory } from './servertestutilities'
// Import from dist, not src: the running server loads the dist build and we
// need the same module instance (and its initialized applicationDataPath).
import {
  getActivePresetForUser,
  getDefaultCategory,
  invalidatePresetCache,
  loadUserPreferences,
  saveUserPreferences
} from '../dist/unitpreferences/loader'

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const UNITPREFS_DIR = path.join(__dirname, '../unitpreferences')

describe('Unit Preferences', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stop: any
  let host: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendDelta: any
  let savedConfigJson: string

  before(async function () {
    // Save files that tests modify so we can restore them
    savedConfigJson = fs.readFileSync(
      path.join(UNITPREFS_DIR, 'config.json'),
      'utf-8'
    )
    const s = await startServer()
    stop = s.stop
    host = s.host
    port = parseInt(host.split(':').pop() as string, 10)
    sendDelta = s.sendDelta
  })

  after(async function () {
    await stop()
    // Restore files modified by tests
    fs.writeFileSync(path.join(UNITPREFS_DIR, 'config.json'), savedConfigJson)
    await rimraf(path.join(serverTestConfigDirectory(), 'baseDeltas.json'))
  })

  describe('Definitions API', function () {
    it('returns unit definitions with expected structure', async function () {
      const res = await fetch(`${host}/signalk/v1/unitpreferences/definitions`)
      expect(res.status).to.equal(200)

      const defs = await res.json()

      // Speed conversions
      expect(defs).to.have.property('m/s')
      expect(defs['m/s'].conversions).to.have.property('kn')
      expect(defs['m/s'].conversions['kn']).to.have.property('formula')
      expect(defs['m/s'].conversions['kn']).to.have.property('inverseFormula')
      expect(defs['m/s'].conversions['kn']).to.have.property('symbol', 'kn')

      // Temperature conversions
      expect(defs).to.have.property('K')
      expect(defs['K'].conversions).to.have.property('C')
      expect(defs['K'].conversions).to.have.property('F')
      expect(defs['K'].conversions['C'].formula).to.equal('value - 273.15')
    })
  })

  describe('Preset API', function () {
    it('returns the active preset with categories', async function () {
      const res = await fetch(`${host}/signalk/v1/unitpreferences/active`)
      expect(res.status).to.equal(200)

      const preset = await res.json()
      expect(preset).to.have.property('categories')
      expect(preset.categories).to.have.property('speed')
      expect(preset.categories['speed'].baseUnit).to.equal('m/s')
      expect(preset.categories['speed'].targetUnit).to.equal('kn')
    })

    it('switching preset changes the active preset', async function () {
      // Verify starting preset
      let res = await fetch(`${host}/signalk/v1/unitpreferences/config`)
      const originalConfig = await res.json()
      expect(originalConfig.activePreset).to.equal('nautical-metric')

      // Switch to imperial-us
      res = await fetch(`${host}/signalk/v1/unitpreferences/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: 'imperial-us' })
      })
      expect(res.status).to.equal(200)

      // Verify active preset changed
      res = await fetch(`${host}/signalk/v1/unitpreferences/active`)
      const newPreset = await res.json()
      expect(newPreset.categories['speed'].targetUnit).to.equal('mph')
      expect(newPreset.categories['temperature'].targetUnit).to.equal('F')

      // Restore
      await fetch(`${host}/signalk/v1/unitpreferences/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: 'nautical-metric' })
      })
    })
  })

  describe('REST meta enrichment', function () {
    it('enriches speed path meta with displayUnits from default category', async function () {
      await sendDelta('environment.wind.speedTrue', 10)
      await sleep(50)

      const res = await fetch(
        `${host}/signalk/v1/api/vessels/self/environment/wind/speedTrue/meta`
      )
      expect(res.status).to.equal(200)

      const meta = await res.json()
      expect(meta).to.have.property('displayUnits')
      expect(meta.displayUnits.category).to.equal('speed')
      expect(meta.displayUnits.targetUnit).to.equal('kn')
      expect(meta.displayUnits.formula).to.include('1.94384')
      expect(meta.displayUnits).to.have.property('inverseFormula')
      expect(meta.displayUnits.symbol).to.equal('kn')
    })

    it('enriches temperature path meta with offset conversion', async function () {
      await sendDelta('environment.outside.temperature', 293.15)
      await sleep(50)

      const res = await fetch(
        `${host}/signalk/v1/api/vessels/self/environment/outside/temperature/meta`
      )
      expect(res.status).to.equal(200)

      const meta = await res.json()
      expect(meta).to.have.property('displayUnits')
      expect(meta.displayUnits.category).to.equal('temperature')
      expect(meta.displayUnits.targetUnit).to.equal('C')
      expect(meta.displayUnits.formula).to.equal('value - 273.15')
    })

    it('returns no displayUnits for paths without default category', async function () {
      await sendDelta('some.custom.path', 42)
      await sleep(50)

      const res = await fetch(
        `${host}/signalk/v1/api/vessels/self/some/custom/path/meta`
      )

      // Path may not have meta at all, or meta without displayUnits
      if (res.status === 200) {
        const meta = await res.json()
        expect(meta.displayUnits).to.equal(undefined)
      }
      // 404 is also acceptable — no schema meta for unknown path
    })
  })

  describe('PUT meta displayUnits', function () {
    it('path-level targetUnit override takes precedence over preset', async function () {
      await sendDelta('navigation.speedOverGround', 5)
      await sleep(50)

      // Set path-specific override to km/h
      const putRes = await fetch(
        `${host}/signalk/v1/api/vessels/self/navigation/speedOverGround.meta`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: { displayUnits: { category: 'speed', targetUnit: 'km/h' } }
          })
        }
      )
      expect(putRes.status).to.equal(202)
      await sleep(100)

      // Verify override is used
      const getRes = await fetch(
        `${host}/signalk/v1/api/vessels/self/navigation/speedOverGround/meta`
      )
      expect(getRes.status).to.equal(200)

      const meta = await getRes.json()
      expect(meta.displayUnits.targetUnit).to.equal('km/h')
      expect(meta.displayUnits.formula).to.include('3.6')
    })

    it('rejects category with mismatched SI unit', async function () {
      // headingTrue has units=rad, speed category expects m/s
      const res = await fetch(
        `${host}/signalk/v1/api/vessels/self/navigation/headingTrue.meta`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: { displayUnits: { category: 'speed' } }
          })
        }
      )
      expect(res.status).to.equal(400)
    })
  })

  describe('Formula validation', function () {
    it('rejects invalid formulas in custom definitions', async function () {
      const res = await fetch(
        `${host}/signalk/v1/unitpreferences/custom-definitions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'm/s': {
              conversions: {
                bad: {
                  formula: 'value * (',
                  inverseFormula: 'value',
                  symbol: '?'
                }
              }
            }
          })
        }
      )
      expect(res.status).to.equal(400)
    })
  })

  describe('Cache invalidation', function () {
    afterEach(async function () {
      await fetch(`${host}/signalk/v1/unitpreferences/custom-definitions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      await fetch(`${host}/signalk/v1/unitpreferences/custom-categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
    })

    it('GET /definitions reflects custom definitions after PUT', async function () {
      // Prime the merged-definitions cache
      let res = await fetch(`${host}/signalk/v1/unitpreferences/definitions`)
      const before = await res.json()
      expect(before['m/s'].conversions).to.not.have.property('cacheTest')

      res = await fetch(
        `${host}/signalk/v1/unitpreferences/custom-definitions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'm/s': {
              conversions: {
                cacheTest: {
                  formula: 'value * 2',
                  inverseFormula: 'value / 2',
                  symbol: 'ct'
                }
              }
            }
          })
        }
      )
      expect(res.status).to.equal(200)

      res = await fetch(`${host}/signalk/v1/unitpreferences/definitions`)
      const after = await res.json()
      expect(after['m/s'].conversions).to.have.property('cacheTest')
      expect(after['m/s'].conversions.cacheTest.symbol).to.equal('ct')
    })

    it('GET /categories reflects custom categories after PUT', async function () {
      let res = await fetch(`${host}/signalk/v1/unitpreferences/categories`)
      const before = await res.json()
      expect(before.categoryToBaseUnit).to.not.have.property(
        'cacheTestCategory'
      )

      res = await fetch(
        `${host}/signalk/v1/unitpreferences/custom-categories`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cacheTestCategory: 'm/s' })
        }
      )
      expect(res.status).to.equal(200)

      res = await fetch(`${host}/signalk/v1/unitpreferences/categories`)
      const after = await res.json()
      expect(after.categoryToBaseUnit).to.have.property(
        'cacheTestCategory',
        'm/s'
      )
    })

    it('invalidatePresetCache forces re-read of a custom preset on disk', async function () {
      const TEST_USER = 'cache-test-user'
      const presetName = 'invalidate-test-preset'
      const customDir = path.join(
        serverTestConfigDirectory(),
        'unitpreferences',
        'presets',
        'custom'
      )
      const presetPath = path.join(customDir, `${presetName}.json`)
      const userDir = path.join(
        serverTestConfigDirectory(),
        'applicationData',
        'users',
        TEST_USER
      )

      try {
        fs.mkdirSync(customDir, { recursive: true })

        fs.writeFileSync(
          presetPath,
          JSON.stringify({
            version: '1.0.0',
            name: 'v1',
            categories: {
              speed: { baseUnit: 'm/s', targetUnit: 'kn' }
            }
          })
        )
        saveUserPreferences(TEST_USER, { activePreset: presetName })

        // Prime the cache.
        const primed = getActivePresetForUser(TEST_USER)
        expect(primed.name).to.equal('v1')

        // Overwrite on disk; without invalidation the cache should still win.
        fs.writeFileSync(
          presetPath,
          JSON.stringify({
            version: '1.0.0',
            name: 'v2',
            categories: {
              speed: { baseUnit: 'm/s', targetUnit: 'mph' }
            }
          })
        )
        const stillCached = getActivePresetForUser(TEST_USER)
        expect(stillCached.name).to.equal('v1')

        // Invalidate, then the next read picks up the new file.
        invalidatePresetCache(presetName)
        const refreshed = getActivePresetForUser(TEST_USER)
        expect(refreshed.name).to.equal('v2')
      } finally {
        if (fs.existsSync(presetPath)) fs.unlinkSync(presetPath)
        invalidatePresetCache(presetName)
        await rimraf(userDir)
      }
    })
  })

  describe('Default category wildcard matching', function () {
    it('matches single-segment wildcard patterns', function () {
      expect(getDefaultCategory('propulsion.engine1.temperature')).to.equal(
        'temperature'
      )
      expect(getDefaultCategory('electrical.batteries.house.voltage')).to.equal(
        'voltage'
      )
      expect(getDefaultCategory('propulsion.port.oilPressure')).to.equal(
        'pressure'
      )
    })

    it('does not let wildcard span path segments', function () {
      // 'propulsion.*.temperature' must not match a deeper path; '*' is one
      // segment, not greedy across dots.
      expect(
        getDefaultCategory('propulsion.engine1.temperature.value')
      ).to.equal(null)
    })
  })

  describe('WebSocket meta enrichment', function () {
    it('sends displayUnits in meta deltas for new paths', async function () {
      const ws = new WsPromiser(
        `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=self&sendMeta=all&sendCachedValues=false`
      )

      // Consume hello message
      const hello = await ws.nextMsg()
      expect(hello).to.not.equal('timeout')

      // Send a speed delta — server should send meta delta with displayUnits
      await sendDelta('environment.wind.speedApparent', 8)
      await sleep(100)

      // Collect messages — look for meta delta
      const messages: string[] = ws.messages.slice(1) // skip hello
      let foundMetaWithDisplayUnits = false

      for (const msgStr of messages) {
        try {
          const msg = JSON.parse(msgStr)
          if (msg.updates) {
            for (const update of msg.updates) {
              if (update.meta) {
                for (const entry of update.meta) {
                  if (
                    entry.path === 'environment.wind.speedApparent' &&
                    entry.value?.displayUnits
                  ) {
                    expect(entry.value.displayUnits.category).to.equal('speed')
                    expect(entry.value.displayUnits.targetUnit).to.equal('kn')
                    expect(entry.value.displayUnits).to.have.property('formula')
                    foundMetaWithDisplayUnits = true
                  }
                }
              }
            }
          }
        } catch {
          // skip non-JSON messages
        }
      }

      expect(
        foundMetaWithDisplayUnits,
        'Expected meta delta with displayUnits for environment.wind.speedApparent'
      ).to.equal(true)

      ws.ws.close()
    })

    it('pushes meta deltas when preset changes', async function () {
      // First send a delta so the server has available paths
      await sendDelta('environment.wind.speedTrue', 10)
      await sleep(50)

      const ws = new WsPromiser(
        `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=self&sendMeta=all`,
        500
      )

      // Consume initial messages (hello + cached data + meta)
      await sleep(200)
      const initialCount = ws.messages.length

      // Switch preset to imperial-us
      const putRes = await fetch(`${host}/signalk/v1/unitpreferences/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: 'imperial-us' })
      })
      expect(putRes.status).to.equal(200)

      // Wait for meta deltas to arrive
      await sleep(200)

      // Look for meta delta with imperial-us speed unit (mph)
      const newMessages = ws.messages.slice(initialCount)
      let foundMph = false

      for (const msgStr of newMessages) {
        try {
          const msg = JSON.parse(msgStr)
          if (msg.updates) {
            for (const update of msg.updates) {
              if (update.meta) {
                for (const entry of update.meta) {
                  if (entry.value?.displayUnits?.targetUnit === 'mph') {
                    foundMph = true
                  }
                }
              }
            }
          }
        } catch {
          // skip non-JSON
        }
      }

      expect(
        foundMph,
        'Expected meta delta with targetUnit=mph after switching to imperial-us'
      ).to.equal(true)

      // Restore preset
      await fetch(`${host}/signalk/v1/unitpreferences/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: 'nautical-metric' })
      })

      ws.ws.close()
    })
  })

  describe('Primary Categories API', function () {
    it('GET returns ambiguousUnits and effectivePrimary', async function () {
      const res = await fetch(
        `${host}/signalk/v1/unitpreferences/primary-categories`
      )
      expect(res.status).to.equal(200)

      const body = await res.json()
      expect(body).to.have.property('ambiguousUnits')
      expect(body).to.have.property('effectivePrimary')

      for (const [baseUnit, cats] of Object.entries(body.ambiguousUnits)) {
        expect(cats).to.be.an('array')
        expect((cats as string[]).length).to.be.greaterThan(1)
        expect(cats as string[]).to.include(body.effectivePrimary[baseUnit])
      }
    })

    it('GET effectivePrimary falls back to system default for `m`', async function () {
      const res = await fetch(
        `${host}/signalk/v1/unitpreferences/primary-categories`
      )
      const body = await res.json()
      // unitpreferences/primary-categories.json maps 'm' -> 'distance'
      if (body.ambiguousUnits.m) {
        expect(body.effectivePrimary.m).to.equal('distance')
      }
    })

    it('PUT without authentication returns 401', async function () {
      const res = await fetch(
        `${host}/signalk/v1/unitpreferences/primary-categories`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ m: 'depth' })
        }
      )
      expect(res.status).to.equal(401)
      const body = await res.json()
      expect(body.error).to.equal('Authentication required')
    })
  })

  describe('User preferences loader', function () {
    const TEST_USER = 'unitprefs-test-user'
    const usersDir = path.join(
      serverTestConfigDirectory(),
      'applicationData',
      'users'
    )
    const testUserDir = path.join(usersDir, TEST_USER)

    afterEach(async function () {
      await rimraf(testUserDir)
    })

    it('returns null for unknown user', function () {
      const prefs = loadUserPreferences('nonexistent-user-xyz')
      expect(prefs).to.equal(null)
    })

    it('round-trips saved preferences', function () {
      saveUserPreferences(TEST_USER, { primaryCategories: { m: 'depth' } })
      const loaded = loadUserPreferences(TEST_USER)
      expect(loaded).to.deep.equal({ primaryCategories: { m: 'depth' } })
    })

    it('returns a clone so callers cannot mutate the cache', function () {
      saveUserPreferences(TEST_USER, { primaryCategories: { m: 'depth' } })
      const first = loadUserPreferences(TEST_USER)
      expect(first).to.not.equal(null)
      // Mutate the returned object
      first!.primaryCategories!.m = 'mutated'
      const second = loadUserPreferences(TEST_USER)
      expect(second!.primaryCategories!.m).to.equal('depth')
    })

    it('rejects invalid usernames', function () {
      expect(() =>
        saveUserPreferences('..', { primaryCategories: {} })
      ).to.throw(/Invalid username/)
      expect(() =>
        saveUserPreferences('.', { primaryCategories: {} })
      ).to.throw(/Invalid username/)
      expect(() =>
        saveUserPreferences('a/b', { primaryCategories: {} })
      ).to.throw(/Invalid username/)
    })
  })
})
