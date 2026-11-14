import { ALARM_METHOD, Delta, Path, Value, Zone } from '@signalk/server-api'
import { getMetadata } from '@signalk/path-metadata'
import { StreamBundle } from './streambundle'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:zones')

export interface ZoneMethods {
  normalMethod?: ALARM_METHOD[] | null
  nominalMethod?: ALARM_METHOD[] | null
  alertMethod?: ALARM_METHOD[] | null
  warnMethod?: ALARM_METHOD[] | null
  alarmMethod?: ALARM_METHOD[] | null
  emergencyMethod?: ALARM_METHOD[] | null
}

export class Zones {
  private unsubscribesForPaths: {
    [path: Path]: () => void
  } = {}
  constructor(
    private streambundle: StreamBundle,
    private sendDelta: (delta: Delta) => void
  ) {
    streambundle.getSelfMetaBus().onValue((metaMessage) => {
      debug.enabled && debug(`${JSON.stringify(metaMessage)}`)
      const { path, value } = metaMessage

      //send normal notification to clear out any previous notification
      //when zones field is reset
      if (value.zones === null) {
        this.unsubscribesForPaths[path]?.()
        delete this.unsubscribesForPaths[path]
        this.sendNormalDelta(path)
        return
      }
      if (value.zones) {
        this.watchForZones(path, value.zones, value as ZoneMethods)
      }
    })
  }

  sendNormalDelta(path: Path) {
    this.sendDelta({
      updates: [
        {
          values: [
            {
              path: `notifications.${path}` as Path,
              value: { state: 'normal', method: [] }
            }
          ]
        }
      ]
    })
  }

  watchForZones(path: Path, zones: Zone[], methods: ZoneMethods) {
    if (this.unsubscribesForPaths[path]) {
      this.unsubscribesForPaths[path]()
    }
    this.unsubscribesForPaths[path] = this.streambundle
      .getSelfStream(path)
      .map((value) => zoneIndexOf(zones, value))
      .skipDuplicates()
      .onValue((zoneIndex: number) => {
        if (debug.enabled) {
          debug(`Notify: ${path}, zone ${zoneIndex}`)
        }
        this.sendDelta(
          getNotificationDelta(path, zoneIndex, zones, methods, nameOf(path))
        )
      })
  }
}

/**
 * The index of the zone a value is in, or -1. A zone holds the values from its
 * lower limit up to, not including, its upper one, or its single value when
 * both limits are equal; the first zone listed that holds the value gets it.
 * A value no zone holds goes to the first zone whose upper limit it is, as the
 * specification defines `upper` as "the highest value in this zone".
 */
export function zoneIndexOf(zones: Zone[], value: Value): number {
  if (typeof value !== 'number') {
    return -1
  }
  let atUpper = -1
  for (let i = 0; i < zones.length; i++) {
    const { lower = -Infinity, upper = Infinity } = zones[i]
    if (value < lower) {
      continue
    }
    if (value < upper || (value === lower && value === upper)) {
      return i
    }
    if (value === upper && atUpper < 0) {
      atUpper = i
    }
  }
  return atUpper
}

/**
 * The display name a path has now. It is read from the metadata the server
 * keeps, as the user may set, change or remove it apart from the zones.
 */
function nameOf(path: Path): string {
  const name = getMetadata(`vessels.self.${path}`)?.displayName
  return typeof name === 'string' && name ? name : path
}

/**
 * The message of a zone given none of its own. A display may show nothing of
 * a notification but its message, so it names the value and its range.
 */
export function defaultZoneMessage(
  name: string,
  { lower, upper }: Pick<Zone, 'lower' | 'upper'>
): string {
  if (lower === undefined && upper === undefined) {
    return name
  }
  if (lower === undefined) {
    return `${name} at or below ${upper}`
  }
  if (upper === undefined) {
    return `${name} at or above ${lower}`
  }
  if (lower === upper) {
    return `${name} at ${lower}`
  }
  return `${name} between ${lower} and ${upper}`
}

export function getMethod(state: string, methods: ZoneMethods): ALARM_METHOD[] {
  const methodName = `${state}Method` as keyof ZoneMethods
  const method = methods[methodName]
  if (Array.isArray(method)) {
    return method
  }
  // Explicitly null means no methods
  if (method === null) {
    return []
  }
  // Undefined => default to visual
  return [ALARM_METHOD.visual]
}

function getNotificationDelta(
  path: Path,
  zoneIndex: number,
  zones: Zone[],
  methods: ZoneMethods,
  name: string
) {
  let value = null
  if (zoneIndex >= 0) {
    const zone = zones[zoneIndex]
    value = {
      state: zone.state as string,
      message: zone.message || defaultZoneMessage(name, zone),
      method: getMethod(zone.state, methods)
    }
  } else {
    // Default to "normal" zone
    value = {
      state: 'normal',
      message: 'Value is within normal range',
      method: getMethod('normal', methods)
    }
  }
  return {
    updates: [
      {
        values: [
          {
            path: `notifications.${path}` as Path,
            value: value
          }
        ]
      }
    ]
  }
}
