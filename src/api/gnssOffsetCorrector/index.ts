import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:gnssOffsetCorrector')

import {
  Delta,
  GnssOffsetCorrection,
  Meta,
  Path,
  PathValue,
  SourceRef,
  Update
} from '@signalk/server-api'
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

export type GnssCorrectionMode = 'off' | 'replace' | 'both'

interface SensorEntry {
  sensorId: string
  offset: AntennaOffset
}

interface CorrectedValue {
  corrected: Position
  correction: GnssOffsetCorrection
}

// Server-side lever-arm correction for GNSS antenna offsets.
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
//               the position at the Common Coordinate Reference Point
//               (CCRP) rather than at the antenna. The raw antenna
//               value is preserved in the same update's meta entry
//               under gnssOffsetCorrection.
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
  private warnedNoHeading: Set<string> = new Set()
  private warnedNoLength = false

  constructor(private app: GnssCorrectorApplication) {}

  async start(): Promise<void> {
    this.rebuildLookup()
    this.app.on('serverevent', (e: { type?: string }) => {
      if (e?.type === 'GNSS_SENSORS') {
        this.rebuildLookup()
        this.warnedNoHeading.clear()
        this.warnedNoLength = false
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

  private rebuildLookup(): void {
    this.mode = this.app.config.settings.gnssCorrection ?? 'off'
    const next = new Map<string, SensorEntry>()
    const sensors = this.app.config.settings.gnssSensors ?? []
    for (const s of sensors) {
      // Skip rows that cannot drive a correctness-preserving correction:
      //   - empty $source would otherwise hijack every position delta;
      //   - a half-filled offset (one axis still null) would fabricate
      //     geometry by coercing the missing axis to zero. Either case
      //     is user-error state from a partially-edited row, so we
      //     pass the delta through untouched.
      // Rows bound to a *.ccrp ref are also skipped: correcting our own
      // corrected output would recurse.
      if (!s.$source) continue
      if (s.$source.endsWith(CCRP_SOURCE_SUFFIX)) continue
      if (
        s.fromBow === null ||
        s.fromBow === undefined ||
        s.fromCenter === null ||
        s.fromCenter === undefined
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
    const computed = this.computeCorrection(update, posPv.value, entry)
    if (!computed) return undefined
    const metaEntry: Meta = {
      path: POSITION_PATH,
      value: { gnssOffsetCorrection: computed.correction }
    }
    if (this.mode === 'both') {
      const ccrpRef = `${entry.sensorId}${CCRP_SOURCE_SUFFIX}` as SourceRef
      return {
        $source: ccrpRef,
        timestamp: update.timestamp,
        values: [
          { path: POSITION_PATH, value: computed.corrected } as PathValue
        ],
        meta: [metaEntry]
      } as Update
    }
    posPv.value = computed.corrected
    if ('meta' in update && Array.isArray(update.meta)) {
      update.meta.push(metaEntry)
    } else {
      ;(update as Update & { meta: Meta[] }).meta = [metaEntry]
    }
    return undefined
  }

  private computeCorrection(
    update: Update,
    raw: Position,
    entry: SensorEntry
  ): CorrectedValue | undefined {
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
        debug.enabled &&
          debug(
            'skipping correction: design.length.overall not configured; configure under Server > Settings > Vessel Configuration'
          )
        this.warnedNoLength = true
      }
      return undefined
    }
    const headingTrue = this.readHeadingTrue()
    if (headingTrue === undefined) {
      const src = update.$source ?? ('unknown' as SourceRef)
      if (!this.warnedNoHeading.has(src)) {
        debug.enabled &&
          debug('skipping correction for %s: no heading available', src)
        this.warnedNoHeading.add(src)
      }
      return undefined
    }
    return {
      corrected: correctPosition(raw, entry.offset, lengthOverall, headingTrue),
      correction: {
        $sensor: entry.sensorId,
        fromBow: entry.offset.fromBow,
        fromCenter: entry.offset.fromCenter,
        lengthOverall,
        headingTrue,
        rawValue: raw
      }
    }
  }

  // Read directly from app.signalk.self the same way put.ts and the
  // plugin-facing getSelfPath helper do. The plugin `getSelfPath` wrapper
  // is only assembled inside interfaces/plugins.ts and is not exposed on
  // the bare app passed into startApis, so we cannot rely on it here.
  private readLengthOverall(): number | undefined {
    const length = _get(this.app.signalk.self, 'design.length.value') as
      { overall?: number } | number | undefined
    if (typeof length === 'number') return length
    if (length && typeof length.overall === 'number') return length.overall
    return undefined
  }

  private readHeadingTrue(): number | undefined {
    const t = _get(this.app.signalk.self, 'navigation.headingTrue.value')
    if (typeof t === 'number') return t
    const m = _get(this.app.signalk.self, 'navigation.headingMagnetic.value')
    const v = _get(this.app.signalk.self, 'navigation.magneticVariation.value')
    if (typeof m === 'number' && typeof v === 'number') return m + v
    return undefined
  }
}
