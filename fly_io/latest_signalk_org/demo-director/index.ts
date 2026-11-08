import type { Path, Plugin, ServerAPI } from '@signalk/server-api'
import { magvar } from 'magvar'

const PLUGIN_ID = 'signalk-demo-director'
const TICK_MS = 5000
const VARIATION_EVERY_TICKS = 60
// Turn round a little before the final waypoint so the boat never reaches the
// harbour wall, and the autopilot's own arrival handling never ends the route.
const TURN_ROUND_DISTANCE_M = 250
// The house bank charges gently from the solar panel, so the battery widget
// shows a charging bank without ever reaching full
const BATTERY_START_CHARGE = 0.83
const BATTERY_FULLEST_CHARGE = 0.95
const BATTERY_CHARGE_PER_HOUR = 0.005
const BATTERY_CURRENT_A = 4.2
const BATTERY_VOLTAGE_V = 13.3
const MS_PER_HOUR = 3600 * 1000

interface Position {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_M = 6371000

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
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

export default function (app: ServerAPI): Plugin {
  let timer: ReturnType<typeof setInterval> | undefined
  let ticksSinceVariation = VARIATION_EVERY_TICKS
  let turning = false
  let startedAt = Date.now()

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

  function publishBattery() {
    const hours = (Date.now() - startedAt) / MS_PER_HOUR
    const charge = Math.min(
      BATTERY_FULLEST_CHARGE,
      BATTERY_START_CHARGE + hours * BATTERY_CHARGE_PER_HOUR
    )
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: [
            {
              path: 'electrical.batteries.house.capacity.stateOfCharge' as Path,
              value: charge
            },
            {
              path: 'electrical.batteries.house.current' as Path,
              value: BATTERY_CURRENT_A
            },
            {
              path: 'electrical.batteries.house.voltage' as Path,
              value: BATTERY_VOLTAGE_V
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

  function tick() {
    if (ticksSinceVariation >= VARIATION_EVERY_TICKS) publishVariation()
    ticksSinceVariation++
    publishBattery()
    void turnRoundAtEnd()
  }

  return {
    id: PLUGIN_ID,
    name: 'Demo director',
    description:
      'Keeps the demo boat under way: publishes magnetic variation and a charging house battery, and turns the active route round at its end',
    schema: () => ({ type: 'object', properties: {} }),
    start: () => {
      ticksSinceVariation = VARIATION_EVERY_TICKS
      startedAt = Date.now()
      tick()
      timer = setInterval(tick, TICK_MS)
      app.setPluginStatus('Directing the demo boat')
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }
  }
}
