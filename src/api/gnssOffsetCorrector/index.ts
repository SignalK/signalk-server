import { Delta, Path, PathValue, SourceRef, Update } from '@signalk/server-api'
import { IRouter } from 'express'
import { get as _get } from 'lodash'
import { SignalKMessageHub, WithConfig } from '../../app'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'
import { correctPosition, AntennaOffset, Position } from './leverArm'

export interface GnssCorrectorApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

const POSITION_PATH = 'navigation.position' as Path
const CORRECTOR_ID = 'gnssOffsetCorrector'
// $source suffix for corrected positions published alongside the
// original in 'both' mode. Also serves as the recursion guard: rows
// bound to a *.ccrp ref are never used for correction.
const CCRP_SOURCE_SUFFIX = '.ccrp'
const MAX_CORRECTABLE_LATITUDE = 89.999999
// Raised when a correction mode is active and vessel length is set but no
// true heading is available, so vessel reference point correction cannot run.
// Cleared when heading returns.
const HEADING_NOTIFICATION_PATH =
  'notifications.navigation.gnss.headingUnavailable' as Path

export type GnssCorrectionMode = 'off' | 'replace' | 'both'

// Snapshot of whether vessel reference point correction can currently run, for
// the sensors API GET response and the admin UI. `active` is true only when a
// correction mode is selected and both required inputs (vessel length and
// true heading) are available. `blocked` names the missing input so the UI
// can prompt the user to supply it.
export interface GnssCorrectionStatus {
  mode: GnssCorrectionMode
  active: boolean
  blocked?: 'no-length' | 'no-heading'
}

interface SensorEntry {
  sensorId: string
  offset: AntennaOffset
}

// Server-side vessel reference point (CCRP) correction for GNSS antenna
// offsets.
//
// How configured offsets are applied is governed by
// settings.gnssCorrection:
//
//   'off'     - (default) offsets are stored and documented but
//               navigation.position data is not touched.
//   'replace' - navigation.position deltas whose $source matches a
//               configured gnssSensors row are rewritten in place, so
//               downstream consumers (full data model, streambundle,
//               WebSocket subscribers, history-recording plugins) see
//               the position at the Consistent Common Reference Point
//               (CCRP) rather than at the antenna. The raw antenna value
//               is not retained; use 'both' to keep both positions.
//   'both'    - the original delta passes through untouched and the
//               corrected position is additionally published under
//               `<sensorId>.ccrp`, so both positions coexist as
//               separate sources on navigation.position and clients
//               choose via source priorities.
//
// CCRP is defined as center-of-vessel on the centerline: body coordinates
// (length/2, 0) measured from the bow. Derived from design.length.overall
// (already in Server -> Settings -> Vessel Configuration). When length or
// heading is unavailable, the delta passes through unmodified.
//
// app.deltaCache stores the raw per-source value because it ingests
// before the chain runs - that is intentional and matches the Data Browser
// expectation that the per-source view shows what each antenna reports.
export class GnssOffsetCorrector {
  private lookup: Map<string, SensorEntry> = new Map()
  private mode: GnssCorrectionMode = 'off'
  private warnedNoLength = false
  // True while the headingUnavailable notification is raised. Tracked so
  // the notification is emitted only on transition (raise/clear), keeping
  // the per-delta path free of a delta on every position message.
  private headingNotificationActive = false

  constructor(private app: GnssCorrectorApplication) {}

  async start(): Promise<void> {
    this.rebuildLookup()
    this.app.on('serverevent', (e: { type?: string }) => {
      if (e?.type === 'GNSS_SENSORS') {
        this.rebuildLookup()
        this.warnedNoLength = false
        // Config changed (mode/sensors); clear any stale heading warning so
        // the next correction attempt re-evaluates and re-raises if needed.
        this.clearHeadingNotification()
      } else if (e?.type === 'POSITION_SOURCES') {
        // The alias -> canName mapping can resolve after the last
        // config save (cold boot, late address claim). POSITION_SOURCES
        // fires when that happens, so re-canonicalising here keeps the
        // lookup keys aligned with incoming refs.
        this.rebuildLookup()
      }
    })
    this.app.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        next(this.handle(delta))
      }
    )
  }

  // Report whether correction can currently run. When a mode is selected
  // the missing input (if any) is surfaced so the sensors API and admin UI
  // can tell the user why correction is inactive.
  getStatus(): GnssCorrectionStatus {
    if (this.mode === 'off') {
      return { mode: 'off', active: false }
    }
    if (this.readLengthOverall() === undefined) {
      return { mode: this.mode, active: false, blocked: 'no-length' }
    }
    if (this.readHeadingTrue() === undefined) {
      return { mode: this.mode, active: false, blocked: 'no-heading' }
    }
    return { mode: this.mode, active: true }
  }

  private rebuildLookup(): void {
    this.mode = this.app.config.settings.gnssCorrection ?? 'off'
    const next = new Map<string, SensorEntry>()
    const sensors = this.app.config.settings.gnssSensors ?? []
    for (const s of sensors) {
      // An empty $source would hijack every position delta; a *.ccrp ref
      // would make the corrector correct its own output and recurse.
      if (!s.$source) continue
      if (s.$source.endsWith(CCRP_SOURCE_SUFFIX)) continue
      // gnssSensors is config-backed input: a hand-edited or restored file
      // can carry a half-filled row (null/undefined axis) or a non-finite
      // value (NaN/Infinity). Either would fabricate geometry or produce a
      // NaN position, so skip the row. The typeof checks also narrow away
      // null/undefined for the offset assignment below.
      if (
        typeof s.fromBow !== 'number' ||
        !Number.isFinite(s.fromBow) ||
        typeof s.fromCenter !== 'number' ||
        !Number.isFinite(s.fromCenter)
      ) {
        continue
      }
      // Key by the canonical form: a row saved while the device's CAN
      // name was still unresolved holds the alias ref, while incoming
      // deltas are canonicalised before the lookup in handleUpdate.
      const canonical = this.app.deltaCache.canonicaliseSourceRef(s.$source)
      next.set(canonical, {
        sensorId: s.sensorId,
        offset: {
          fromBow: s.fromBow,
          fromCenter: s.fromCenter
        }
      })
    }
    this.lookup = next
  }

  private handle(delta: Delta): Delta {
    if (this.mode === 'off') return delta
    if (this.lookup.size === 0) return delta
    if (delta.context !== this.app.selfContext) return delta
    if (!delta.updates) return delta
    let emitted: Update[] | undefined
    for (const update of delta.updates) {
      const emission = this.handleUpdate(update)
      if (emission) {
        emitted = emitted ?? []
        emitted.push(emission)
      }
    }
    if (emitted) {
      // Publish outside the input-handler call stack: handleMessage runs
      // the delta chain synchronously, and re-entering it here would let
      // the corrected delta reach cache/streambundle before the original
      // finishes its own pass.
      const companions = emitted
      setImmediate(() => {
        this.app.handleMessage(CORRECTOR_ID, {
          context: delta.context,
          updates: companions
        })
      })
    }
    return delta
  }

  // In 'replace' mode the update is corrected in place and nothing is
  // returned. In 'both' mode the update is left untouched and the
  // corrected position is returned as a new update to publish under
  // the sensor's *.ccrp source.
  private handleUpdate(update: Update): Update | undefined {
    if (!('values' in update) || !update.values) return undefined
    let posPv: { path: Path; value: Position } | undefined
    let entry: SensorEntry | undefined
    for (const pv of update.values) {
      if (pv.path !== POSITION_PATH) continue
      if (pv.value === null || typeof pv.value !== 'object') continue
      const sourceRef = update.$source
      if (!sourceRef) continue
      // Configured rows hold the canonical (canName-form) ref offered by
      // positionSources; N2K deltas that arrive before the device's
      // address claim is observed are tagged with the numeric-src alias.
      // Canonicalise before the lookup so those deltas still match.
      entry = this.lookup.get(
        this.app.deltaCache.canonicaliseSourceRef(sourceRef)
      )
      if (entry) {
        posPv = pv as { path: Path; value: Position }
        break
      }
    }
    if (!posPv || !entry) return undefined
    const corrected = this.computeCorrection(posPv.value, entry)
    if (!corrected) return undefined
    if (this.mode === 'both') {
      const ccrpRef = `${entry.sensorId}${CCRP_SOURCE_SUFFIX}` as SourceRef
      return {
        $source: ccrpRef,
        timestamp: update.timestamp,
        values: [{ path: POSITION_PATH, value: corrected } as PathValue]
      } as Update
    }
    posPv.value = corrected
    return undefined
  }

  private computeCorrection(
    raw: Position,
    entry: SensorEntry
  ): Position | undefined {
    // Providers are external input: a malformed position (missing or
    // non-finite coordinates) passes through untouched instead of being
    // turned into NaN by the trigonometry.
    if (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) {
      return undefined
    }
    // The east/west metres-per-degree scale (cos latitude) vanishes at
    // the poles; skip correction rather than emit a garbage longitude.
    if (Math.abs(raw.latitude) > MAX_CORRECTABLE_LATITUDE) {
      return undefined
    }
    const lengthOverall = this.readLengthOverall()
    if (lengthOverall === undefined) {
      if (!this.warnedNoLength) {
        // User-actionable misconfiguration (a correction mode is on but the
        // vessel length it needs is unset), so surface it at warn level
        // rather than hiding it behind the debug flag. Warned once until the
        // config changes to avoid flooding the log on the per-delta path.
        console.warn(
          'GNSS vessel reference point (CCRP) correction skipped: design.length.overall not configured; set it under Server > Settings > Vessel Configuration'
        )
        this.warnedNoLength = true
      }
      return undefined
    }
    const headingTrue = this.readHeadingTrue()
    if (headingTrue === undefined) {
      // Length is set and a mode is active, so this is a real loss of a
      // required input: raise a notification (once, on transition) so the
      // user learns correction has stopped rather than silently getting
      // uncorrected positions.
      this.raiseHeadingNotification()
      return undefined
    }
    // Heading is back; retract any outstanding notification.
    this.clearHeadingNotification()
    return correctPosition(raw, entry.offset, lengthOverall, headingTrue)
  }

  private raiseHeadingNotification(): void {
    if (this.headingNotificationActive) return
    this.headingNotificationActive = true
    this.emitHeadingNotification(
      'warn',
      'GNSS vessel reference point (CCRP) correction inactive: no true heading available'
    )
  }

  private clearHeadingNotification(): void {
    if (!this.headingNotificationActive) return
    this.headingNotificationActive = false
    this.emitHeadingNotification(
      'normal',
      'GNSS vessel reference point (CCRP) correction resumed: true heading available'
    )
  }

  private emitHeadingNotification(state: string, message: string): void {
    this.app.handleMessage(CORRECTOR_ID, {
      updates: [
        {
          values: [
            {
              path: HEADING_NOTIFICATION_PATH,
              value: { state, method: ['visual'], message }
            }
          ]
        }
      ]
    })
  }

  // Read directly from app.signalk.self the same way put.ts and the
  // plugin-facing getSelfPath helper do. The plugin `getSelfPath` wrapper
  // is only assembled inside interfaces/plugins.ts and is not exposed on
  // the bare app passed into startApis, so we cannot rely on it here.
  private readLengthOverall(): number | undefined {
    const length = _get(this.app.signalk.self, 'design.length.value') as
      { overall?: number } | number | undefined
    const overall = typeof length === 'number' ? length : length?.overall
    // A non-positive or non-finite length would place the CCRP nowhere
    // sensible and feed correctPosition garbage; treat it as unavailable.
    return typeof overall === 'number' &&
      Number.isFinite(overall) &&
      overall > 0
      ? overall
      : undefined
  }

  private readHeadingTrue(): number | undefined {
    const t = _get(this.app.signalk.self, 'navigation.headingTrue.value')
    if (typeof t === 'number' && Number.isFinite(t)) return t
    const m = _get(this.app.signalk.self, 'navigation.headingMagnetic.value')
    const v = _get(this.app.signalk.self, 'navigation.magneticVariation.value')
    if (
      typeof m === 'number' &&
      Number.isFinite(m) &&
      typeof v === 'number' &&
      Number.isFinite(v)
    ) {
      return m + v
    }
    return undefined
  }
}
