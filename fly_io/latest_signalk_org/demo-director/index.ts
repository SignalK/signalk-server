import type {
  Delta,
  Path,
  Plugin,
  ServerAPI,
  Timestamp
} from '@signalk/server-api'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { magvar } from 'magvar'

const PLUGIN_ID = 'signalk-demo-director'
const TICK_MS = 5000
const VARIATION_EVERY_TICKS = 60
// Turn round a little before the final waypoint so the boat never reaches the
// harbour wall, and the autopilot's own arrival handling never ends the route.
const TURN_ROUND_DISTANCE_M = 250
const MS_PER_HOUR = 3600 * 1000
// The demo runs on Fly, not on a Raspberry Pi, so the system health tile and
// RPI Manager are fed what a Pi 4 on a boat typically reads; values wander
// slowly so they look alive, and the CPU runs warmer in the afternoon. Paths
// and units follow signalk-rpi-stats.
const KELVIN_OFFSET = 273.15
const PI_PREFIX = 'environment.rpi'
const PI_WANDER_PERIOD_MS = 10 * 60 * 1000
const PI_CORES = 4
const PI_CLOCK_HZ = { base: 1.5e9, swing: 0.3e9 }
const PI_MEMORY_BYTES = 4 * 1024 ** 3
const PI_STORAGE_BYTES = 64e9
const PI_STORAGE_SHARE = 0.38
// a boat's computer runs for weeks; longer than the history it fills in
const PI_UPTIME_AT_START_MS = 9 * 24 * MS_PER_HOUR
// RPI Manager charts up to 7 days, and the demo starts with no history: the
// director fills it in, hourly for the week and every 10 minutes for the
// last day. The history recorder keeps at most one value per path and
// second and subscribes once a path appears, so the readings go out
// slowly, after the first live ones.
const PI_HISTORY = [
  { fromMs: 7 * 24 * MS_PER_HOUR, stepMs: MS_PER_HOUR },
  { fromMs: 24 * MS_PER_HOUR, stepMs: 10 * 60 * 1000 }
]
const PI_HISTORY_DELAY_MS = 30 * 1000
const PI_HISTORY_PACE_MS = 1100
// The simulator sails exactly at its polar, so the polar performance tile and
// strip would sit on a flat 100 %. The demo sails a little below the polar
// instead, now and then above it, and derives the polar speeds from that.
const POLAR_RATIOS = {
  speed: { base: 0.93, swing: 0.09 },
  vmg: { base: 0.88, swing: 0.08 }
}
const POLAR_WANDER_PERIOD_MS = 7 * 60 * 1000
// Visitors steer with the public demo login, which the ACL limits to the
// autopilot. Once nobody has touched the autopilot for a while, the boat
// goes back to the route for the next visitor.
const VISITOR_IDLE_MS = 5 * 60 * 1000
export const DEMO_LOGIN = { username: 'demo', password: 'demo' }
const SERVER_URL = 'http://127.0.0.1:3000'
// The simulator's wind is a weather observation, refreshed once a minute, so
// it would stand still between polls. The director lets it gust around that
// observation, by up to 10 % in speed and 10 degrees in direction, drifting
// back over about 20 seconds like a real breeze.
const SIMULATOR_ID = 'sailboat-simulator'
const GUST_SPEED_SHARE = 0.1
const GUST_DIRECTION_RAD = degToRad(10)
const GUST_RETURN_S = 20
const GUST_STEP = 0.16
const AUTOPILOT_PATHS = [
  'steering.autopilot.state',
  'steering.autopilot.mode',
  'steering.autopilot.target'
]

interface Position {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_M = 6371000

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

function wrapPi(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

// one step of a random walk pulled back towards 0, kept within [-1, 1]
export function nextGust(gust: number, dtS: number, random = Math.random) {
  const shove = (random() * 2 - 1) * GUST_STEP * Math.sqrt(3 * dtS)
  const next = gust - (gust * dtS) / GUST_RETURN_S + shove
  return Math.max(-1, Math.min(1, next))
}

export interface Gust {
  speed: number
  direction: number
}

// Applies a gust to the simulator's wind values. Apparent wind follows from
// the gusting true wind, the heading and the speed through the water, so the
// five paths stay consistent with each other.
export function gustWind(
  values: { path: string; value: unknown }[],
  gust: Gust,
  headingTrue: unknown,
  speedThroughWater: unknown
) {
  const byPath = new Map(values.map((v) => [v.path, v.value]))
  const speed = byPath.get('environment.wind.speedTrue')
  const direction = byPath.get('environment.wind.directionTrue')
  if (typeof speed !== 'number' || typeof direction !== 'number') return values
  const speedTrue = speed * (1 + GUST_SPEED_SHARE * gust.speed)
  const directionTrue =
    (direction + GUST_DIRECTION_RAD * gust.direction + 2 * Math.PI) %
    (2 * Math.PI)
  const gusted: Record<string, number> = {
    'environment.wind.speedTrue': speedTrue,
    'environment.wind.directionTrue': directionTrue
  }
  if (typeof headingTrue === 'number') {
    const angleTrue = wrapPi(directionTrue - headingTrue)
    const stw = typeof speedThroughWater === 'number' ? speedThroughWater : 0
    const forward = speedTrue * Math.cos(angleTrue) + stw
    const starboard = speedTrue * Math.sin(angleTrue)
    gusted['environment.wind.angleTrueWater'] = angleTrue
    gusted['environment.wind.speedApparent'] = Math.hypot(forward, starboard)
    gusted['environment.wind.angleApparent'] = Math.atan2(starboard, forward)
  }
  return values.map((v) =>
    v.path in gusted ? { ...v, value: gusted[v.path] } : v
  )
}

function distanceM(a: Position, b: Position) {
  const dLat = degToRad(b.latitude - a.latitude)
  const dLon = degToRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(a.latitude)) *
      Math.cos(degToRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

function piReadings(time: number, bootedAt: number) {
  const wave = (phase: number, period = PI_WANDER_PERIOD_MS) =>
    Math.sin((2 * Math.PI * time) / period + phase)
  const afternoon = wave(-Math.PI / 2, 24 * MS_PER_HOUR)
  const cpu = 0.25 + 0.1 * wave(1)
  const memory = 0.45 + 0.03 * wave(2)
  const readings: Record<string, number> = {
    'cpu.temperature': 54 + KELVIN_OFFSET + 4 * wave(0) + 3 * afternoon,
    'cpu.utilisation': cpu,
    'cpu.frequency': PI_CLOCK_HZ.base + PI_CLOCK_HZ.swing * wave(3),
    'cpu.load.1m': PI_CORES * cpu,
    'cpu.load.5m': PI_CORES * (0.25 + 0.06 * wave(0.6)),
    'cpu.load.15m': PI_CORES * (0.25 + 0.03 * wave(0.3)),
    'memory.utilisation': memory,
    'memory.total': PI_MEMORY_BYTES,
    'memory.used': memory * PI_MEMORY_BYTES,
    'storage.utilisation': PI_STORAGE_SHARE,
    'storage.capacity': PI_STORAGE_BYTES,
    'storage.used': PI_STORAGE_SHARE * PI_STORAGE_BYTES,
    uptime: (time - bootedAt) / 1000
  }
  for (let core = 0; core < PI_CORES; core++) {
    readings[`cpu.core.${core}.utilisation`] = Math.min(
      1,
      Math.max(0, cpu + 0.08 * wave(4 + core * 1.7, PI_WANDER_PERIOD_MS / 3))
    )
  }
  return Object.entries(readings).map(([path, value]) => ({
    path: `${PI_PREFIX}.${path}` as Path,
    value
  }))
}

export default function (app: ServerAPI): Plugin {
  let timer: ReturnType<typeof setInterval> | undefined
  let ticksSinceVariation = VARIATION_EVERY_TICKS
  let turning = false
  let startedAt = Date.now()
  let autopilotSetting = ''
  let autopilotChangedAt = Date.now()
  let resuming = false
  let nightSince: number | undefined
  let historyTimer: ReturnType<typeof setInterval> | undefined
  let historyStart: ReturnType<typeof setTimeout> | undefined
  const gust: Gust = { speed: 0, direction: 0 }
  let gustedAt = Date.now()

  function letTheWindGust(delta: Delta, next: (delta: Delta) => void) {
    for (const update of delta.updates) {
      if (update.$source !== SIMULATOR_ID || !('values' in update)) continue
      if (!update.values.some((v) => v.path === 'environment.wind.speedTrue'))
        continue
      const now = Date.now()
      const dtS = Math.min((now - gustedAt) / 1000, GUST_RETURN_S)
      gustedAt = now
      gust.speed = nextGust(gust.speed, dtS)
      gust.direction = nextGust(gust.direction, dtS)
      const own = (path: string) =>
        update.values.find((v) => v.path === path)?.value ??
        app.getSelfPath(`${path}.value`)
      update.values = gustWind(
        update.values,
        gust,
        own('navigation.headingTrue'),
        own('navigation.speedThroughWater')
      ) as typeof update.values
    }
    next(delta)
  }

  function selfPosition() {
    return app.getSelfPath('navigation.position.value') as Position | undefined
  }

  function publishVariation() {
    const position = selfPosition()
    if (!position) return
    ticksSinceVariation = 0
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: [
            {
              path: 'navigation.magneticVariation' as Path,
              value: degToRad(magvar(position.latitude, position.longitude))
            }
          ]
        }
      ]
    })
  }

  function publishPiHealth(time = Date.now()) {
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          timestamp: new Date(time).toISOString() as Timestamp,
          values: piReadings(time, startedAt - PI_UPTIME_AT_START_MS)
        }
      ]
    })
  }

  function piHistoryTimes(now: number) {
    const times: number[] = []
    PI_HISTORY.forEach(({ fromMs, stepMs }, i) => {
      const untilMs = PI_HISTORY[i + 1]?.fromMs ?? 0
      for (let ago = fromMs; ago > untilMs; ago -= stepMs) times.push(now - ago)
    })
    return times
  }

  function startPiHistory() {
    const times = piHistoryTimes(Date.now())
    historyTimer = setInterval(() => {
      const time = times.shift()
      if (time !== undefined) publishPiHealth(time)
      if (times.length === 0) stopPiHistory()
    }, PI_HISTORY_PACE_MS)
  }

  function stopPiHistory() {
    if (historyTimer) clearInterval(historyTimer)
    historyTimer = undefined
  }

  function wander(
    { base, swing }: { base: number; swing: number },
    phase: number
  ) {
    const elapsed = Date.now() - startedAt
    return (
      base +
      swing * Math.sin((2 * Math.PI * elapsed) / POLAR_WANDER_PERIOD_MS + phase)
    )
  }

  function publishPolarPerformance() {
    const stw = app.getSelfPath('navigation.speedThroughWater.value')
    const twa = app.getSelfPath('environment.wind.angleTrueWater.value')
    if (typeof stw !== 'number' || typeof twa !== 'number' || stw <= 0) return
    const speedRatio = wander(POLAR_RATIOS.speed, 0)
    const vmgRatio = wander(POLAR_RATIOS.vmg, 2)
    const vmg = stw * Math.abs(Math.cos(twa))
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: [
            { path: 'performance.polarSpeed' as Path, value: stw / speedRatio },
            { path: 'performance.polarSpeedRatio' as Path, value: speedRatio },
            {
              path: 'performance.polarVelocityMadeGood' as Path,
              value: vmg / vmgRatio
            },
            {
              path: 'performance.polarVelocityMadeGoodRatio' as Path,
              value: vmgRatio
            }
          ]
        }
      ]
    })
  }

  async function turnRoundAtEnd() {
    if (turning) return
    turning = true
    try {
      // the active route lives in the Course API, not in the data model
      const course = await app.getCourse()
      const route = course.activeRoute
      const waypoint = course.nextPoint?.position
      const position = selfPosition()
      if (!route || !waypoint || !position) return
      if (route.pointIndex < route.pointTotal - 1) return
      // calcValues.distance can still be to the previous point just after
      // the route advances, so measure to the final point itself
      if (distanceM(position, waypoint) > TURN_ROUND_DISTANCE_M) return
      await app.activateRoute({
        href: route.href,
        reverse: !route.reverse,
        pointIndex: 1
      })
    } catch (error) {
      app.error(`Could not turn the demo route round: ${String(error)}`)
    } finally {
      turning = false
    }
  }

  function followsRoute() {
    return (
      app.getSelfPath('steering.autopilot.mode.value') === 'route' &&
      app.getSelfPath('steering.autopilot.engaged.value') === true
    )
  }

  // The plugin API has no autopilot commands, so the director steers through
  // the REST API with the same login the visitors use.
  async function resumeRoute() {
    const login = await fetch(`${SERVER_URL}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEMO_LOGIN)
    })
    if (!login.ok) throw new Error(`login answered ${login.status}`)
    const { token } = (await login.json()) as { token: string }
    const resumed = await fetch(
      `${SERVER_URL}/signalk/v2/api/vessels/self/autopilots/_default/courseCurrentPoint`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!resumed.ok) throw new Error(`autopilot answered ${resumed.status}`)
    // visitors share the login, so the next one starts from the demo layout
    rmSync(
      resolve(
        app.getDataDirPath(),
        '../../applicationData/users',
        DEMO_LOGIN.username
      ),
      { recursive: true, force: true }
    )
  }

  async function returnToRouteWhenIdle() {
    const setting = JSON.stringify(
      AUTOPILOT_PATHS.map((path) => app.getSelfPath(`${path}.value`))
    )
    if (setting !== autopilotSetting) {
      autopilotSetting = setting
      autopilotChangedAt = Date.now()
    }
    if (resuming || followsRoute()) return
    if (Date.now() - autopilotChangedAt < VISITOR_IDLE_MS) return
    resuming = true
    try {
      await resumeRoute()
    } catch (error) {
      app.error(
        `Could not take the demo boat back to its route: ${String(error)}`
      )
    } finally {
      autopilotChangedAt = Date.now()
      resuming = false
    }
  }

  // Night mode is one setting for every visitor, so one visitor's night
  // would stay dark for everyone who comes after.
  function returnToDayWhenIdle() {
    if (app.getSelfPath('environment.mode.value') !== 'night') {
      nightSince = undefined
      return
    }
    nightSince ??= Date.now()
    if (Date.now() - nightSince < VISITOR_IDLE_MS) return
    nightSince = undefined
    // Through App Dock's own handler, so the mode keeps one source and a
    // client never gets a stale night next to the day.
    void app.putSelfPath('environment.mode', 'day', () => {})
  }

  function tick() {
    if (ticksSinceVariation >= VARIATION_EVERY_TICKS) publishVariation()
    ticksSinceVariation++
    // live readings would take the recorder's one value per second
    if (!historyTimer) publishPiHealth()
    publishPolarPerformance()
    void turnRoundAtEnd()
    void returnToRouteWhenIdle()
    returnToDayWhenIdle()
  }

  return {
    id: PLUGIN_ID,
    name: 'Demo director',
    description:
      'Keeps the demo boat under way: publishes magnetic variation, the computer health and the polar performance, lets the simulated wind gust, turns the active route round at its end, takes the boat back to the route when visitors stop steering, and switches back to day mode',
    schema: () => ({ type: 'object', properties: {} }),
    start: () => {
      ticksSinceVariation = VARIATION_EVERY_TICKS
      startedAt = Date.now()
      autopilotChangedAt = Date.now()
      gustedAt = Date.now()
      app.registerDeltaInputHandler(letTheWindGust)
      tick()
      historyStart = setTimeout(startPiHistory, PI_HISTORY_DELAY_MS)
      timer = setInterval(tick, TICK_MS)
      app.setPluginStatus('Directing the demo boat')
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = undefined
      clearTimeout(historyStart)
      stopPiHistory()
    }
  }
}
