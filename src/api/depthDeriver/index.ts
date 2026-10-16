import { Delta, Path, PathValue, SourceRef, Update } from '@signalk/server-api'
import { IRouter } from 'express'
import { SignalKMessageHub, WithConfig } from '../../app'
import { ConfigApp } from '../../config/config'
import { WithSecurityStrategy } from '../../security'

export interface DepthDeriverApplication
  extends
    IRouter,
    ConfigApp,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

const DERIVER_ID = 'depthDeriver'
// $source suffix for derived depths, published next to the transducer's
// own source. Also the recursion guard: derived updates are never derived
// from again.
const DERIVED_SOURCE_SUFFIX = '.derived'

const BELOW_TRANSDUCER = 'environment.depth.belowTransducer' as Path
const BELOW_SURFACE = 'environment.depth.belowSurface' as Path
const BELOW_KEEL = 'environment.depth.belowKeel' as Path
const SURFACE_TO_TRANSDUCER = 'environment.depth.surfaceToTransducer' as Path
const TRANSDUCER_TO_KEEL = 'environment.depth.transducerToKeel' as Path

const DEPTH_PATHS: ReadonlySet<string> = new Set([
  BELOW_TRANSDUCER,
  BELOW_SURFACE,
  BELOW_KEEL,
  SURFACE_TO_TRANSDUCER,
  TRANSDUCER_TO_KEEL
])

type DerivedPath = typeof BELOW_SURFACE | typeof BELOW_KEEL

interface DepthReading {
  belowTransducer?: number | null
  belowSurface?: number | null
  belowKeel?: number | null
  surfaceToTransducer?: number | null
  transducerToKeel?: number | null
}

// Derives depth below the surface and below the keel for each transducer
// from what that transducer reports in the same update: its depth below
// the transducer plus the offset it sends with it (PGN 128267 / DPT).
// The offset is either the transducer's depth below the waterline
// (surfaceToTransducer) or its height above the keel (transducerToKeel);
// the vessel's draft converts between the two.
//
// Derived values go out under `<$source>.derived` with the input's
// timestamp, so the raw source is never rewritten and consumers pick
// between them with source priorities. A path the transducer already
// reports itself is not derived. Only offsets from the same update are
// used, so a derived value can never pair a depth with an offset from
// another time; when an input disappears, the derived path goes null.
export class DepthDeriver {
  // Derived paths last published per source, so a lost input can be
  // retracted with null instead of leaving a stale derived value.
  private published = new Map<string, Set<DerivedPath>>()

  constructor(private app: DepthDeriverApplication) {}

  async start(): Promise<void> {
    this.app.registerDeltaInputHandler(
      (delta: Delta, next: (delta: Delta) => void) => {
        this.handle(delta)
        next(delta)
      }
    )
  }

  private handle(delta: Delta): void {
    if (delta.context !== this.app.selfContext) return
    if (!delta.updates) return
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
      // the derived delta reach the cache before the original does.
      const updates = emitted
      setImmediate(() => {
        this.app.handleMessage(DERIVER_ID, { context: delta.context, updates })
      })
    }
  }

  private handleUpdate(update: Update): Update | undefined {
    if (!('values' in update) || !update.values) return undefined
    const sourceRef = update.$source
    if (!sourceRef || sourceRef.endsWith(DERIVED_SOURCE_SUFFIX)) {
      return undefined
    }
    const reading = readDepth(update.values)
    if (reading === undefined || reading.belowTransducer === undefined) {
      return undefined
    }
    const derived = deriveDepths(reading, this.readDraft())
    const previous = this.published.get(sourceRef)
    const values: PathValue[] = []
    for (const [path, value] of derived) {
      if (value !== null || previous?.has(path)) values.push({ path, value })
    }
    if (previous) {
      for (const path of previous) {
        if (!derived.has(path)) values.push({ path, value: null })
      }
    }
    if (values.length === 0) return undefined
    const current = new Set<DerivedPath>()
    for (const [path, value] of derived) {
      if (value !== null) current.add(path)
    }
    if (current.size > 0) {
      this.published.set(sourceRef, current)
    } else {
      this.published.delete(sourceRef)
    }
    return {
      $source: `${sourceRef}${DERIVED_SOURCE_SUFFIX}` as SourceRef,
      timestamp: update.timestamp,
      values
    } as Update
  }

  // The keel's depth below the waterline: the current draft when the
  // vessel reports one, otherwise the configured maximum.
  private readDraft(): number | undefined {
    const draft = this.app.signalk.self?.design?.draft?.value as
      { current?: unknown; maximum?: unknown } | undefined
    for (const candidate of [draft?.current, draft?.maximum]) {
      if (
        typeof candidate === 'number' &&
        Number.isFinite(candidate) &&
        candidate > 0
      ) {
        return candidate
      }
    }
    return undefined
  }
}

function readDepth(values: PathValue[]): DepthReading | undefined {
  let reading: DepthReading | undefined
  for (const pv of values) {
    if (!DEPTH_PATHS.has(pv.path)) continue
    const value =
      typeof pv.value === 'number' && Number.isFinite(pv.value)
        ? pv.value
        : null
    reading = reading ?? {}
    switch (pv.path) {
      case BELOW_TRANSDUCER:
        reading.belowTransducer = value
        break
      case BELOW_SURFACE:
        reading.belowSurface = value
        break
      case BELOW_KEEL:
        reading.belowKeel = value
        break
      case SURFACE_TO_TRANSDUCER:
        reading.surfaceToTransducer = value
        break
      case TRANSDUCER_TO_KEEL:
        reading.transducerToKeel = value
        break
    }
  }
  return reading
}

// Returns the derived value for each path the transducer does not report
// itself, or null where it cannot be derived from this reading.
export function deriveDepths(
  reading: DepthReading,
  draft: number | undefined
): Map<DerivedPath, number | null> {
  const derived = new Map<DerivedPath, number | null>()
  const transducerDepth = transducerDepthBelowSurface(reading, draft)
  const belowTransducer = reading.belowTransducer
  const belowSurface =
    typeof belowTransducer === 'number' && transducerDepth !== undefined
      ? belowTransducer + transducerDepth
      : null
  if (reading.belowSurface === undefined) {
    derived.set(BELOW_SURFACE, belowSurface)
  }
  if (reading.belowKeel === undefined) {
    const surface = reading.belowSurface ?? belowSurface
    // A transducer deeper than the keel contradicts the draft: one of the
    // two is misconfigured, so no keel depth is derived from them.
    const keelBelowTransducer =
      transducerDepth === undefined ||
      (draft !== undefined && transducerDepth <= draft)
    derived.set(
      BELOW_KEEL,
      typeof surface === 'number' && draft !== undefined && keelBelowTransducer
        ? surface - draft
        : null
    )
  }
  return derived
}

function transducerDepthBelowSurface(
  reading: DepthReading,
  draft: number | undefined
): number | undefined {
  // An offset of 0 is the unset default of PGN 128267 and most
  // transducers, not a transducer at the waterline or on the keel.
  const toSurface = reading.surfaceToTransducer
  if (typeof toSurface === 'number' && toSurface > 0) return toSurface
  const toKeel = reading.transducerToKeel
  if (typeof toKeel === 'number' && toKeel !== 0 && draft !== undefined) {
    // Older converters publish the keel distance negative; it is a
    // distance either way.
    const depth = draft - Math.abs(toKeel)
    // A keel above the transducer contradicts the draft: one of the two
    // is misconfigured, so no depth is derived from them.
    if (depth >= 0) return depth
  }
  return undefined
}
