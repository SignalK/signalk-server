import { expect } from 'chai'
import path from 'path'
import { rimraf } from 'rimraf'
import type { MetaValue, ServerAPI } from '@signalk/server-api'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'
// Import from dist, not src: the running server loads the dist build and the
// test needs the same module instance (and its user preference cache).
import { saveUserPreferences } from '../dist/unitpreferences/loader'

// The fixture plugin there hands back the app object it was given.
const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const BASE_DELTAS_FILE = path.join(CONFIG_DIR, 'baseDeltas.json')
const APPLICATION_DATA_DIR = path.join(CONFIG_DIR, 'applicationData')

// Meta lands in a process-wide registry that outlives the server it was sent
// to, so these paths belong to this suite alone.
const SPEED_PATH = 'testDisplayUnits.speed'
const TEMPERATURE_PATH = 'testDisplayUnits.temperature'
const OVERRIDE_PATH = 'testDisplayUnits.overriddenSpeed'
const BASE_PATH = 'testDisplayUnits.baseSpeed'
const CUSTOM_PATH = 'testDisplayUnits.customSpeed'
const UNKNOWN_UNIT_PATH = 'testDisplayUnits.unknownTargetUnit'
const THROWING_PATH = 'testDisplayUnits.throwingFormula'
const UNPARSEABLE_PATH = 'testDisplayUnits.unparseableFormula'
const NON_NUMERIC_PATH = 'testDisplayUnits.nonNumericFormula'
const DESCRIPTION_ONLY_PATH = 'testDisplayUnits.descriptionOnly'
const LENGTH_PATH = 'testDisplayUnits.length'
const HMS_DURATION_PATH = 'testDisplayUnits.hmsDuration'
const DHMS_DURATION_PATH = 'testDisplayUnits.dhmsDuration'
const HOURS_DURATION_PATH = 'testDisplayUnits.hoursDuration'

const IMPERIAL_USER = 'displayunits-imperial-user'
const DEPTH_USER = 'displayunits-depth-user'
const USER_WITHOUT_PREFERENCES = 'displayunits-user-without-preferences'
const INVALID_USERNAME = 'not/a/username'

const KNOTS_PER_MS = 1.94384
const MPH_PER_MS = 2.2369362920544025
const ZERO_CELSIUS_IN_KELVIN = 273.15
const METRES_PER_NAUTICAL_MILE = 1852
const FURLONGS_PER_FORTNIGHT_PER_MS = 1209600 / 201.168
const PRECISION = 1e-9
// The unit definitions round the metre to nautical mile factor.
const NAUTICAL_MILE_PRECISION = 1e-6

interface PluginInfo {
  id: string
  app: ServerAPI
}

describe('Plugin display units', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let stop: () => Promise<unknown>
  let host: string
  let app: ServerAPI
  let origConfigDir: string | undefined

  const setActivePreset = async (activePreset: string) => {
    const res = await fetch(`${host}/signalk/v1/unitpreferences/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activePreset })
    })
    expect(res.status).to.equal(200)
  }

  const setMeta = async (skPath: string, value: object) => {
    expect(await app.setDefaultMetadata(skPath, value as MetaValue)).to.equal(
      true
    )
  }

  before(async () => {
    origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    await rimraf(BASE_DELTAS_FILE)
    const port = await freeport()
    host = `http://localhost:${port}`
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      CONFIG_DIR
    )
    stop = () => server.stop()
    const plugin = (server.app.plugins as PluginInfo[]).find(
      (p) => p.id === 'testplugin'
    )
    expect(plugin, 'testplugin should be loaded').to.not.equal(undefined)
    app = plugin!.app

    await setMeta(SPEED_PATH, {
      units: 'm/s',
      displayUnits: { category: 'speed' }
    })
    await setMeta(TEMPERATURE_PATH, { units: 'K' })
    await setMeta(OVERRIDE_PATH, {
      units: 'm/s',
      displayUnits: { category: 'speed', targetUnit: 'km/h' }
    })
    await setMeta(BASE_PATH, {
      units: 'm/s',
      displayUnits: { category: 'base' }
    })
    await setMeta(CUSTOM_PATH, {
      units: 'm/s',
      displayUnits: {
        category: 'custom',
        targetUnit: 'furlong/fortnight',
        formula: 'value * 1209600 / 201.168',
        inverseFormula: 'value * 201.168 / 1209600',
        symbol: 'fur/ftn'
      }
    })
    await setMeta(UNKNOWN_UNIT_PATH, {
      units: 'm/s',
      displayUnits: { category: 'speed', targetUnit: 'warp' }
    })
    await setMeta(THROWING_PATH, {
      units: 'm/s',
      displayUnits: {
        category: 'custom',
        targetUnit: 'broken',
        formula: 'value * noSuchSymbol'
      }
    })
    await setMeta(UNPARSEABLE_PATH, {
      units: 'm/s',
      displayUnits: {
        category: 'custom',
        targetUnit: 'broken',
        formula: 'value *'
      }
    })
    await setMeta(NON_NUMERIC_PATH, {
      units: 'm/s',
      displayUnits: {
        category: 'custom',
        targetUnit: 'moving',
        formula: 'value > 0'
      }
    })
    await setMeta(DESCRIPTION_ONLY_PATH, { description: 'no units here' })
    await setMeta(LENGTH_PATH, { units: 'm' })
    await setMeta(HMS_DURATION_PATH, {
      units: 's',
      displayUnits: { category: 'time', targetUnit: 'HH:MM:SS' }
    })
    await setMeta(DHMS_DURATION_PATH, {
      units: 's',
      displayUnits: { category: 'time', targetUnit: 'DD:HH:MM:SS' }
    })
    await setMeta(HOURS_DURATION_PATH, {
      units: 's',
      displayUnits: { category: 'time', targetUnit: 'hour' }
    })

    saveUserPreferences(IMPERIAL_USER, { activePreset: 'imperial-us' })
    saveUserPreferences(DEPTH_USER, { primaryCategories: { m: 'depth' } })
  })

  after(async () => {
    await stop()
    await rimraf(BASE_DELTAS_FILE)
    await rimraf(APPLICATION_DATA_DIR)
    // Mocha runs every test file in one process, so leaving this set would
    // point whatever runs next at the plugin fixtures.
    if (origConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
    }
  })

  it('converts a stored category under the active preset', () => {
    const converted = app.convertToDisplayUnits(SPEED_PATH, 10)
    expect(converted?.value).to.be.closeTo(10 * KNOTS_PER_MS, PRECISION)
    expect(converted?.symbol).to.equal('kn')
    expect(converted?.displayFormat).to.equal('0.0')
  })

  it('returns the resolution clients receive in meta', async () => {
    const displayUnits = app.getDisplayUnits(SPEED_PATH)
    const meta = await fetch(
      `${host}/signalk/v1/api/vessels/self/${SPEED_PATH.replace(/\./g, '/')}/meta`
    ).then((r) => r.json())
    expect(displayUnits).to.deep.equal(meta.displayUnits)
    expect(displayUnits?.targetUnit).to.equal('kn')
  })

  it('converts through the default category for the SI unit', () => {
    const converted = app.convertToDisplayUnits(TEMPERATURE_PATH, 293.15)
    expect(converted?.value).to.be.closeTo(
      293.15 - ZERO_CELSIUS_IN_KELVIN,
      PRECISION
    )
    expect(converted?.symbol).to.equal('°C')
  })

  it('applies a stored path target unit over the preset', () => {
    const converted = app.convertToDisplayUnits(OVERRIDE_PATH, 10)
    expect(converted?.value).to.be.closeTo(36, PRECISION)
    expect(converted?.symbol).to.equal('km/h')
  })

  it('leaves a base category value in SI', () => {
    const converted = app.convertToDisplayUnits(BASE_PATH, 10)
    expect(converted?.value).to.equal(10)
    expect(converted?.symbol).to.equal('m/s')
  })

  it('converts a custom category with its stored formula', () => {
    const converted = app.convertToDisplayUnits(CUSTOM_PATH, 1)
    expect(converted?.value).to.be.closeTo(
      FURLONGS_PER_FORTNIGHT_PER_MS,
      PRECISION
    )
    expect(converted?.symbol).to.equal('fur/ftn')
  })

  it('has nothing for a path with neither units nor category', () => {
    expect(app.getDisplayUnits(DESCRIPTION_ONLY_PATH)).to.equal(undefined)
    expect(app.convertToDisplayUnits(DESCRIPTION_ONLY_PATH, 1)).to.equal(
      undefined
    )
  })

  it('has nothing for a path without any metadata', () => {
    expect(app.getDisplayUnits('testDisplayUnits.unknownPath')).to.equal(
      undefined
    )
    expect(
      app.convertToDisplayUnits('testDisplayUnits.unknownPath', 1)
    ).to.equal(undefined)
  })

  it('has nothing for an unknown target unit', () => {
    expect(app.getDisplayUnits(UNKNOWN_UNIT_PATH)).to.equal(undefined)
    expect(app.convertToDisplayUnits(UNKNOWN_UNIT_PATH, 1)).to.equal(undefined)
  })

  it('returns nothing rather than throwing when a formula fails', () => {
    expect(app.convertToDisplayUnits(THROWING_PATH, 1)).to.equal(undefined)
    expect(app.convertToDisplayUnits(UNPARSEABLE_PATH, 1)).to.equal(undefined)
  })

  it('returns nothing for a formula that does not yield a number', () => {
    expect(app.convertToDisplayUnits(NON_NUMERIC_PATH, 1)).to.equal(undefined)
  })

  it('has nothing for the formatted duration targets', () => {
    expect(app.convertToDisplayUnits(HMS_DURATION_PATH, 97389)).to.equal(
      undefined
    )
    expect(app.convertToDisplayUnits(DHMS_DURATION_PATH, 97389)).to.equal(
      undefined
    )
  })

  it('converts a duration to a numeric time unit', () => {
    expect(
      app.convertToDisplayUnits(HOURS_DURATION_PATH, 7200)?.value
    ).to.be.closeTo(2, PRECISION)
  })

  it('follows a change of the active preset on the next call', async () => {
    await setActivePreset('imperial-us')
    try {
      const converted = app.convertToDisplayUnits(SPEED_PATH, 10)
      expect(converted?.value).to.be.closeTo(10 * MPH_PER_MS, PRECISION)
      expect(converted?.symbol).to.equal('mph')
    } finally {
      await setActivePreset('nautical-metric')
    }
    expect(app.convertToDisplayUnits(SPEED_PATH, 10)?.symbol).to.equal('kn')
  })

  it("converts under a user's own preset when given the username", () => {
    const converted = app.convertToDisplayUnits(SPEED_PATH, 10, IMPERIAL_USER)
    expect(converted?.value).to.be.closeTo(10 * MPH_PER_MS, PRECISION)
    expect(converted?.symbol).to.equal('mph')
    expect(app.getDisplayUnits(SPEED_PATH, IMPERIAL_USER)?.targetUnit).to.equal(
      'mph'
    )
  })

  it("converts under the admin's preset for a user without preferences", () => {
    expect(
      app.convertToDisplayUnits(SPEED_PATH, 10, USER_WITHOUT_PREFERENCES)
        ?.symbol
    ).to.equal('kn')
  })

  it("converts under the admin's preset for an invalid username", () => {
    expect(
      app.convertToDisplayUnits(SPEED_PATH, 10, INVALID_USERNAME)?.symbol
    ).to.equal('kn')
  })

  it("uses a user's primary category for an ambiguous SI unit", () => {
    expect(app.getDisplayUnits(LENGTH_PATH)?.category).to.equal('distance')
    const converted = app.convertToDisplayUnits(
      LENGTH_PATH,
      METRES_PER_NAUTICAL_MILE
    )
    expect(converted?.value).to.be.closeTo(1, NAUTICAL_MILE_PRECISION)
    expect(converted?.symbol).to.equal('nmi')

    expect(app.getDisplayUnits(LENGTH_PATH, DEPTH_USER)?.category).to.equal(
      'depth'
    )
    const forDepthUser = app.convertToDisplayUnits(LENGTH_PATH, 5, DEPTH_USER)
    expect(forDepthUser?.value).to.equal(5)
    expect(forDepthUser?.symbol).to.equal('m')
  })
})
