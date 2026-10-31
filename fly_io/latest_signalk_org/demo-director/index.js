// @ts-check
import { magvar } from 'magvar'

const PLUGIN_ID = 'signalk-demo-director'
const TICK_MS = 5000
const VARIATION_EVERY_TICKS = 60
// Turn round a little before the final waypoint so the boat never reaches the
// harbour wall, and the autopilot's own arrival handling never ends the route.
const TURN_ROUND_DISTANCE_M = 250

/** @typedef {{ latitude: number, longitude: number }} Position */

const EARTH_RADIUS_M = 6371000

/** @param {number} deg */
function degToRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * @param {Position} a
 * @param {Position} b
 */
function distanceM(a, b) {
  const dLat = degToRad(b.latitude - a.latitude)
  const dLon = degToRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(a.latitude)) *
      Math.cos(degToRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * @param {import('@signalk/server-api').ServerAPI} app
 * @returns {import('@signalk/server-api').Plugin}
 */
export default function (app) {
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer
  let ticksSinceVariation = VARIATION_EVERY_TICKS
  let turning = false

  /** @param {string} path */
  function selfValue(path) {
    return app.getSelfPath(`${path}.value`)
  }

  function publishVariation() {
    /** @type {Position | undefined} */
    const position = selfValue('navigation.position')
    if (!position) return
    ticksSinceVariation = 0
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: [
            {
              path: 'navigation.magneticVariation',
              value: degToRad(magvar(position.latitude, position.longitude))
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
      /** @type {Position | undefined} */
      const position = selfValue('navigation.position')
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
    void turnRoundAtEnd()
  }

  return {
    id: PLUGIN_ID,
    name: 'Demo director',
    description:
      'Keeps the demo boat under way: publishes magnetic variation and turns the active route round at its end',
    schema: () => ({ type: 'object', properties: {} }),
    start: () => {
      ticksSinceVariation = VARIATION_EVERY_TICKS
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
