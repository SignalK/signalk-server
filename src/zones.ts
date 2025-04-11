import { ALARM_METHOD, Delta, Path, Value, Zone } from '@signalk/server-api'
import { StreamBundle } from './streambundle.js'
import { createDebug } from './debug.js'

const debug = createDebug('signalk-server:zones')

interface ZoneMethods {
  normalMethod?: ALARM_METHOD
  nominalMethod?: ALARM_METHOD
  alertMethod?: ALARM_METHOD
  warnMethod?: ALARM_METHOD
  alarmMethod?: ALARM_METHOD
  emergencyMethod?: ALARM_METHOD
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
      debug(`${JSON.stringify(metaMessage)}`)
      const { path, value } = metaMessage

      //send normal notification to clear out any previous notification
      //when zones field is reset
      if (value.zones === null) {
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
    const tests = zones.map((zone) => {
      const { upper = Infinity, lower = -Infinity } = zone

      return (value: Value) => {
        return typeof value === 'number' && value < upper && value >= lower
      }
    })

    this.unsubscribesForPaths[path] = this.streambundle
      .getSelfStream(path)
      .map((value) => {
        if (value === null) {
          return -1
        }
        const zoneIndex = tests.findIndex((test) => test(value))
        return zoneIndex
      })
      .skipDuplicates()
      .onValue((zoneIndex: number) => {
        if (debug.enabled) {
          debug(`Notify: ${path}, zone ${zoneIndex}`)
        }
        this.sendDelta(getNotificationDelta(path, zoneIndex, zones, methods))
      })
  }
}

function getNotificationDelta(
  path: Path,
  zoneIndex: number,
  zones: Zone[],
  methods: ZoneMethods
) {
  let value = null
  if (zoneIndex >= 0) {
    const { lower, upper, state, message } = zones[zoneIndex]
    const methodName: keyof ZoneMethods = `${state}Method`
    value = {
      state: state as string,
      message: message || `${lower} < value < ${upper}`,
      method: methods[methodName] || ['visual']
    }
  } else {
    // Default to "normal" zone
    value = {
      state: 'normal',
      message: 'Value is within normal range',
      method: []
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
