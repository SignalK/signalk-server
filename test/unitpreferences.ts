import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { rimraf } from 'rimraf'
import { startServer } from './ts-servertestutilities'
import { WsPromiser, serverTestConfigDirectory } from './servertestutilities'

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
      await sleep(200)

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
      await sleep(200)

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
      await sleep(200)

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
      await sleep(200)

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
      await sleep(300)

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
      await sleep(500)

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
      await sleep(200)

      const ws = new WsPromiser(
        `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=self&sendMeta=all`,
        500
      )

      // Consume initial messages (hello + cached data + meta)
      await sleep(1000)
      const initialCount = ws.messages.length

      // Switch preset to imperial-us
      const putRes = await fetch(`${host}/signalk/v1/unitpreferences/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: 'imperial-us' })
      })
      expect(putRes.status).to.equal(200)

      // Wait for meta deltas to arrive
      await sleep(1000)

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
})
