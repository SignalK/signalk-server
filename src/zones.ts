import { Delta, Path } from '@signalk/server-api'
import { StreamBundle } from './streambundle'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:zones')
type ZoneState = 'nominal' | 'alert' | 'warn' | 'alarm' | 'emergency'

interface Zone {
  lower: number | undefined
  upper: number | undefined
  state: ZoneState
  message: string
}

export class Zones {
  private unsubscribesForPaths: {
    [path: Path]: () => void
  } = {}
  constructor(
    private streambundle: StreamBundle,
    private sendDelta: (delta: Delta) => void
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    streambundle.getSelfMetaBus().onValue((metaMessage: any) => {
      debug(`${JSON.stringify(metaMessage)}`)
      const { path, value } = metaMessage
      if (value.zones) {
        this.watchForZones(path, value.zones)
      }
    })
  }

  watchForZones(path: Path, zones: Zone[]) {
    if (this.unsubscribesForPaths[path]) {
      this.unsubscribesForPaths[path]()
    }
    const tests = zones.map((zone) => {
      const { upper, lower } = zone
      if (upper !== undefined) {
        if (lower !== undefined) {
          return (value: number) => value < upper && value >= lower
        } else {
          return (value: number) => value < upper
        }
      } else {
        if (lower !== undefined) {
          return (value: number) => value > lower
        } else {
          return () => false
        }
      }
    })

    this.unsubscribesForPaths[path] = this.streambundle
      .getSelfStream(path)
      .map((value: number | null) => {
        if (value === null) {
          return -1
        }
        const zoneIndex = tests.findIndex((test) => test(value))
        return zoneIndex
      })
      .skipDuplicates()
      .onValue((zoneIndex: number) => {
        if (debug.enabled) {
          debug(
            `Notify: ${path}, zone ${zoneIndex}`
          )
        }
        this.sendDelta(getNotificationDelta(path, zoneIndex, zones))
      })
  }
}

function getNotificationDelta(path: Path, zoneIndex: number, zones: Zone[]) {
  let value = null
  if (zoneIndex >= 0) {
    const { lower, upper, state, message } = zones[zoneIndex]
    value = {
      state: state as string,
      message: message || `${lower} < value < ${upper}`,
      method: []
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
