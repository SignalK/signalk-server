import {
  Plugin,
  ServerAPI,
  SKVersion,
  SubscribeMessage,
  Context,
  SubscriptionOptions,
  Delta,
  hasValues,
  Route,
  GeoJsonLinestring,
  ALARM_STATE,
  ALARM_METHOD,
  PathValue
} from '@signalk/server-api'
import { Application, Request, Response } from 'express'
import { NotificationMgr, Watcher, WatchEvent } from './lib/alarms'
import { buildDeltaMsg, CalcMethod } from './lib/delta-msg'
import { CourseData, SKPaths } from './types'
// Course-calculation helpers.
import { calcs, emptyCourseData, parseSKPaths, resetCaches } from './lib/course'

import { Subscription } from 'rxjs'

type CourseComputerApp = Application & ServerAPI

interface CourseAppConfig {
  notifications: {
    enableArrival: boolean
    enablePerpendicular: boolean
    sound: boolean
  }
  calculations: {
    method: CalcMethodType
  }
}

type CalcMethodType = 'GreatCircle' | 'Rhumbline'

/** Settings used where the saved config has none, as on a new server. */
const DEFAULT_CONFIG: CourseAppConfig = {
  notifications: {
    enableArrival: true,
    enablePerpendicular: true,
    sound: false
  },
  calculations: {
    method: 'GreatCircle'
  }
}

const CONFIG_SCHEMA = {
  properties: {
    notifications: {
      type: 'object',
      title: 'Notifications',
      description: 'Configure the options for generated notifications.',
      properties: {
        enableArrival: {
          type: 'boolean',
          title: 'Enable Arrival Circle Entered',
          default: DEFAULT_CONFIG.notifications.enableArrival
        },
        enablePerpendicular: {
          type: 'boolean',
          title: 'Enable Perpendicular Passed',
          default: DEFAULT_CONFIG.notifications.enablePerpendicular
        },
        sound: {
          type: 'boolean',
          title: 'Enable sound',
          default: DEFAULT_CONFIG.notifications.sound
        }
      }
    },
    calculations: {
      type: 'object',
      title: 'Calculations',
      description: 'Configure course calculations options.',
      properties: {
        method: {
          type: 'string',
          default: DEFAULT_CONFIG.calculations.method,
          enum: ['GreatCircle', 'Rhumbline']
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {
  notifications: {
    enableArrival: {
      'ui:widget': 'checkbox',
      'ui:title': 'Enable Arrival Circle Entered',
      'ui:help': ''
    },
    enablePerpendicular: {
      'ui:widget': 'checkbox',
      'ui:title': 'Enable Perpendicular Passed',
      'ui:help': ''
    },
    sound: {
      'ui:widget': 'checkbox',
      'ui:title': 'Enable sound',
      'ui:help': ''
    }
  },
  calculations: {
    method: {
      'ui:widget': 'radio',
      'ui:title': 'Course calculation method',
      'ui:help': ' '
    }
  }
}

const SRC_PATHS = [
  'navigation.position',
  'navigation.magneticVariation',
  'navigation.headingTrue',
  'navigation.courseOverGroundTrue',
  'navigation.speedOverGround',
  'environment.wind.angleTrueGround',
  'navigation.datetime',
  'navigation.course.arrivalCircle',
  'navigation.course.startTime',
  'navigation.course.targetArrivalTime',
  'navigation.course.nextPoint',
  'navigation.course.previousPoint',
  'navigation.course.activeRoute',
  'resources.routes.*'
]

const PATH_POSITION = 'navigation.position'
const PATH_ACTIVE_ROUTE = 'navigation.course.activeRoute'
const PATH_RESOURCES_ROUTE_PREFIX = 'resources.route'

module.exports = (server: CourseComputerApp): Plugin => {
  const watchArrival: Watcher = new Watcher() // watch distance from arrivalCircle
  const watchPassedDest: Watcher = new Watcher() // watch passedPerpendicular
  watchPassedDest.rangeMin = 1
  watchPassedDest.rangeMax = 2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unsubscribes: any[] = [] // delta stream subscriptions
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obs: any[] = [] // Observables subscription

  const SIGNALK_API_PATH = `/signalk/v2/api`
  const COURSE_CALCS_PATH = `${SIGNALK_API_PATH}/vessels/self/navigation/course/calcValues`

  const srcPaths: SKPaths = {}
  let courseCalcs: CourseData
  let activeRouteId: string | undefined

  // Monotonic token bumped before every getWaypoints() fetch and on
  // activeRoute clear. The handler that initiated a fetch only commits its
  // result if its token is still the latest one, so concurrent or
  // out-of-order fetches cannot let an older resource overwrite a newer one.
  let routeFetchToken = 0

  // Tracks whether the previous tick had a complete navigation context
  // (position + nextPoint + previousPoint). When the context becomes
  // incomplete (e.g., user clears the active route) we emit an empty
  // result delta exactly once so subscribers see the cleared state.
  let activeDest = false

  let metaSent = false

  // ******** REQUIRED PLUGIN DEFINITION *******
  const plugin: Plugin = {
    id: 'course-provider',
    name: 'Course Data provider',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: CourseAppConfig) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }
  // ************************************

  /**
   * The saved config is empty until the plugin's settings are first saved,
   * and may lack settings added since; those take their defaults.
   */
  const cleanConfig = (options: Partial<CourseAppConfig>): CourseAppConfig => ({
    notifications: {
      ...DEFAULT_CONFIG.notifications,
      ...options.notifications
    },
    calculations: {
      ...DEFAULT_CONFIG.calculations,
      ...options.calculations
    }
  })

  let config: CourseAppConfig

  const doStartup = (options: CourseAppConfig) => {
    try {
      server.debug(`${plugin.name} starting.......`)
      config = cleanConfig(options)
      if (server.debug.enabled) {
        server.debug(`Applied config: ${JSON.stringify(config)}`)
      }

      // activeDest, metaSent, and the course module's route-remaining
      // cache live beyond a single plugin instance (closure and module
      // scope) and survive a stop/start cycle within the same server
      // process. Reset them on each start so a restart cannot inherit the
      // previous run's latched state or a stale cached calculation.
      activeDest = false
      metaSent = false
      resetCaches()

      // setup subscriptions
      initSubscriptions(SRC_PATHS)
      // setup routes
      initEndpoints()

      const msg = 'Started'
      server.setPluginStatus(msg)
      return undefined
    } catch (error) {
      const msg = 'Started with errors!'
      server.setPluginError(msg)
      server.error('** EXCEPTION: **')
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.error((error as any).stack)
      return error
    }
  }

  const doShutdown = () => {
    server.debug('** shutting down **')
    server.debug('** Un-subscribing from events **')
    unsubscribes.forEach((s) => s())
    unsubscribes = []
    obs.forEach((o: Subscription) => o.unsubscribe())
    obs = []
    const msg = 'Stopped'
    server.setPluginStatus(msg)
  }

  // *****************************************

  // register DELTA stream message handler
  const initSubscriptions = (skPaths: string[]) => {
    server.debug('Initialising Stream Subscriptions....')
    getPaths(skPaths)

    const subscription: SubscribeMessage = {
      context: 'vessels.self' as Context,
      subscribe: skPaths.map((p) => ({
        path: p,
        period: 500
      })) as SubscriptionOptions[]
    }

    server.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      (error) => {
        server.error(`${plugin.id} Error: ${error}`)
      },
      (delta: Delta) => {
        const updates = delta.updates
        if (!updates) {
          return
        }
        for (let i = 0, uLen = updates.length; i < uLen; i++) {
          const u = updates[i]
          if (!u || !hasValues(u)) {
            continue
          }
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const values = (u as any).values

          for (let j = 0, vLen = values.length; j < vLen; j++) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v: any = values[j]
            const p = v.path
            if (p === PATH_POSITION) {
              if (server.debug.enabled) {
                server.debug(
                  `navigation.position ${JSON.stringify(v.value)} => calc()`
                )
              }
              srcPaths[p] = v.value
              calc()
            } else if (p === PATH_ACTIVE_ROUTE) {
              handleActiveRoute(v.value ? { ...v.value } : null)
            } else if (p.startsWith(PATH_RESOURCES_ROUTE_PREFIX)) {
              handleRouteUpdate(v)
            } else {
              srcPaths[p] = v.value
            }
          }
        }
      }
    )

    obs.push(
      watchArrival.change$.subscribe((event: WatchEvent) => {
        onArrivalCircleEvent(event)
      })
    )
    obs.push(
      watchPassedDest.change$.subscribe((event: WatchEvent) => {
        onPassedDestEvent(event)
      })
    )
  }

  // initialise api endpoints
  const initEndpoints = () => {
    server.debug('Initialising API endpoint(s)....')
    server.get(`${COURSE_CALCS_PATH}`, async (_req: Request, res: Response) => {
      server.debug(`** GET ${COURSE_CALCS_PATH}`)
      const calcs =
        config.calculations.method === 'Rhumbline'
          ? courseCalcs?.rl
          : courseCalcs?.gc

      if (!calcs) {
        res.status(400).json({
          state: 'FAILED',
          statusCode: 400,
          message: `No active destination!`
        })
        return
      }

      return res.status(200).json(calcs)
    })
  }

  // ********* Course Calculations *******************

  // retrieve initial values of target paths
  const getPaths = async (paths: string[]) => {
    paths.forEach((path) => {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = server.getSelfPath(path) as any
      srcPaths[path] = v?.value ?? null
    })
    const ci = await server.getCourse()
    if (server.debug.enabled) {
      server.debug(`*** getPaths() ${JSON.stringify(ci)}`)
    }
    if (ci) {
      srcPaths['navigation.course.nextPoint'] = ci.nextPoint
      srcPaths['navigation.course.previousPoint'] = ci.previousPoint
      srcPaths['activeRoute'] = ci.activeRoute
      if (ci.activeRoute) {
        // split('/').slice(-1)[0] is structurally always defined on a
        // non-empty string, but `noUncheckedIndexedAccess` types it as
        // `string | undefined`. Empty fallback is unreachable in practice.
        activeRouteId = ci.activeRoute.href.split('/').slice(-1)[0] ?? ''
        const myToken = ++routeFetchToken
        const waypoints = await getWaypoints(activeRouteId)
        // initSubscriptions does not await getPaths, so a delta fired during
        // startup can complete its fetch first; drop our result if so.
        if (myToken !== routeFetchToken) {
          return
        }
        srcPaths['activeRoute'].waypoints = waypoints
      }
    }
    if (server.debug.enabled) {
      server.debug(`[srcPaths]: ${JSON.stringify(srcPaths)}`)
    }
  }

  // retrieve waypoints for supplied route id
  const getWaypoints = async (id: string): Promise<GeoJsonLinestring> => {
    const rte = (await server.resourcesApi.getResource('routes', id)) as Route
    const waypoints = rte ? rte.feature.geometry.coordinates : []
    if (server.debug.enabled) {
      server.debug(`*** activeRoute waypoints *** ${waypoints}`)
    }
    return waypoints
  }

  // resources.routes delta handler
  const handleRouteUpdate = async (msg: PathValue) => {
    if (server.debug.enabled) {
      server.debug(`*** handleRouteUpdate *** ${JSON.stringify(msg)}`)
    }
    if (msg.path.endsWith(activeRouteId as string)) {
      server.debug(`*** matched activeRouteId *** ${activeRouteId}`)
      const myToken = ++routeFetchToken
      const waypoints = await getWaypoints(activeRouteId as string)
      // A newer fetch (another resources.routes update or a route switch)
      // has been issued in the meantime; drop our stale result.
      if (myToken !== routeFetchToken) {
        return
      }
      srcPaths['activeRoute'].waypoints = waypoints
    }
  }

  // 'navigation.course.activeRoute' delta handler
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleActiveRoute = async (value: any) => {
    if (server.debug.enabled) {
      server.debug(`*** handleActiveRoute *** ${JSON.stringify(value)}`)
    }

    if (!value) {
      // Bump the token so any in-flight fetch from a previous activation is
      // ignored when it eventually resolves.
      routeFetchToken++
      srcPaths['activeRoute'] = null
      activeRouteId = undefined
      return
    }

    // Always derive activeRouteId from the incoming value so a switch from
    // one route to another takes effect.
    const newId = value.href.split('/').slice(-1)[0] ?? ''
    activeRouteId = newId
    const myToken = ++routeFetchToken
    const waypoints = await getWaypoints(newId)
    if (myToken !== routeFetchToken) {
      return
    }
    srcPaths['activeRoute'] = Object.assign({}, value, {
      waypoints: waypoints
    })
    if (server.debug.enabled) {
      server.debug(
        `*** activeRoute *** ${JSON.stringify(srcPaths['activeRoute'])}`
      )
    }
  }

  // trigger course calculations
  const calc = () => {
    if (server.debug.enabled) {
      server.debug(
        `*** navigation.position *** ${JSON.stringify(
          srcPaths['navigation.position']
        )}`
      )
    }
    if (!srcPaths['navigation.position']) {
      server.debug('No vessel position.....Skipping calc()')
      return
    }
    if (server.debug.enabled) {
      server.debug(JSON.stringify(srcPaths))
    }
    // srcPaths carries unvalidated delta values straight from the bus, so a
    // malformed coordinate makes the geodesy constructor throw. Contain it
    // so one bad delta is logged and the stream recovers on the next good
    // tick, instead of the throw escaping into the subscription dispatch.
    try {
      if (parseSKPaths(srcPaths)) {
        calcResult(calcs(srcPaths))
        activeDest = true
      } else if (activeDest) {
        // The previous tick had a complete context but this one does not
        // (e.g., the active route was just cleared). Emit an empty result
        // exactly once so subscribers see the cleared values.
        calcResult(emptyCourseData())
        activeDest = false
      }
    } catch (error) {
      server.error(`** calc() failed: ${(error as Error).message} **`)
    }
  }

  // send calculation results delta
  const calcResult = (result: CourseData) => {
    server.debug(`*** calculation result ***`)
    if (server.debug.enabled) {
      server.debug(JSON.stringify(result))
    }
    watchArrival.rangeMax = srcPaths['navigation.course.arrivalCircle'] ?? -1
    watchArrival.value = result.gc?.distance ?? -1
    watchPassedDest.value = result.passedPerpendicular ? 1 : 0
    courseCalcs = result
    server.handleMessage(
      plugin.id,
      buildDeltaMsg(
        courseCalcs as CourseData,
        config.calculations.method as CalcMethod
      ),
      SKVersion.v2
    )
    server.debug(`*** course data delta sent***`)
    if (!metaSent) {
      server.handleMessage(plugin.id, buildMetaDeltaMsg(), SKVersion.v2)
      server.debug(`*** meta delta sent***`)
      metaSent = true
    }
  }

   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildMetaDeltaMsg = (): any => {
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metas: Array<{ path: string; value: any }> = []
    const calcPath = 'navigation.course.calcValues'
    server.debug(`*** building meta delta ***`)
    metas.push({
      path: `${calcPath}.calcMethod`,
      value: {
        description: 'Calculation type used (GreatCircle or Rhumbline).'
      }
    })
    metas.push({
      path: `${calcPath}.bearingTrackTrue`,
      value: {
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to true north.',
        units: 'rad'
      }
    })
    metas.push({
      path: `${calcPath}.bearingTrackMagnetic`,
      value: {
        description:
          'The bearing of a line between previousPoint and nextPoint, relative to magnetic north.',
        units: 'rad'
      }
    })
    metas.push({
      path: `${calcPath}.crossTrackError`,
      value: {
        description:
          "The distance from the vessel's present position to the closest point on a line (track) between previousPoint and nextPoint. A negative number indicates that the vessel is currently to the left of this line (and thus must steer right to compensate), a positive number means the vessel is to the right of the line (steer left to compensate).",
        units: 'm'
      }
    })

    metas.push({
      path: `${calcPath}.previousPoint.distance`,
      value: {
        description:
          "The distance in meters between the vessel's present position and the previousPoint.",
        units: 'm'
      }
    })

    metas.push({
      path: `${calcPath}.distance`,
      value: {
        description:
          "The distance in meters between the vessel's present position and the nextPoint.",
        units: 'm'
      }
    })
    metas.push({
      path: `${calcPath}.bearingTrue`,
      value: {
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to true north.",
        units: 'rad'
      }
    })
    metas.push({
      path: `${calcPath}.bearingMagnetic`,
      value: {
        description:
          "The bearing of a line between the vessel's current position and nextPoint, relative to magnetic north.",
        units: 'rad'
      }
    })
    metas.push({
      path: `${calcPath}.velocityMadeGood`,
      value: {
        description:
          'The velocity component of the vessel towards the nextPoint.',
        units: 'm/s'
      }
    })
    metas.push({
      path: `${calcPath}.timeToGo`,
      value: {
        description:
          "Time in seconds to reach nextPoint's perpendicular with current speed & direction.",
        units: 's'
      }
    })
    metas.push({
      path: `${calcPath}.estimatedTimeOfArrival`,
      value: {
        description: 'The estimated time of arrival at nextPoint position.'
      }
    })
    metas.push({
      path: `${calcPath}.route.timeToGo`,
      value: {
        description:
          'Time in seconds to reach final destination with current speed & direction.',
        units: 's'
      }
    })
    metas.push({
      path: `${calcPath}.route.estimatedTimeOfArrival`,
      value: {
        description: 'The estimated time of arrival at final destination.'
      }
    })
    metas.push({
      path: `${calcPath}.route.distance`,
      value: {
        description:
          'The remaining distance along the route to reach the final destination.',
        units: 'm'
      }
    })
    metas.push({
      path: `${calcPath}.targetSpeed`,
      value: {
        description:
          'The average speed required to arrive at the destination at the targetArrivalTime.',
        units: 'm/s'
      }
    })

    return {
      updates: [
        {
          meta: metas
        }
      ]
    }
  }

  // ********* Arrival circle events *****************

  const onArrivalCircleEvent = (event: WatchEvent) => {
    if (server.debug.enabled) {
      server.debug(JSON.stringify(event))
    }

    if (!config.notifications.enableArrival) {
      return
    }

    const alarmMethod = config.notifications.sound
      ? [ALARM_METHOD.sound, ALARM_METHOD.visual]
      : [ALARM_METHOD.visual]

    if (event.type === 'enter') {
      if (srcPaths['navigation.position']) {
        emitNotification(
          new NotificationMgr(
            'navigation.course.arrivalCircleEntered',
            `Entered arrival zone: ${event.value.toFixed(
              0
            )}m < ${watchArrival.rangeMax.toFixed(0)}`,
            ALARM_STATE.alert,
            alarmMethod
          )
        )
      }
    }
    if (event.type === 'exit') {
      emitNotification(
        new NotificationMgr('navigation.course.arrivalCircleEntered', null)
      )
    }
  }

  // ********* Passed Destination events *****************
  const onPassedDestEvent = (event: WatchEvent) => {
    if (server.debug.enabled) {
      server.debug(JSON.stringify(event))
    }

    if (!config.notifications.enablePerpendicular) {
      return
    }

    const alarmMethod = config.notifications.sound
      ? [ALARM_METHOD.sound, ALARM_METHOD.visual]
      : [ALARM_METHOD.visual]
    if (event.type === 'enter') {
      if (srcPaths['navigation.position']) {
        emitNotification(
          new NotificationMgr(
            'navigation.course.perpendicularPassed',
            watchPassedDest.value === 1
              ? 'Next Point perpendicular has been passed.'
              : '',
            ALARM_STATE.alert,
            alarmMethod
          )
        )
      }
    }
    if (event.type === 'exit') {
      emitNotification(
        new NotificationMgr('navigation.course.perpendicularPassed', null)
      )
    }
  }

  // send notification delta message
  const emitNotification = (notification: NotificationMgr) => {
    if (server.debug.enabled) {
      server.debug(JSON.stringify(notification?.message))
    }
    server.handleMessage(plugin.id, {
      updates: [{ values: [notification.message] }]
    })
  }

  return plugin
}
