import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:gnssOffsetCorrector')

import {
  Delta,
  GnssOffsetCorrection,
  Meta,
  Path,
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

const POSITION_PATH = 'navigation.position'
const POSITION_META_PATH = POSITION_PATH as Path

interface SensorEntry {
  sensorId: string
  offset: AntennaOffset
}

// Server-side lever-arm correction for GNSS antenna offsets.
//
// Rewrites navigation.position deltas whose $source matches a configured
// gnssSensors row, so downstream consumers (full data model, streambundle,
// WebSocket subscribers, history-recording plugins) see the position at
// the Common Coordinate Reference Point (CCRP) rather than at the antenna.
//
// CCRP is defined as center-of-vessel on the centerline: body coordinates
// (length/2, 0) measured from the bow. Derived from design.length.overall
// (already in Server -> Settings -> Vessel Configuration). When length or
// heading is unavailable, the delta passes through unmodified.
//
// The raw antenna value is preserved in the same update's meta entry under
// gnssOffsetCorrection so history plugins can reconstruct the antenna's
// track. app.deltaCache stores the raw per-source value because it ingests
// before the chain runs - that is intentional and matches the Data Browser
// expectation that the per-source view shows what each antenna reports.
export class GnssOffsetCorrector {
  private lookup: Map<string, SensorEntry> = new Map()
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
      }
    })
    this.app.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        next(this.handle(delta))
      }
    )
  }

  private rebuildLookup(): void {
    const next = new Map<string, SensorEntry>()
    const sensors = this.app.config.settings.gnssSensors ?? []
    for (const s of sensors) {
      // Skip rows that cannot drive a correctness-preserving correction:
      //   - empty $source would otherwise hijack every position delta;
      //   - a half-filled offset (one axis still null) would fabricate
      //     geometry by coercing the missing axis to zero. Either case
      //     is user-error state from a partially-edited row, so we
      //     pass the delta through untouched.
      if (!s.$source) continue
      if (s.fromBow === null || s.fromCenter === null) continue
      next.set(s.$source, {
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
    if (this.lookup.size === 0) return delta
    if (delta.context !== this.app.selfContext) return delta
    if (!delta.updates) return delta
    for (const update of delta.updates) {
      this.handleUpdate(update)
    }
    return delta
  }

  private handleUpdate(update: Update): void {
    if (!('values' in update) || !update.values) return
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
    if (!posPv || !entry) return
    const lengthOverall = this.readLengthOverall()
    if (lengthOverall === undefined) {
      if (!this.warnedNoLength) {
        debug.enabled &&
          debug(
            'skipping correction: design.length.overall not configured; configure under Server > Settings > Vessel Configuration'
          )
        this.warnedNoLength = true
      }
      return
    }
    const headingTrue = this.readHeadingTrue()
    if (headingTrue === undefined) {
      const src = update.$source ?? ('unknown' as SourceRef)
      if (!this.warnedNoHeading.has(src)) {
        debug.enabled &&
          debug('skipping correction for %s: no heading available', src)
        this.warnedNoHeading.add(src)
      }
      return
    }
    const raw = posPv.value
    posPv.value = correctPosition(raw, entry.offset, lengthOverall, headingTrue)
    const correction: GnssOffsetCorrection = {
      $sensor: entry.sensorId,
      fromBow: entry.offset.fromBow,
      fromCenter: entry.offset.fromCenter,
      lengthOverall,
      headingTrue,
      rawValue: raw
    }
    const metaEntry: Meta = {
      path: POSITION_META_PATH,
      value: { gnssOffsetCorrection: correction }
    }
    if ('meta' in update && Array.isArray(update.meta)) {
      update.meta.push(metaEntry)
    } else {
      ;(update as Update & { meta: Meta[] }).meta = [metaEntry]
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
