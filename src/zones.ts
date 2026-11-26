import {
  ALARM_METHOD,
  ALARM_STATE,
  Delta,
  MetaValue,
  Notification,
  Path,
  Value,
  Zone
} from '@signalk/server-api'
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

/** How severe a zone's state is; only a move up waits for a delay. */
const SEVERITY = new Map<string, number>([
  ['normal', 0],
  ['nominal', 0],
  ['alert', 1],
  ['warn', 2],
  ['alarm', 3],
  ['emergency', 4]
])
const MAX_SEVERITY = 4

/** setTimeout runs a longer timeout at once, so a delay is capped to it */
const MAX_DELAY_MS = 2 ** 31 - 1

interface ZoneWatcher {
  zonesKey: string
  /** The value last seen, for a watcher rebuilt for changed zones to start from */
  lastValue: () => Value | undefined
  update: (zones: Zone[], methods: ZoneMethods, name: string) => void
  refresh: (name: string) => void
  stop: () => void
}

/** A notification sent for a path, and its zone; none for the normal state */
interface Standing {
  zone?: Zone
  notification: Notification
}

export class Zones {
  private watchers: { [path: Path]: ZoneWatcher } = {}
  /** The notification last sent for a path, kept when its watcher is rebuilt */
  private standing: { [path: Path]: Standing } = {}
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
        this.watchers[path]?.stop()
        delete this.watchers[path]
        delete this.standing[path]
        this.sendNormalDelta(path)
        return
      }
      if (Array.isArray(value.zones)) {
        this.watchForZones(
          path,
          value.zones,
          value as ZoneMethods,
          nameOf(path, value)
        )
      } else {
        this.watchers[path]?.refresh(nameOf(path, value))
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

  /**
   * A metadata update from a PUT carries all of a path's metadata, the zones
   * with it, so an update that leaves the zones' limits, states and delays as
   * they are keeps the watcher, and with it a pending delay; changed messages
   * and methods are taken over in place. Changed limits, states or delays
   * rebuild the watcher. As a path may send its value only when it changes,
   * the new one starts from the value last seen, and a delay counts from the
   * change.
   */
  watchForZones(path: Path, zones: Zone[], methods: ZoneMethods, name: string) {
    const zonesKey = JSON.stringify(
      zones.map(({ lower, upper, state, delay }) => [
        lower,
        upper,
        state,
        delay
      ])
    )
    const watcher = this.watchers[path]
    if (watcher?.zonesKey === zonesKey) {
      watcher.update(zones, methods, name)
      return
    }
    watcher?.stop()
    this.watchers[path] = this.createWatcher(
      path,
      zones,
      zonesKey,
      methods,
      name,
      watcher?.lastValue()
    )
  }

  /**
   * Notifies each time the value moves to another zone. A move to a more
   * severe zone that has a delay is notified only once the value has been at
   * that zone's severity or a higher one for that long, so a short excursion,
   * such as a battery's voltage while an engine cranks, raises nothing. As an
   * alerting system times each alert from crossing its own threshold, the time
   * counts per severity: a value moving to and fro between a low and a very
   * low zone raises the low one, and a less severe zone the value went
   * through is raised when its own delay is up, even while a more severe one
   * is still waiting. A move to a less severe zone, or out of all zones, is
   * notified at once. Time is taken from the monotonic clock, as the system
   * clock of a boat's computer may be set while it runs.
   */
  private createWatcher(
    path: Path,
    initialZones: Zone[],
    zonesKey: string,
    initialMethods: ZoneMethods,
    name: string,
    initialValue: Value | undefined
  ): ZoneWatcher {
    let zones = initialZones
    let methods = initialMethods
    const zoneOf = (zoneIndex: number) =>
      zoneIndex >= 0 ? zones[zoneIndex] : undefined
    const severityOf = (zoneIndex: number) =>
      SEVERITY.get(zoneOf(zoneIndex)?.state ?? ALARM_STATE.normal) ?? 0
    const standingSeverity = () =>
      SEVERITY.get(
        this.standing[path]?.notification.state ?? ALARM_STATE.normal
      ) ?? 0
    // A notification sent before the zones were changed stays this watcher's
    // own while the zones still hold its zone, so that a new message for it
    // reaches it
    let notified = indexOfStanding(zones, this.standing[path])
    let lastValue: Value | undefined
    let current = -1
    let pending: ReturnType<typeof setTimeout> | undefined
    // When the value reached each severity and has stayed at or above it,
    // and the zone it was in at that severity last
    const reachedAt: (number | undefined)[] = []
    const zoneAt: (number | undefined)[] = []
    const send = (zone: Zone | undefined, name: string) => {
      const notification = zoneNotification(zone, methods, name)
      this.standing[path] = { zone, notification }
      if (debug.enabled) {
        debug(`Notify: ${path}, ${JSON.stringify(notification)}`)
      }
      this.sendDelta(notificationDelta(path, notification))
    }
    // A name is given while a metadata update is taken in, as the server
    // keeps that update's metadata only after the zones have seen it
    const notify = (zoneIndex: number, name = nameOf(path)) => {
      pending = undefined
      notified = zoneIndex
      send(zoneOf(zoneIndex), name)
    }
    // Sends the standing notification again if a new message, method or
    // name changes it. One whose zone the zones no longer hold keeps its
    // message until the value is notified anew.
    const refresh = (name: string) => {
      const standing = this.standing[path]
      if (!standing) {
        return
      }
      const zone = notified === undefined ? standing.zone : zoneOf(notified)
      if (
        JSON.stringify(zoneNotification(zone, methods, name)) !==
        JSON.stringify(standing.notification)
      ) {
        send(zone, name)
      }
    }
    // Waits for the first delay to end among the zones above the state
    // notified last that the value has been in since reaching their severity
    const arm = (name?: string) => {
      const now = performance.now()
      let next: number | undefined
      let nextAt = Infinity
      const from = standingSeverity() + 1
      for (let s = from; s <= severityOf(current); s++) {
        const zoneIndex = zoneAt[s]
        if (zoneIndex !== undefined) {
          const due = (reachedAt[s] ?? now) + zoneDelayMs(zones[zoneIndex])
          if (due <= nextAt) {
            next = zoneIndex
            nextAt = due
          }
        }
      }
      if (next === undefined) {
        return
      }
      if (nextAt <= now) {
        notify(next, name)
        if (next !== current) {
          arm(name)
        }
        return
      }
      pending = setTimeout(
        (zoneIndex: number) => {
          notify(zoneIndex)
          if (zoneIndex !== current) {
            arm()
          }
        },
        nextAt - now,
        next
      )
    }
    const onValue = (value: Value, name?: string) => {
      const zoneIndex = zoneIndexOf(zones, value)
      const seen = lastValue !== undefined
      lastValue = value
      if (seen && zoneIndex === current) {
        return
      }
      clearTimeout(pending)
      pending = undefined
      const severity = severityOf(zoneIndex)
      const now = performance.now()
      for (let s = 1; s <= MAX_SEVERITY; s++) {
        if (s <= severity) {
          reachedAt[s] ??= now
        } else {
          reachedAt[s] = undefined
          zoneAt[s] = undefined
        }
      }
      zoneAt[severity] = zoneIndex
      current = zoneIndex
      if (zoneIndex === notified) {
        return
      }
      if (severity <= standingSeverity()) {
        notify(zoneIndex, name)
        return
      }
      arm(name)
    }
    const unsubscribe = this.streambundle
      .getSelfStream(path)
      .onValue((value: Value) => onValue(value))
    if (initialValue !== undefined) {
      onValue(initialValue, name)
    }
    refresh(name)
    return {
      zonesKey,
      lastValue: () => lastValue,
      update: (newZones, newMethods, newName) => {
        zones = newZones
        methods = newMethods
        refresh(newName)
      },
      refresh,
      stop: () => {
        clearTimeout(pending)
        unsubscribe()
      }
    }
  }
}

/**
 * The index the zone of a standing notification has among the zones: -1 for
 * the normal state, none when no zone has its limits and state.
 */
function indexOfStanding(
  zones: Zone[],
  standing: Standing | undefined
): number | undefined {
  if (!standing) {
    return undefined
  }
  const { zone } = standing
  if (!zone) {
    return -1
  }
  const index = zones.findIndex(
    ({ lower, upper, state }) =>
      lower === zone.lower && upper === zone.upper && state === zone.state
  )
  return index >= 0 ? index : undefined
}

/** A zone's delay in milliseconds; none, a negative or a non-number is 0. */
function zoneDelayMs({ delay }: Zone): number {
  return typeof delay === 'number' && delay > 0
    ? Math.min(delay * 1000, MAX_DELAY_MS)
    : 0
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
 * keeps, as the user may set, change or remove it apart from the zones. A
 * metadata update reaches the zones before the server keeps it, so a name
 * the update sets or clears is newer than the kept one.
 */
function nameOf(path: Path, update?: MetaValue): string {
  const name =
    update && 'displayName' in update
      ? update.displayName
      : getMetadata(`vessels.self.${path}`)?.displayName
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

/** The notification for a zone, or for the normal state without one */
function zoneNotification(
  zone: Zone | undefined,
  methods: ZoneMethods,
  name: string
): Notification {
  return zone
    ? {
        state: zone.state,
        message: zone.message || defaultZoneMessage(name, zone),
        method: getMethod(zone.state, methods)
      }
    : {
        state: ALARM_STATE.normal,
        message: 'Value is within normal range',
        method: getMethod(ALARM_STATE.normal, methods)
      }
}

function notificationDelta(path: Path, notification: Notification): Delta {
  return {
    updates: [
      {
        values: [
          {
            path: `notifications.${path}` as Path,
            value: notification
          }
        ]
      }
    ]
  }
}
