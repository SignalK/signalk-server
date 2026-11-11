import { createCipheriv } from 'node:crypto'
import { createServer, type Server } from 'node:net'
import { Aedes } from 'aedes'
import type { Path, Plugin, ServerAPI } from '@signalk/server-api'

const PLUGIN_ID = 'signalk-demo-boat-systems'
const TICK_MS = 2000
const SECONDS_PER_HOUR = 3600
const KELVIN_OFFSET = 273.15

// Switch states are numbers, 1 on and 0 off, as NMEA 2000 switch banks
// report them and signalk-rules writes them
export interface Circuit {
  bank: number
  channel: number
  name: string
  loadAmps: number
  initial: 0 | 1
}

// Banks 10 and 13 are the demo boat's own circuits. Banks 11 and 12 carry
// the names of the sample HMI Designer layout, so that layout shows live
// switches too.
export const CIRCUITS: Circuit[] = [
  {
    bank: 10,
    channel: 1,
    name: 'Navigation lights',
    loadAmps: 0.4,
    initial: 0
  },
  { bank: 10, channel: 2, name: 'Stern light', loadAmps: 0.2, initial: 0 },
  { bank: 10, channel: 3, name: 'Steaming light', loadAmps: 0.3, initial: 0 },
  { bank: 10, channel: 4, name: 'Tricolour', loadAmps: 0.2, initial: 0 },
  { bank: 10, channel: 5, name: 'Anchor light', loadAmps: 0.2, initial: 0 },
  { bank: 10, channel: 6, name: 'Deck light', loadAmps: 1.5, initial: 0 },
  { bank: 13, channel: 1, name: 'Bow thruster', loadAmps: 0, initial: 0 },
  { bank: 13, channel: 2, name: 'Fresh water pump', loadAmps: 0.8, initial: 1 },
  { bank: 13, channel: 3, name: 'Bilge pump', loadAmps: 3, initial: 0 },
  { bank: 13, channel: 4, name: 'Fridge', loadAmps: 2.1, initial: 1 },
  { bank: 13, channel: 5, name: 'Freezer', loadAmps: 1.8, initial: 1 },
  { bank: 13, channel: 6, name: 'Saloon lights', loadAmps: 0.6, initial: 0 },
  { bank: 13, channel: 7, name: 'Cabin lights', loadAmps: 0.4, initial: 0 },
  { bank: 13, channel: 8, name: 'Instruments', loadAmps: 1.1, initial: 1 },
  { bank: 12, channel: 1, name: 'Radio galley', loadAmps: 0.3, initial: 0 },
  { bank: 12, channel: 2, name: 'Nav instruments', loadAmps: 0.2, initial: 1 },
  { bank: 12, channel: 3, name: 'AIS power', loadAmps: 0.2, initial: 1 },
  { bank: 12, channel: 4, name: 'VHF power', loadAmps: 0.3, initial: 1 },
  { bank: 12, channel: 5, name: 'Radio saloon', loadAmps: 0.3, initial: 0 },
  { bank: 12, channel: 6, name: 'AIS silent', loadAmps: 0, initial: 0 },
  { bank: 11, channel: 1, name: 'Black water valve', loadAmps: 0, initial: 0 },
  { bank: 11, channel: 2, name: 'Cockpit alarm', loadAmps: 0, initial: 1 },
  { bank: 11, channel: 3, name: 'Ambilight TV', loadAmps: 0.5, initial: 0 },
  { bank: 11, channel: 4, name: 'Fuel transfer', loadAmps: 2, initial: 0 },
  { bank: 11, channel: 5, name: 'Tender remote', loadAmps: 0, initial: 0 },
  { bank: 11, channel: 6, name: 'Deck wash pump', loadAmps: 4, initial: 0 }
]

export function switchPath(circuit: Pick<Circuit, 'bank' | 'channel'>) {
  return `electrical.switches.bank.${circuit.bank}.${circuit.channel}.state`
}

const FRIDGE = switchPath({ bank: 13, channel: 4 })
const FREEZER = switchPath({ bank: 13, channel: 5 })
const WATER_PUMP = switchPath({ bank: 13, channel: 2 })
const BILGE_PUMP = switchPath({ bank: 13, channel: 3 })

// Parses what a PUT sends: apps send true/false, rules and N2K send 1/0
export function parseSwitchValue(value: unknown): 0 | 1 | undefined {
  if (value === true || value === 1 || value === 'on') return 1
  if (value === false || value === 0 || value === 'off') return 0
  return undefined
}

export function sunElevation(date: Date, latitude: number, longitude: number) {
  const rad = Math.PI / 180
  const dayOfYear =
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
    86400000
  const declination =
    -23.44 * rad * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10))
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const hourAngle = (utcHours + longitude / 15 - 12) * 15 * rad
  const lat = latitude * rad
  return Math.asin(
    Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  )
}

interface SolarCharger {
  id: string
  name: string
  ratedWatts: number
  // panels see a share of the sky; the bimini shades the deck panels at times
  cloudPhase: number
}

const SOLAR_CHARGERS: SolarCharger[] = [
  { id: 'bimini', name: 'Solar bimini', ratedWatts: 600, cloudPhase: 0 },
  { id: 'deckPort', name: 'Solar deck port', ratedWatts: 300, cloudPhase: 1.7 },
  {
    id: 'deckStarboard',
    name: 'Solar deck starboard',
    ratedWatts: 300,
    cloudPhase: 3.1
  }
]
const PANEL_EFFICIENCY = 0.8
const CLOUD_PERIOD_S = 900
// Diffuse light keeps a low winter sun useful, so the house bank breaks even
// over a day all year round
const MIN_DAYLIGHT_FACTOR = 0.3
// The demo runs for months unattended; below this the boat would sit with a
// flat bank, which is no showcase
const HOUSE_MIN_CHARGE = 0.4

export function solarWatts(
  charger: SolarCharger,
  elevation: number,
  epochSeconds: number
) {
  if (elevation <= 0) return 0
  const clouds =
    0.75 +
    0.25 *
      Math.sin(
        (2 * Math.PI * epochSeconds) / CLOUD_PERIOD_S + charger.cloudPhase
      )
  return (
    charger.ratedWatts *
    PANEL_EFFICIENCY *
    Math.max(Math.sin(elevation), MIN_DAYLIGHT_FACTOR) *
    clouds
  )
}

interface Bank {
  id: string
  name: string
  chemistry: string
  capacityAh: number
  stateOfCharge: number
  restVoltage: (soc: number) => number
}

const lifepo4 = (soc: number) => 12.8 + 0.6 * soc
const agm = (soc: number) => 11.8 + 1.0 * soc

const FULL = 0.995
const ORION_THRUSTER_A = 50
const ORION_STARTER_A = 18
const ORION_EFFICIENCY = 0.95
const SELF_DISCHARGE_PER_HOUR = 0.0004
const FLOAT_VOLTAGE = 13.5

// The engine runs 20 minutes in every two hours, so night-time visitors see
// both the motoring and the sailing lights rule switch the lights
const ENGINE_CYCLE_S = 2 * SECONDS_PER_HOUR
const ENGINE_RUN_S = 20 * 60
const ENGINE_RPM_HZ = 1800 / 60
const ENGINE_FUEL_RATE_PER_HOUR = 0.01

export function engineRunning(epochSeconds: number) {
  return epochSeconds % ENGINE_CYCLE_S < ENGINE_RUN_S
}

// Now and then something goes on aboard for Alert Center to show: the bilge
// pump runs for a while, and the galley's inverter pulls the house bank's
// voltage down.
const BILGE_CYCLE_S = 45 * 60
const BILGE_RUN_S = 45
const SURGE_CYCLE_S = 70 * 60
const SURGE_RUN_S = 60
const SURGE_OFFSET_S = 20 * 60
const SURGE_A = 280

export function bilgePumpDue(epochSeconds: number) {
  return epochSeconds % BILGE_CYCLE_S < BILGE_RUN_S
}

export function inverterSurgeAmps(epochSeconds: number) {
  return (epochSeconds + SURGE_OFFSET_S) % SURGE_CYCLE_S < SURGE_RUN_S
    ? SURGE_A
    : 0
}

interface Tank {
  path: string
  name: string
  capacity: number
  level: number
  // ratio per hour; negative empties the tank
  rate: number
  refillAt: number
  refillTo: number
}

function chargingMode(soc: number) {
  if (soc >= FULL) return 'float'
  if (soc >= 0.9) return 'absorption'
  return 'bulk'
}

export default function (app: ServerAPI): Plugin {
  let timer: ReturnType<typeof setInterval> | undefined
  let lastTick = Date.now()
  const states = new Map<string, 0 | 1>()
  const yieldToday = new Map<string, number>()
  let yieldDay = new Date().getUTCDate()
  let gateways = new GatewaySimulator(app, {})
  const zigbee = new ZigbeeSimulator(app)
  const pushpitGnss = new PushpitGnss(app)
  let freezerC = -18
  let fridgeC = 4
  let bilgeWasDue: boolean | undefined
  const banks: Record<'house' | 'bowThruster' | 'starter', Bank> = {
    house: {
      id: 'house',
      name: 'House',
      chemistry: 'LiFePO4',
      capacityAh: 400,
      stateOfCharge: 0.78,
      restVoltage: lifepo4
    },
    bowThruster: {
      id: 'bowThruster',
      name: 'Bow thruster',
      chemistry: 'AGM',
      capacityAh: 180,
      stateOfCharge: 0.86,
      restVoltage: agm
    },
    starter: {
      id: 'starter',
      name: 'Starter',
      chemistry: 'AGM',
      capacityAh: 100,
      stateOfCharge: 0.97,
      restVoltage: agm
    }
  }
  const tanks: Tank[] = [
    {
      path: 'tanks.freshWater.0',
      name: 'Water port',
      capacity: 0.15,
      level: 0.64,
      rate: -0.004,
      refillAt: 0.2,
      refillTo: 0.95
    },
    {
      path: 'tanks.freshWater.1',
      name: 'Water starboard',
      capacity: 0.15,
      level: 0.71,
      rate: -0.003,
      refillAt: 0.2,
      refillTo: 0.95
    },
    {
      path: 'tanks.fuel.0',
      name: 'Diesel port',
      capacity: 0.075,
      level: 0.81,
      rate: 0,
      refillAt: 0.15,
      refillTo: 0.95
    },
    {
      path: 'tanks.fuel.1',
      name: 'Diesel starboard',
      capacity: 0.075,
      level: 0.58,
      rate: 0,
      refillAt: 0.15,
      refillTo: 0.95
    },
    {
      path: 'tanks.blackWater.0',
      name: 'Black water',
      capacity: 0.06,
      level: 0.35,
      rate: 0.006,
      refillAt: 0.85,
      refillTo: 0.05
    }
  ]

  const on = (path: string) => states.get(path) === 1

  function publish(
    values: { path: string; value: unknown }[],
    meta?: { path: string; value: object }[]
  ) {
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: values.map(({ path, value }) => ({
            path: path as Path,
            value
          })),
          ...(meta
            ? {
                meta: meta.map(({ path, value }) => ({
                  path: path as Path,
                  value
                }))
              }
            : {})
        }
      ]
    } as Parameters<ServerAPI['handleMessage']>[1])
  }

  function publishSwitch(path: string) {
    publish([{ path, value: states.get(path) }])
  }

  function registerSwitches() {
    for (const circuit of CIRCUITS) {
      const path = switchPath(circuit)
      states.set(path, circuit.initial)
      app.registerPutHandler(
        'vessels.self',
        path,
        (_context, _path, value) => {
          const state = parseSwitchValue(value)
          if (state === undefined) {
            return {
              state: 'COMPLETED',
              statusCode: 400,
              message: 'Expected on or off'
            }
          }
          states.set(path, state)
          publishSwitch(path)
          return { state: 'COMPLETED', statusCode: 200 }
        },
        PLUGIN_ID
      )
    }
    publish(
      CIRCUITS.map((circuit) => ({
        path: switchPath(circuit),
        value: circuit.initial
      })),
      CIRCUITS.map((circuit) => ({
        path: switchPath(circuit),
        value: { displayName: circuit.name, units: 'bool' }
      }))
    )
  }

  function publishMeta() {
    const ratioZones = (warn: number, alarm: number, name: string) => ({
      units: 'ratio',
      zones: [
        {
          lower: 0,
          upper: alarm,
          state: 'alarm',
          message: `${name} below ${alarm * 100} %`
        },
        {
          lower: alarm,
          upper: warn,
          state: 'warn',
          message: `${name} below ${warn * 100} %`
        }
      ]
    })
    publish(
      [
        ...Object.values(banks).flatMap((bank) => [
          { path: `electrical.batteries.${bank.id}.name`, value: bank.name },
          {
            path: `electrical.batteries.${bank.id}.chemistry`,
            value: bank.chemistry
          },
          {
            path: `electrical.batteries.${bank.id}.capacity.nominal`,
            value: bank.capacityAh * 12.8 * SECONDS_PER_HOUR
          }
        ]),
        ...Object.entries(VICTRON_DEVICES).map(([id, device]) => ({
          path: `${id.startsWith('orion') ? 'electrical.chargers' : 'electrical.solar'}.${id}.name`,
          value: device.name
        })),
        ...tanks.flatMap((tank) => [
          { path: `${tank.path}.name`, value: tank.name },
          { path: `${tank.path}.capacity`, value: tank.capacity }
        ])
      ],
      [
        {
          path: 'electrical.batteries.bowThruster.capacity.stateOfCharge',
          value: ratioZones(0.5, 0.3, 'Bow thruster bank')
        },
        {
          path: 'electrical.batteries.house.voltage',
          value: {
            displayName: 'House battery',
            units: 'V',
            zones: [
              {
                lower: 0,
                upper: 11.8,
                state: 'alarm',
                message: 'House bank below 11.8 V'
              },
              {
                lower: 11.8,
                upper: 12.4,
                state: 'warn',
                message: 'House bank below 12.4 V'
              },
              {
                lower: 14.6,
                upper: 20,
                state: 'warn',
                message: 'House bank above 14.6 V'
              }
            ]
          }
        },
        {
          path: BILGE_PUMP,
          value: {
            zones: [
              {
                lower: 0.5,
                upper: 1,
                state: 'alert',
                message: 'Bilge pump running'
              }
            ]
          }
        },
        {
          path: 'electrical.batteries.starter.capacity.stateOfCharge',
          value: ratioZones(0.6, 0.4, 'Starter battery')
        },
        {
          path: 'environment.inside.refrigerator.temperature',
          value: {
            units: 'K',
            displayName: 'Fridge',
            zones: [
              {
                lower: 6 + KELVIN_OFFSET,
                upper: 9 + KELVIN_OFFSET,
                state: 'warn',
                message: 'Fridge above 6 °C'
              },
              {
                lower: 9 + KELVIN_OFFSET,
                upper: 40 + KELVIN_OFFSET,
                state: 'alarm',
                message: 'Fridge above 9 °C'
              }
            ]
          }
        },
        {
          path: 'environment.inside.freezer.temperature',
          value: {
            units: 'K',
            displayName: 'Freezer',
            zones: [
              {
                lower: -12 + KELVIN_OFFSET,
                upper: -5 + KELVIN_OFFSET,
                state: 'warn',
                message: 'Freezer above -12 °C'
              },
              {
                lower: -5 + KELVIN_OFFSET,
                upper: 40 + KELVIN_OFFSET,
                state: 'alarm',
                message: 'Freezer above -5 °C'
              }
            ]
          }
        },
        ...tanks.map((tank) => ({
          path: `${tank.path}.currentLevel`,
          value: tank.path.includes('blackWater')
            ? {
                units: 'ratio',
                zones: [
                  {
                    lower: 0.8,
                    upper: 1,
                    state: 'warn',
                    message: 'Black water tank almost full'
                  }
                ]
              }
            : ratioZones(0.3, 0.15, tank.name)
        }))
      ]
    )
  }

  function tick() {
    const now = Date.now()
    const dtS = Math.min((now - lastTick) / 1000, 60)
    lastTick = now
    const epochS = now / 1000
    const hours = dtS / SECONDS_PER_HOUR
    const position = app.getSelfPath('navigation.position.value') as
      { latitude: number; longitude: number } | undefined
    const elevation = position
      ? sunElevation(new Date(now), position.latitude, position.longitude)
      : 0
    const engine = engineRunning(epochS)
    // only a change of the cycle switches, so a visitor's own switching holds
    const bilgeDue = bilgePumpDue(epochS)
    if (bilgeWasDue !== undefined && bilgeDue !== bilgeWasDue) {
      states.set(BILGE_PUMP, bilgeDue ? 1 : 0)
      publishSwitch(BILGE_PUMP)
    }
    bilgeWasDue = bilgeDue
    const today = new Date(now).getUTCDate()
    if (today !== yieldDay) {
      yieldDay = today
      yieldToday.clear()
    }

    const house = banks.house
    const thruster = banks.bowThruster
    const starter = banks.starter
    const houseV = house.restVoltage(house.stateOfCharge)

    const solar = SOLAR_CHARGERS.map((charger) => {
      let watts = solarWatts(charger, elevation, epochS)
      // a full bank takes only what the loads draw
      if (house.stateOfCharge >= FULL) watts *= 0.3
      const joules = (yieldToday.get(charger.id) ?? 0) + watts * dtS
      yieldToday.set(charger.id, joules)
      return { charger, watts, amps: watts / houseV, joules }
    })
    const solarA = solar.reduce((sum, s) => sum + s.amps, 0)

    const orionThrusterA =
      thruster.stateOfCharge < FULL
        ? ORION_THRUSTER_A * (thruster.stateOfCharge < 0.9 ? 1 : 0.3)
        : 0.2
    const orionStarterA =
      starter.stateOfCharge < FULL ? ORION_STARTER_A * 0.3 : 0.3
    const loadsA = CIRCUITS.reduce((sum, c) => {
      const path = switchPath(c)
      if (!on(path)) return sum
      // compressors cycle; the pump runs now and then
      if (path === FRIDGE) return sum + (fridgeC > 3.5 ? c.loadAmps : 0.1)
      if (path === FREEZER) return sum + (freezerC > -19 ? c.loadAmps : 0.1)
      if (path === WATER_PUMP)
        return sum + (Math.sin(epochS / 40) > 0.85 ? 6 : 0)
      return sum + c.loadAmps
    }, 0)
    const houseA =
      solarA -
      loadsA -
      inverterSurgeAmps(epochS) -
      (orionThrusterA * 13.2) / houseV -
      (orionStarterA * 13.6) / houseV

    house.stateOfCharge = clamp(
      house.stateOfCharge + (houseA * hours) / house.capacityAh,
      HOUSE_MIN_CHARGE,
      1
    )
    thruster.stateOfCharge = clamp(
      thruster.stateOfCharge +
        ((orionThrusterA - 0.1) * hours) / thruster.capacityAh,
      0,
      1
    )
    starter.stateOfCharge = clamp(
      starter.stateOfCharge +
        ((orionStarterA - 0.2) * hours) / starter.capacityAh -
        SELF_DISCHARGE_PER_HOUR * hours,
      0,
      1
    )

    // The fridge warms up to 6.5 °C now and then, enough for its warning zone
    const fridgeTarget = on(FRIDGE)
      ? 4 + 2.5 * Math.max(0, Math.sin(epochS / 1500))
      : 20
    fridgeC += (fridgeTarget - fridgeC) * Math.min(1, dtS / 120)
    const freezerTarget = on(FREEZER) ? -18.5 : 20
    freezerC +=
      (freezerTarget - freezerC) * Math.min(1, dtS / (on(FREEZER) ? 300 : 3600))

    for (const tank of tanks) {
      let rate = tank.rate
      if (tank.path === 'tanks.fuel.0' && engine)
        rate = -ENGINE_FUEL_RATE_PER_HOUR
      tank.level += rate * hours
      if (
        (rate < 0 && tank.level <= tank.refillAt) ||
        (rate > 0 && tank.level >= tank.refillAt)
      ) {
        tank.level = tank.refillTo
      }
    }

    const insideBase = 21 + 3 * Math.sin(elevation)
    const values: { path: string; value: unknown }[] = [
      ...batteryValues(house, houseA),
      ...batteryValues(thruster, orionThrusterA - 0.1),
      ...batteryValues(starter, orionStarterA - 0.2),
      ...tanks.map((tank) => ({
        path: `${tank.path}.currentLevel`,
        value: round(tank.level, 3)
      })),
      {
        path: 'environment.inside.refrigerator.temperature',
        value: round(fridgeC + KELVIN_OFFSET, 2)
      },
      {
        path: 'environment.inside.saloon.temperature',
        value: round(insideBase + 0.8 + KELVIN_OFFSET, 2)
      },
      {
        path: 'environment.inside.saloon.relativeHumidity',
        value: round(0.66 + 0.04 * Math.sin(epochS / 2000), 3)
      },
      {
        path: 'environment.inside.forwardCabin.temperature',
        value: round(insideBase + KELVIN_OFFSET, 2)
      },
      {
        path: 'environment.inside.forwardCabin.relativeHumidity',
        value: round(0.7 + 0.03 * Math.sin(epochS / 1700), 3)
      },
      {
        path: 'environment.inside.engineRoom.temperature',
        value: round(insideBase + (engine ? 22 : 4) + KELVIN_OFFSET, 2)
      },
      { path: 'propulsion.main.state', value: engine ? 'started' : 'stopped' },
      { path: 'propulsion.main.revolutions', value: engine ? ENGINE_RPM_HZ : 0 }
    ]
    publish(values)

    const victron: VictronReading[] = [
      ...solar.map(({ charger, watts, amps, joules }) => {
        const mode = watts > 0 ? chargingMode(house.stateOfCharge) : 'off'
        const base = `electrical.solar.${charger.id}`
        return {
          device: VICTRON_DEVICES[charger.id],
          recordType: RECORD_SOLAR_CHARGER,
          record: solarChargerRecord({
            state: CHARGE_STATES[mode],
            batteryVolts: houseV,
            batteryAmps: amps,
            yieldTodayJ: joules,
            solarWatts: watts
          }),
          direct: [
            { path: `${base}.voltage`, value: round(houseV, 2) },
            { path: `${base}.current`, value: round(amps, 1) },
            { path: `${base}.panelPower`, value: Math.round(watts) },
            {
              path: `${base}.yieldToday`,
              value: Math.round(joules / 36000) * 36000
            },
            {
              path: `${base}.chargingMode`,
              value: SIGNALK_CHARGING_MODES[mode]
            }
          ]
        }
      }),
      orionReading('orionThruster', thruster, orionThrusterA, houseV),
      orionReading('orionStarter', starter, orionStarterA, houseV)
    ]
    gateways.send(victron, epochS)
    if (gateways.refused) publish(victron.flatMap((reading) => reading.direct))

    const zigbeeReading: ZigbeeReading = {
      freezerC,
      freezerHumidity: 58 + 6 * Math.sin(epochS / 2600),
      outsideC: 14 + 4 * Math.sin(elevation) + 0.6 * Math.sin(epochS / 900),
      outsideHumidity: 78 - 10 * Math.sin(elevation),
      pressureHpa: 1013 + 4 * Math.sin(epochS / 40_000)
    }
    zigbee.report(zigbeeReading)
    if (!zigbee.followed) publish(zigbeeDirect(zigbeeReading))
  }

  function orionReading(
    id: string,
    bank: Bank,
    amps: number,
    inputV: number
  ): VictronReading {
    const outputV = bank.stateOfCharge >= FULL ? FLOAT_VOLTAGE : 14.2
    const inputA = (amps * outputV) / inputV / ORION_EFFICIENCY
    const mode = chargingMode(bank.stateOfCharge)
    const base = `electrical.chargers.${id}`
    return {
      device: VICTRON_DEVICES[id],
      recordType: RECORD_ORION_XS,
      record: orionXsRecord({
        state: CHARGE_STATES[mode],
        outputVolts: outputV,
        outputAmps: amps,
        inputVolts: inputV,
        inputAmps: inputA
      }),
      direct: [
        { path: `${base}.voltage`, value: round(outputV, 2) },
        { path: `${base}.current`, value: round(amps, 1) },
        { path: `${base}.inputVoltage`, value: round(inputV, 2) },
        { path: `${base}.inputCurrent`, value: round(inputA, 1) },
        { path: `${base}.chargingMode`, value: SIGNALK_CHARGING_MODES[mode] }
      ]
    }
  }

  function batteryValues(bank: Bank, amps: number) {
    const base = `electrical.batteries.${bank.id}`
    const charging = amps > 0
    const voltage =
      bank.stateOfCharge >= FULL && charging
        ? FLOAT_VOLTAGE
        : bank.restVoltage(bank.stateOfCharge) + amps * 0.004
    const remainingAh = bank.stateOfCharge * bank.capacityAh
    return [
      { path: `${base}.voltage`, value: round(voltage, 2) },
      { path: `${base}.current`, value: round(amps, 2) },
      {
        path: `${base}.temperature`,
        value: round(24 + KELVIN_OFFSET + amps * 0.02, 2)
      },
      {
        path: `${base}.capacity.stateOfCharge`,
        value: round(bank.stateOfCharge, 4)
      },
      {
        path: `${base}.capacity.remaining`,
        value: Math.round(remainingAh * 12.8 * SECONDS_PER_HOUR)
      },
      {
        path: `${base}.capacity.timeRemaining`,
        value:
          amps < -0.05
            ? Math.round((remainingAh / -amps) * SECONDS_PER_HOUR)
            : null
      }
    ]
  }

  return {
    id: PLUGIN_ID,
    name: 'Demo boat systems',
    description:
      'Simulates the demo boat’s digital switching, batteries, solar and DC-DC chargers, tanks and fridges, and serves its floor plan page',
    schema: () => ({
      type: 'object',
      properties: {
        gatewayLogin: {
          type: 'object',
          title: 'Login the simulated BLE gateways post with',
          properties: {
            username: { type: 'string', title: 'User' },
            password: { type: 'string', title: 'Password' }
          }
        }
      }
    }),
    start: (options: { gatewayLogin?: GatewayLogin }) => {
      gateways = new GatewaySimulator(app, options.gatewayLogin ?? {})
      lastTick = Date.now()
      zigbee
        .start()
        .catch((error: unknown) =>
          app.error(`Zigbee simulator: ${String(error)}`)
        )
      pushpitGnss.start()
      registerSwitches()
      publishMeta()
      tick()
      timer = setInterval(tick, TICK_MS)
      app.setPluginStatus('Running the demo boat systems')
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = undefined
      zigbee.stop()
      pushpitGnss.stop()
    }
  }
}

// The Victron devices reach the server the way they do on a real boat: two
// ESP32 BLE gateways post the advertisements they hear to the server's BLE
// API, and signalk-victron-ble-consumer decrypts the Instant Readout records.
// These keys exist only on the demo boat; the consumer's config holds them
// too.
interface VictronDevice {
  name: string
  mac: string
  key: string
  modelId: number
}

export const VICTRON_DEVICES: Record<string, VictronDevice> = {
  bimini: {
    name: 'Solar bimini',
    mac: 'F4:3A:91:2C:7E:01',
    key: '5f1c0a9e7b3d4c6a8e2f1b0d9c7a5e3f',
    modelId: 0xa060
  },
  deckPort: {
    name: 'Solar deck port',
    mac: 'F4:3A:91:2C:7E:02',
    key: '8b2e6d4f0a1c3e5b7d9f2a4c6e8b0d1f',
    modelId: 0xa054
  },
  deckStarboard: {
    name: 'Solar deck starboard',
    mac: 'F4:3A:91:2C:7E:03',
    key: 'c3a5e7092b4d6f81a3c5e7092b4d6f81',
    modelId: 0xa054
  },
  orionThruster: {
    name: 'Orion to thruster',
    mac: 'E2:6B:14:9D:50:11',
    key: '0d2f4b6a8c1e3a5c7e9b0d2f4a6c8e1b',
    modelId: 0xa3f0
  },
  orionStarter: {
    name: 'Orion to starter',
    mac: 'E2:6B:14:9D:50:12',
    key: '7e9c1a3b5d7f9e2c4a6b8d0f1e3c5a7b',
    modelId: 0xa3c1
  }
}

export const RECORD_SOLAR_CHARGER = 0x01
export const RECORD_ORION_XS = 0x0f
const VICTRON_COMPANY_ID = 0x02e1
const APPLE_COMPANY_ID = 0x004c
const MICROSOFT_COMPANY_ID = 0x0006
// VE.Direct device states
export const CHARGE_STATES: Record<string, number> = {
  off: 0,
  bulk: 3,
  absorption: 4,
  float: 5
}
// as signalk-victron-ble-consumer maps them
const SIGNALK_CHARGING_MODES: Record<string, string> = {
  off: 'other',
  bulk: 'bulk',
  absorption: 'acceptance',
  float: 'float'
}
const NO_ERROR = 0

interface VictronReading {
  device: VictronDevice
  recordType: number
  record: Buffer
  // what signalk-victron-ble-consumer publishes from the record
  direct: { path: string; value: unknown }[]
}

export interface GatewayLogin {
  username?: string
  password?: string
}

// Instant Readout fields are packed least significant bit first
function packBits(fields: [value: number, width: number][], length: number) {
  const out = Buffer.alloc(length)
  let bit = 0
  for (const [value, width] of fields) {
    const raw = BigInt.asUintN(width, BigInt(Math.round(value)))
    for (let i = 0; i < width; i++, bit++) {
      if ((raw >> BigInt(i)) & 1n) out[bit >> 3] |= 1 << (bit & 7)
    }
  }
  return out
}

export function solarChargerRecord(r: {
  state: number
  batteryVolts: number
  batteryAmps: number
  yieldTodayJ: number
  solarWatts: number
}) {
  return packBits(
    [
      [r.state, 8],
      [NO_ERROR, 8],
      [r.batteryVolts * 100, 16],
      [r.batteryAmps * 10, 16],
      [r.yieldTodayJ / 36000, 16],
      [r.solarWatts, 16],
      [0x1ff, 9]
    ],
    16
  )
}

export function orionXsRecord(r: {
  state: number
  outputVolts: number
  outputAmps: number
  inputVolts: number
  inputAmps: number
}) {
  return packBits(
    [
      [r.state, 8],
      [NO_ERROR, 8],
      [r.outputVolts * 100, 16],
      [r.outputAmps * 10, 16],
      [r.inputVolts * 100, 16],
      [r.inputAmps * 10, 16],
      [0, 32]
    ],
    16
  )
}

// The manufacturer data of an Instant Readout advertisement: a header with
// the model, record type, nonce and the key's first byte, then the record
// encrypted with AES-128-CTR under a counter that starts at the nonce
export function victronManufacturerData(
  device: VictronDevice,
  recordType: number,
  nonce: number,
  record: Buffer
) {
  const key = Buffer.from(device.key, 'hex')
  const counter = Buffer.alloc(16)
  counter.writeUInt16LE(nonce, 0)
  const cipher = createCipheriv('aes-128-ctr', key, counter)
  const header = Buffer.alloc(8)
  header[0] = 0x10
  header[1] = 0x02
  header.writeUInt16LE(device.modelId, 2)
  header[4] = recordType
  header.writeUInt16LE(nonce, 5)
  header[7] = key[0]
  return Buffer.concat([header, cipher.update(record), cipher.final()])
}

function adStructures(companyId: number, payload: Buffer) {
  const data = Buffer.alloc(2 + payload.length)
  data.writeUInt16LE(companyId, 0)
  payload.copy(data, 2)
  const flags = Buffer.from([0x02, 0x01, 0x06])
  return Buffer.concat([
    flags,
    Buffer.from([data.length + 1, 0xff]),
    data
  ]).toString('hex')
}

interface GatewaySpec {
  id: string
  hostname: string
  // RSSI each gateway hears a device at, by MAC; devices it cannot hear are left out
  hears: Record<string, number>
}

const GATEWAYS: GatewaySpec[] = [
  {
    id: 'D8:85:AC:5D:31:A0',
    hostname: 'espos-engine-room',
    hears: {
      'E2:6B:14:9D:50:11': -58,
      'E2:6B:14:9D:50:12': -61,
      'F4:3A:91:2C:7E:01': -84
    }
  },
  {
    id: 'D8:85:AC:5D:47:C2',
    hostname: 'espos-cockpit',
    hears: {
      'F4:3A:91:2C:7E:01': -55,
      'F4:3A:91:2C:7E:02': -63,
      'F4:3A:91:2C:7E:03': -66,
      'E2:6B:14:9D:50:12': -88
    }
  }
]

// Phones, watches and laptops aboard and on the neighbouring boats
const NEIGHBOURS = [
  { mac: '5A:21:C4:8E:13:7D', company: APPLE_COMPANY_ID, rssi: -70 },
  { mac: '6F:68:F4:40:5F:B3', company: APPLE_COMPANY_ID, rssi: -78 },
  { mac: '47:D0:1A:3C:66:73', company: APPLE_COMPANY_ID, rssi: -82 },
  { mac: '79:66:87:45:55:BE', company: APPLE_COMPANY_ID, rssi: -86 },
  { mac: '38:9A:E5:CD:8D:A3', company: MICROSOFT_COMPANY_ID, rssi: -81 }
]

const GATEWAY_FIRMWARE = 'espos-ble-gateway'
const GATEWAY_HEAP_BYTES = 33_700_000
const RSSI_JITTER_DB = 3
const NEIGHBOUR_SEEN_SHARE = 0.4
const SERVER_URL = `http://127.0.0.1:${Number(process.env.PORT ?? 3000)}`
const LOGIN_RETRY_MS = 60_000

// The server takes advertisement posts only from a user who may write, as a
// real gateway's device token allows. Until a post goes through, the readings
// are published directly so the demo still shows them.
class GatewaySimulator {
  refused = false
  private nonces = new Map<string, number>()
  private startedAt = Date.now()
  private token: string | undefined
  private loggingIn: Promise<void> | undefined
  private lastLogin = 0
  private readonly app: ServerAPI
  private readonly login: GatewayLogin

  constructor(app: ServerAPI, login: GatewayLogin) {
    this.app = app
    this.login = login
  }

  send(readings: VictronReading[], epochS: number) {
    const adverts = new Map<string, string>()
    for (const { device, recordType, record } of readings) {
      const nonce =
        ((this.nonces.get(device.mac) ?? Math.floor(Math.random() * 0xffff)) +
          1) &
        0xffff
      this.nonces.set(device.mac, nonce)
      adverts.set(
        device.mac,
        adStructures(
          VICTRON_COMPANY_ID,
          victronManufacturerData(device, recordType, nonce, record)
        )
      )
    }
    for (const gateway of GATEWAYS) {
      const devices = [
        ...Object.entries(gateway.hears).flatMap(([mac, rssi]) => {
          const adv_data = adverts.get(mac)
          return adv_data ? [{ mac, rssi: jitter(rssi), adv_data }] : []
        }),
        ...NEIGHBOURS.filter(() => Math.random() < NEIGHBOUR_SEEN_SHARE).map(
          (n) => ({
            mac: n.mac,
            rssi: jitter(n.rssi),
            adv_data: adStructures(
              n.company,
              Buffer.from([0x10, 0x05, epochS & 0xff, 0x1c, 0x0e, 0x7a])
            )
          })
        )
      ]
      void this.post({
        gateway_id: gateway.id,
        mac: gateway.id,
        hostname: gateway.hostname,
        firmware: GATEWAY_FIRMWARE,
        uptime: Math.round((Date.now() - this.startedAt) / 1000),
        free_heap: GATEWAY_HEAP_BYTES + Math.round(Math.random() * 200_000),
        devices
      })
    }
  }

  private async post(body: object) {
    try {
      if (!this.token)
        await (this.loggingIn ??= this.logIn().finally(
          () => (this.loggingIn = undefined)
        ))
      const token = this.token
      const res = await fetch(
        `${SERVER_URL}/signalk/v2/api/ble/gateway/advertisements`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(body)
        }
      )
      if ((res.status === 401 || res.status === 403) && token === this.token)
        this.token = undefined
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.refused = false
    } catch (error) {
      if (!this.refused)
        this.app.error(
          `BLE gateways refused, publishing directly: ${String(error)}`
        )
      this.refused = true
    }
  }

  private async logIn() {
    const { username, password } = this.login
    if (!username || !password || Date.now() - this.lastLogin < LOGIN_RETRY_MS)
      return
    this.lastLogin = Date.now()
    const res = await fetch(`${SERVER_URL}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) this.token = ((await res.json()) as { token?: string }).token
  }
}

function jitter(rssi: number) {
  return rssi + Math.round((Math.random() * 2 - 1) * RSSI_JITTER_DB)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, decimals: number) {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

// The freezer and outside air sensors reach the server the way they do on a
// real boat: Zigbee sensors pair with an espOS Zigbee coordinator, which
// Zigbee2MQTT drives, and signalk-zigbee follows Zigbee2MQTT over MQTT. The
// demo machine runs no containers, so this plays both the broker and
// Zigbee2MQTT with its espOS coordinator, and signalk-zigbee connects to it as
// an existing broker.
export const ZIGBEE_BROKER_PORT = 1883
export const ZIGBEE_NETWORK = 'boat'
export const ZIGBEE_BASE_TOPIC = `zigbee2mqtt-${ZIGBEE_NETWORK}`
const ZIGBEE_REPORT_MS = 60_000
const Z2M_VERSION = '2.6.2'
const ESPOS_COORDINATOR = {
  address: '192.168.8.41',
  port: 6638,
  ieee: '0x7c2c67fffe4b9a10'
}

export interface ZigbeeReading {
  freezerC: number
  freezerHumidity: number
  outsideC: number
  outsideHumidity: number
  pressureHpa: number
}

interface Z2mExpose {
  type: 'numeric'
  name: string
  property: string
  label: string
  access: number
  unit: string
  value_min?: number
  value_max?: number
}

const ACCESS_STATE_GET = 0b101

function numericExpose(
  property: string,
  label: string,
  unit: string,
  min?: number,
  max?: number
): Z2mExpose {
  return {
    type: 'numeric',
    name: property,
    property,
    label,
    access:
      property === 'linkquality' || property === 'battery'
        ? 1
        : ACCESS_STATE_GET,
    unit,
    ...(min === undefined ? {} : { value_min: min, value_max: max })
  }
}

interface ZigbeeSensor {
  ieee: string
  friendlyName: string
  networkAddress: number
  modelId: string
  vendor: string
  description: string
  exposes: Z2mExpose[]
  battery: number
  linkQuality: number
  state: (r: ZigbeeReading) => Record<string, number>
}

export const ZIGBEE_SENSORS: ZigbeeSensor[] = [
  {
    ieee: '0x00124b002a5e1f01',
    friendlyName: 'Freezer',
    networkAddress: 0x3a71,
    modelId: 'SNZB-02D',
    vendor: 'SONOFF',
    description: 'Temperature and humidity sensor with LCD',
    exposes: [
      numericExpose('battery', 'Battery', '%', 0, 100),
      numericExpose('temperature', 'Temperature', '°C'),
      numericExpose('humidity', 'Humidity', '%'),
      numericExpose('linkquality', 'Linkquality', 'lqi', 0, 255)
    ],
    battery: 87,
    linkQuality: 96,
    state: (r) => ({
      temperature: round(r.freezerC, 1),
      humidity: round(r.freezerHumidity, 1)
    })
  },
  {
    ieee: '0x00158d0009c4e2b7',
    friendlyName: 'Outside air',
    networkAddress: 0x91c4,
    modelId: 'WSDCGQ11LM',
    vendor: 'Aqara',
    description: 'Temperature, humidity and pressure sensor',
    exposes: [
      numericExpose('battery', 'Battery', '%', 0, 100),
      numericExpose('temperature', 'Temperature', '°C'),
      numericExpose('humidity', 'Humidity', '%'),
      numericExpose('pressure', 'Pressure', 'hPa'),
      numericExpose('linkquality', 'Linkquality', 'lqi', 0, 255)
    ],
    battery: 64,
    linkQuality: 142,
    state: (r) => ({
      temperature: round(r.outsideC, 1),
      humidity: round(r.outsideHumidity, 1),
      pressure: round(r.pressureHpa, 1)
    })
  }
]

export function zigbeeDevices(names: Map<string, string>) {
  return [
    {
      ieee_address: ESPOS_COORDINATOR.ieee,
      type: 'Coordinator',
      network_address: 0,
      supported: true,
      disabled: false,
      friendly_name: 'Coordinator',
      interview_completed: true,
      interview_state: 'SUCCESSFUL',
      definition: null,
      endpoints: {}
    },
    ...ZIGBEE_SENSORS.map((sensor) => ({
      ieee_address: sensor.ieee,
      type: 'EndDevice',
      network_address: sensor.networkAddress,
      supported: true,
      disabled: false,
      friendly_name: names.get(sensor.ieee) ?? sensor.friendlyName,
      model_id: sensor.modelId,
      manufacturer: sensor.vendor,
      power_source: 'Battery',
      interview_completed: true,
      interview_state: 'SUCCESSFUL',
      definition: {
        model: sensor.modelId,
        vendor: sensor.vendor,
        description: sensor.description,
        supports_ota: false,
        exposes: sensor.exposes,
        options: []
      },
      endpoints: {}
    }))
  ]
}

interface RequestBody {
  transaction?: string
  time?: number
  from?: string
  to?: string
}

class ZigbeeSimulator {
  private broker: Aedes | undefined
  private server: Server | undefined
  private names = new Map<string, string>()
  private permitJoinEnd: number | undefined
  private permitJoinTimer: ReturnType<typeof setTimeout> | undefined
  private lastReport = 0
  private stopped = false
  private readonly followers = new Set<string>()
  private readonly app: ServerAPI

  constructor(app: ServerAPI) {
    this.app = app
  }

  // True while signalk-zigbee follows this network; until then the demo
  // publishes the readings itself
  get followed() {
    return this.followers.size > 0
  }

  async start() {
    this.stopped = false
    const broker = await Aedes.createBroker()
    if (this.stopped) {
      broker.close()
      return
    }
    broker.on('subscribe', (subscriptions, client) => {
      if (subscriptions.some((s) => s.topic.startsWith(ZIGBEE_BASE_TOPIC)))
        this.followers.add(client.id)
    })
    broker.on('clientDisconnect', (client) => this.followers.delete(client.id))
    broker.subscribe(
      `${ZIGBEE_BASE_TOPIC}/bridge/request/#`,
      (packet, done) => {
        this.onRequest(
          packet.topic.slice(`${ZIGBEE_BASE_TOPIC}/bridge/request/`.length),
          packet.payload
        )
        done()
      },
      () => {}
    )
    this.broker = broker
    const server = createServer(broker.handle)
    server.on('error', (error) =>
      this.app.error(`Zigbee broker: ${error.message}`)
    )
    server.listen(ZIGBEE_BROKER_PORT, '127.0.0.1')
    this.server = server
    this.send('bridge/state', { state: 'online' })
    this.sendInfo()
    this.sendDevices()
  }

  stop() {
    this.stopped = true
    if (this.permitJoinTimer) clearTimeout(this.permitJoinTimer)
    this.server?.close()
    this.broker?.close()
    this.server = undefined
    this.broker = undefined
    this.followers.clear()
  }

  report(reading: ZigbeeReading) {
    const now = Date.now()
    if (!this.broker || now - this.lastReport < ZIGBEE_REPORT_MS) return
    this.lastReport = now
    for (const sensor of ZIGBEE_SENSORS) {
      this.send(this.nameOf(sensor), {
        ...sensor.state(reading),
        battery: sensor.battery,
        linkquality: clamp(
          sensor.linkQuality + Math.round((Math.random() * 2 - 1) * 12),
          0,
          255
        ),
        last_seen: new Date(now).toISOString()
      })
    }
  }

  private nameOf(sensor: ZigbeeSensor) {
    return this.names.get(sensor.ieee) ?? sensor.friendlyName
  }

  private send(topic: string, body: object | string) {
    this.broker?.publish(
      {
        cmd: 'publish',
        topic: `${ZIGBEE_BASE_TOPIC}/${topic}`,
        payload: Buffer.from(
          typeof body === 'string' ? body : JSON.stringify(body)
        ),
        qos: 0,
        retain: true,
        dup: false
      },
      () => {}
    )
  }

  private sendInfo() {
    const open = this.permitJoinEnd !== undefined
    this.send('bridge/info', {
      version: Z2M_VERSION,
      coordinator: {
        type: 'ZBOSS',
        ieee_address: ESPOS_COORDINATOR.ieee,
        meta: { revision: 'espOS' }
      },
      network: {
        channel: 15,
        pan_id: 0x1a62,
        extended_pan_id: '0xdddddddddddddddd'
      },
      log_level: 'info',
      permit_join: open,
      ...(open ? { permit_join_end: this.permitJoinEnd } : {}),
      restart_required: false,
      config: {
        serial: {
          port: `tcp://${ESPOS_COORDINATOR.address}:${ESPOS_COORDINATOR.port}`,
          adapter: 'zboss'
        },
        device_options: { retain: true },
        advanced: { last_seen: 'ISO_8601', channel: 15 }
      }
    })
  }

  private sendDevices() {
    this.send('bridge/devices', zigbeeDevices(this.names))
  }

  private respond(
    name: string,
    body: RequestBody,
    data: object | undefined,
    error?: string
  ) {
    const response = error
      ? { status: 'error', error, transaction: body.transaction }
      : { status: 'ok', data, transaction: body.transaction }
    this.broker?.publish(
      {
        cmd: 'publish',
        topic: `${ZIGBEE_BASE_TOPIC}/bridge/response/${name}`,
        payload: Buffer.from(JSON.stringify(response)),
        qos: 0,
        retain: false,
        dup: false
      },
      () => {}
    )
  }

  private onRequest(name: string, payload: Buffer | string) {
    let body: RequestBody
    try {
      body = JSON.parse(payload.toString()) as RequestBody
    } catch {
      return
    }
    if (name === 'permit_join') {
      const seconds = clamp(Number(body.time ?? 0), 0, 254)
      if (this.permitJoinTimer) clearTimeout(this.permitJoinTimer)
      this.permitJoinEnd = seconds > 0 ? Date.now() + seconds * 1000 : undefined
      if (seconds > 0) {
        this.permitJoinTimer = setTimeout(() => {
          this.permitJoinEnd = undefined
          this.sendInfo()
        }, seconds * 1000)
      }
      this.respond(name, body, { time: seconds })
      this.sendInfo()
    } else if (name === 'device/rename') {
      const sensor = ZIGBEE_SENSORS.find(
        (s) =>
          s.ieee === body.from?.toLowerCase() || this.nameOf(s) === body.from
      )
      const to = body.to?.trim()
      if (!sensor || !to) {
        this.respond(
          name,
          body,
          undefined,
          `Device '${String(body.from)}' does not exist`
        )
        return
      }
      const from = this.nameOf(sensor)
      this.send(from, '')
      this.names.set(sensor.ieee, to)
      this.respond(name, body, { from, to, homeassistant_rename: false })
      this.sendDevices()
      this.lastReport = 0
    } else if (name === 'options') {
      this.respond(name, body, { restart_required: false })
    } else {
      this.respond(
        name,
        body,
        undefined,
        `${name} is not available on the demo boat`
      )
    }
  }
}

// What signalk-zigbee publishes from the two sensors, for while it does not
// follow the simulated network
function zigbeeDirect(r: ZigbeeReading) {
  return [
    {
      path: 'environment.inside.freezer.temperature',
      value: round(r.freezerC + KELVIN_OFFSET, 2)
    },
    {
      path: 'environment.inside.freezer.relativeHumidity',
      value: round(r.freezerHumidity / 100, 3)
    },
    {
      path: 'environment.outside.temperature',
      value: round(r.outsideC + KELVIN_OFFSET, 2)
    },
    {
      path: 'environment.outside.relativeHumidity',
      value: round(r.outsideHumidity / 100, 3)
    },
    {
      path: 'environment.outside.pressure',
      value: Math.round(r.pressureHpa * 100)
    }
  ]
}

// The simulator's position is the boat's centre on the centreline, the
// reference point the server corrects GNSS antennas to. Two more receivers
// on the stern pushpit report where their antennas really are, so the
// GNSS preferences show a boat with several antennas, port and starboard,
// all corrected back to the same position.
export const SIMULATOR_SOURCE = 'signalk-sailboat-simulator'

export interface Antenna {
  $source: string
  sensorId: string
  fromBow: number
  fromCenter: number
}

// Starboard is positive, as in the server's GNSS settings
export const PUSHPIT_ANTENNAS: Antenna[] = [
  { $source: 'gnss.port', sensorId: 'Port GPS', fromBow: 10.3, fromCenter: -1 },
  {
    $source: 'gnss.starboard',
    sensorId: 'Stbd GPS',
    fromBow: 10.3,
    fromCenter: 1
  }
]

const EARTH_RADIUS_M = 6371000
const DEG = Math.PI / 180

interface Position {
  latitude: number
  longitude: number
}

export function antennaPosition(
  centre: Position,
  headingTrue: number,
  lengthOverall: number,
  antenna: Pick<Antenna, 'fromBow' | 'fromCenter'>
): Position {
  const forward = lengthOverall / 2 - antenna.fromBow
  const starboard = antenna.fromCenter
  const north =
    forward * Math.cos(headingTrue) - starboard * Math.sin(headingTrue)
  const east =
    forward * Math.sin(headingTrue) + starboard * Math.cos(headingTrue)
  return {
    latitude: centre.latitude + north / EARTH_RADIUS_M / DEG,
    longitude:
      centre.longitude +
      east / (EARTH_RADIUS_M * Math.cos(centre.latitude * DEG)) / DEG
  }
}

function isPosition(value: unknown): value is Position {
  const p = value as Position | undefined
  return Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)
}

export class PushpitGnss {
  private readonly app: ServerAPI
  private unsubscribe: (() => void) | undefined

  constructor(app: ServerAPI) {
    this.app = app
  }

  start() {
    this.unsubscribe = this.app.streambundle
      .getSelfBus('navigation.position' as Path)
      .onValue((update) => {
        if (update.$source === SIMULATOR_SOURCE) this.publish(update.value)
      })
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private publish(centre: unknown) {
    const heading = this.app.getSelfPath('navigation.headingTrue.value')
    const length = this.app.getSelfPath('design.length.value.overall')
    if (
      !isPosition(centre) ||
      typeof heading !== 'number' ||
      typeof length !== 'number'
    ) {
      return
    }
    for (const antenna of PUSHPIT_ANTENNAS) {
      this.app.handleMessage(PLUGIN_ID, {
        updates: [
          {
            $source: antenna.$source,
            values: [
              {
                path: 'navigation.position' as Path,
                value: antennaPosition(centre, heading, length, antenna)
              }
            ]
          }
        ]
      } as Parameters<ServerAPI['handleMessage']>[1])
    }
  }
}
