import { strict as assert } from 'node:assert'
import { createDecipheriv } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Plugin, ServerAPI } from '@signalk/server-api'
import boatSystems, {
  antennaPosition,
  bilgePumpDue,
  CHARGE_STATES,
  CIRCUITS,
  inverterSurgeAmps,
  orionXsRecord,
  parseSwitchValue,
  PUSHPIT_ANTENNAS,
  PushpitGnss,
  SIMULATOR_SOURCE,
  RECORD_ORION_XS,
  RECORD_SOLAR_CHARGER,
  solarChargerRecord,
  switchPath,
  victronManufacturerData,
  VICTRON_DEVICES,
  ZIGBEE_SENSORS,
  zigbeeDevices
} from './index.ts'

type PutHandler = (
  context: string,
  path: string,
  value: unknown
) => { statusCode: number }

interface Delta {
  updates: { values?: { path: string; value: unknown }[] }[]
}

function fakeApp() {
  const handlers = new Map<string, PutHandler>()
  const messages: Delta[] = []
  const errors: string[] = []
  const app = {
    getSelfPath: () => ({ latitude: 53.3, longitude: 5.1 }),
    streambundle: {
      getSelfBus: () => ({ onValue: () => () => {} })
    },
    handleMessage: (_id: string, delta: Delta) => {
      messages.push(delta)
    },
    registerPutHandler: (
      _context: string,
      path: string,
      handler: PutHandler
    ) => {
      handlers.set(path, handler)
    },
    setPluginStatus: () => {},
    error: (msg: string) => {
      errors.push(msg)
    }
  }
  return { app: app as unknown as ServerAPI, handlers, messages, errors }
}

function lastValue(messages: Delta[], path: string) {
  let found: unknown
  for (const delta of messages) {
    for (const update of delta.updates) {
      for (const value of update.values ?? [])
        if (value.path === path) found = value.value
    }
  }
  return found
}

// Reads Instant Readout fields least significant bit first, as Victron documents them
function unpackBits(record: Buffer, widths: number[], signed: boolean[]) {
  let bit = 0
  return widths.map((width, n) => {
    let raw = 0n
    for (let i = 0; i < width; i++, bit++) {
      if ((record[bit >> 3] >> (bit & 7)) & 1) raw |= 1n << BigInt(i)
    }
    return Number(signed[n] ? BigInt.asIntN(width, raw) : raw)
  })
}

function decrypt(device: (typeof VICTRON_DEVICES)[string], data: Buffer) {
  const key = Buffer.from(device.key, 'hex')
  const counter = Buffer.alloc(16)
  counter.writeUInt16LE(data.readUInt16LE(5), 0)
  const decipher = createDecipheriv('aes-128-ctr', key, counter)
  return Buffer.concat([decipher.update(data.subarray(8)), decipher.final()])
}

describe('parseSwitchValue', () => {
  it('accepts what apps, rules and N2K send', () => {
    for (const on of [true, 1, 'on']) assert.equal(parseSwitchValue(on), 1)
    for (const off of [false, 0, 'off']) assert.equal(parseSwitchValue(off), 0)
  })

  it('rejects anything else', () => {
    for (const other of [2, 'yes', null, undefined, {}])
      assert.equal(parseSwitchValue(other), undefined)
  })
})

describe('events for Alert Center', () => {
  it('runs the bilge pump for 45 s every 45 minutes', () => {
    assert.equal(bilgePumpDue(0), true)
    assert.equal(bilgePumpDue(44), true)
    assert.equal(bilgePumpDue(45), false)
    assert.equal(bilgePumpDue(45 * 60 - 1), false)
    assert.equal(bilgePumpDue(45 * 60), true)
  })

  it('draws the inverter surge for one minute in every 70', () => {
    const start = 50 * 60
    assert.equal(inverterSurgeAmps(start - 1), 0)
    assert.ok(inverterSurgeAmps(start) > 0)
    assert.ok(inverterSurgeAmps(start + 59) > 0)
    assert.equal(inverterSurgeAmps(start + 60), 0)
    assert.ok(inverterSurgeAmps(start + 70 * 60) > 0)
  })
})

describe('Victron Instant Readout', () => {
  it('encrypts a solar charger record the consumer can read back', () => {
    const device = VICTRON_DEVICES.bimini
    const record = solarChargerRecord({
      state: CHARGE_STATES.bulk,
      batteryVolts: 13.42,
      batteryAmps: 21.3,
      yieldTodayJ: 1.25 * 3_600_000,
      solarWatts: 312
    })
    const data = victronManufacturerData(
      device,
      RECORD_SOLAR_CHARGER,
      0x1234,
      record
    )
    assert.deepEqual([...data.subarray(0, 2)], [0x10, 0x02])
    assert.equal(data.readUInt16LE(2), device.modelId)
    assert.equal(data[4], RECORD_SOLAR_CHARGER)
    assert.equal(data.readUInt16LE(5), 0x1234)
    assert.equal(data[7], Buffer.from(device.key, 'hex')[0])
    const [state, error, volts, amps, yieldKwh, watts] = unpackBits(
      decrypt(device, data),
      [8, 8, 16, 16, 16, 16],
      [false, false, true, true, false, false]
    )
    assert.deepEqual(
      [state, error, volts / 100, amps / 10, yieldKwh / 100, watts],
      [CHARGE_STATES.bulk, 0, 13.42, 21.3, 1.25, 312]
    )
  })

  it('encrypts an Orion XS record with its input side', () => {
    const device = VICTRON_DEVICES.orionThruster
    const record = orionXsRecord({
      state: CHARGE_STATES.absorption,
      outputVolts: 14.2,
      outputAmps: 32.5,
      inputVolts: 13.27,
      inputAmps: 36.6
    })
    const data = victronManufacturerData(device, RECORD_ORION_XS, 7, record)
    const [state, , outV, outA, inV, inA] = unpackBits(
      decrypt(device, data),
      [8, 8, 16, 16, 16, 16],
      [false, false, true, true, false, false]
    )
    assert.deepEqual(
      [state, outV / 100, outA / 10, inV / 100, inA / 10],
      [CHARGE_STATES.absorption, 14.2, 32.5, 13.27, 36.6]
    )
  })
})

describe('demo boat systems plugin', () => {
  let plugin: Plugin | undefined
  const realFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 200 })) as typeof fetch
  })

  afterEach(() => {
    plugin?.stop()
    globalThis.fetch = realFetch
  })

  function start() {
    const fake = fakeApp()
    plugin = boatSystems(fake.app)
    plugin.start({}, () => {})
    return fake
  }

  it('publishes every circuit with its initial state and a name', () => {
    const { messages } = start()
    for (const circuit of CIRCUITS)
      assert.equal(lastValue(messages, switchPath(circuit)), circuit.initial)
  })

  it('switches a circuit on a PUT and publishes the new state', () => {
    const { handlers, messages } = start()
    const anchor = switchPath({ bank: 10, channel: 5 })
    const handler = handlers.get(anchor)
    assert.ok(handler)
    assert.equal(handler('vessels.self', anchor, true).statusCode, 200)
    assert.equal(lastValue(messages, anchor), 1)
    assert.equal(handler('vessels.self', anchor, 0).statusCode, 200)
    assert.equal(lastValue(messages, anchor), 0)
  })

  it('refuses a PUT that is neither on nor off', () => {
    const { handlers, messages } = start()
    const anchor = switchPath({ bank: 10, channel: 5 })
    assert.equal(
      handlers.get(anchor)?.('vessels.self', anchor, 'bright').statusCode,
      400
    )
    assert.equal(lastValue(messages, anchor), 0)
  })

  it('publishes the freezer itself until signalk-zigbee follows the network', () => {
    const { messages } = start()
    const freezer = lastValue(
      messages,
      'environment.inside.freezer.temperature'
    )
    assert.ok(typeof freezer === 'number' && freezer < 273.15)
  })

  it('publishes the three banks', () => {
    const { messages } = start()
    for (const bank of ['house', 'bowThruster', 'starter']) {
      const soc = lastValue(
        messages,
        `electrical.batteries.${bank}.capacity.stateOfCharge`
      )
      assert.ok(typeof soc === 'number' && soc > 0 && soc <= 1)
    }
  })
})

describe('simulated Zigbee network', () => {
  it('lists the espOS coordinator and both sensors with their exposes', () => {
    const devices = zigbeeDevices(new Map())
    assert.equal(devices[0].type, 'Coordinator')
    const sensors = devices.slice(1)
    assert.deepEqual(
      sensors.map((d) => d.friendly_name),
      ZIGBEE_SENSORS.map((s) => s.friendlyName)
    )
    for (const device of sensors) {
      const properties = (
        device as { definition: { exposes: { property: string }[] } }
      ).definition.exposes.map((e) => e.property)
      assert.ok(
        properties.includes('temperature') && properties.includes('humidity')
      )
    }
  })

  it('names a renamed sensor by its new name', () => {
    const [, freezer] = zigbeeDevices(
      new Map([[ZIGBEE_SENSORS[0].ieee, 'Deep freezer']])
    )
    assert.equal(freezer.friendly_name, 'Deep freezer')
  })
})

describe('pushpit GNSS antennas', () => {
  const centre = { latitude: 53.2, longitude: 5.3 }
  const length = 11
  const aftStarboard = { fromBow: 10.5, fromCenter: 1 }

  it('places an aft starboard antenna south-east of the centre when heading north', () => {
    const p = antennaPosition(centre, 0, length, aftStarboard)
    assert.ok(p.latitude < centre.latitude)
    assert.ok(p.longitude > centre.longitude)
  })

  it('places the same antenna south-west of the centre when heading east', () => {
    const p = antennaPosition(centre, Math.PI / 2, length, aftStarboard)
    assert.ok(p.latitude < centre.latitude)
    assert.ok(p.longitude < centre.longitude)
  })

  it('reports each antenna under its own source when the simulator moves', () => {
    const deltas: {
      updates: { $source?: string; values: { path: string }[] }[]
    }[] = []
    let onPosition: (u: { $source: string; value: unknown }) => void = () => {}
    const app = {
      streambundle: {
        getSelfBus: () => ({
          onValue: (cb: typeof onPosition) => {
            onPosition = cb
            return () => {}
          }
        })
      },
      getSelfPath: (path: string) =>
        path === 'design.length.value.overall' ? length : 0.5,
      handleMessage: (_id: string, delta: (typeof deltas)[number]) => {
        deltas.push(delta)
      }
    } as unknown as ServerAPI
    const gnss = new PushpitGnss(app)
    gnss.start()

    onPosition({ $source: 'gnss.port', value: centre })
    assert.equal(deltas.length, 0)

    onPosition({ $source: SIMULATOR_SOURCE, value: centre })
    assert.deepEqual(
      deltas.map((d) => d.updates[0].$source),
      PUSHPIT_ANTENNAS.map((a) => a.$source)
    )
    assert.ok(
      deltas.every((d) => d.updates[0].values[0].path === 'navigation.position')
    )
    gnss.stop()
  })
})
