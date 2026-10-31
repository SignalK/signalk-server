import { Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

// Schema for the PUT .../sensors/gnss body. Each sensor has a stable id, a
// $source reference that may be empty for not-yet-linked rows, and nullable
// numeric offsets, mirroring what the admin UI sends. sensorId is the
// base-delta sweep key for the historical (pre-corrector) per-sensor
// entries; reject anything containing `.` so the legacy cleanup paths
// cannot be tricked into removing keys outside `sensors.gps.<sensorId>.*`.
const gnssSensorSchema = Type.Object(
  {
    sensorId: Type.String({ minLength: 1, pattern: '^[^.]+$' }),
    $source: Type.String(),
    fromBow: Type.Union([Type.Number(), Type.Null()]),
    fromCenter: Type.Union([Type.Number(), Type.Null()])
  },
  { additionalProperties: false }
)
const gnssSensorsSchema = Type.Array(gnssSensorSchema)
// Vessel reference point correction is opt-in: 'off' stores geometry only,
// 'replace' rewrites matching navigation.position deltas to the CCRP, 'both'
// publishes the corrected position under <sensorId>.ccrp alongside the
// untouched original.
const gnssCorrectionModeSchema = Type.Union([
  Type.Literal('off'),
  Type.Literal('replace'),
  Type.Literal('both')
])
const gnssConfigPayloadSchema = Type.Object(
  {
    correction: gnssCorrectionModeSchema,
    sensors: gnssSensorsSchema
  },
  { additionalProperties: false }
)

// Derived from the schemas so the compile-time types and runtime
// validation stay in lockstep (a schema edit is reflected in the type).
export type GnssSensorsPayload = Static<typeof gnssSensorsSchema>
export type GnssConfigPayload = Static<typeof gnssConfigPayloadSchema>

export function validateGnssConfigPayload(
  body: unknown
): { ok: true; value: GnssConfigPayload } | { ok: false; error: string } {
  if (!Value.Check(gnssConfigPayloadSchema, body)) {
    const first = Value.Errors(gnssConfigPayloadSchema, body).First()
    return {
      ok: false,
      error: first
        ? `Invalid gnssSensors payload at ${first.path}: ${first.message}`
        : 'Invalid gnssSensors payload'
    }
  }
  const value = body as GnssConfigPayload
  // Duplicate sensorIds would silently clobber sensors.gps.<id> entries
  // in the data model on PUT; reject before we mutate anything.
  const duplicate = findDuplicate(value.sensors)
  return duplicate ? { ok: false, error: duplicate } : { ok: true, value }
}

// Duplicate non-empty $source values would make the source→sensor mapping
// ambiguous, and a duplicate sensorId two rows indistinguishable.
function findDuplicate(
  sensors: ReadonlyArray<{ sensorId: string; $source: string }>
): string | null {
  const seenIds = new Set<string>()
  const seenSources = new Set<string>()
  for (const s of sensors) {
    if (seenIds.has(s.sensorId)) {
      return `Duplicate sensorId "${s.sensorId}"`
    }
    seenIds.add(s.sensorId)
    if (s.$source.length > 0) {
      if (seenSources.has(s.$source)) {
        return `Duplicate $source "${s.$source}"`
      }
      seenSources.add(s.$source)
    }
  }
  return null
}

// Reject offsets that would place an antenna outside the configured hull.
// Skipped silently when the relevant dimension is unset — the user might
// just not have filled in length/beam yet, and we'd rather let them save
// reasonable offsets than block on missing vessel metadata.
export function validateGnssSensorBounds(
  sensors: ReadonlyArray<
    Pick<GnssSensorsPayload[number], 'sensorId' | 'fromBow' | 'fromCenter'>
  >,
  lengthOverall: number | undefined,
  beam: number | undefined
): string | null {
  for (const s of sensors) {
    if (
      s.fromBow !== null &&
      lengthOverall !== undefined &&
      (s.fromBow < 0 || s.fromBow > lengthOverall)
    ) {
      return `fromBow ${s.fromBow} out of range 0..${lengthOverall} for sensor "${s.sensorId}"`
    }
    if (
      s.fromCenter !== null &&
      beam !== undefined &&
      Math.abs(s.fromCenter) > beam / 2
    ) {
      const half = beam / 2
      return `fromCenter ${s.fromCenter} out of range -${half}..${half} for sensor "${s.sensorId}"`
    }
  }
  return null
}

// Schema for the PUT .../sensors/depth body. One row per depth transducer,
// keyed by the $source that reports its depth. fromWaterline is the
// transducer's depth below the waterline, positive down, as in the
// sensors.<id>.fromWaterline proposal for the data model.
const depthSensorSchema = Type.Object(
  {
    sensorId: Type.String({ minLength: 1, pattern: '^[^.]+$' }),
    $source: Type.String(),
    fromBow: Type.Union([Type.Number(), Type.Null()]),
    fromCenter: Type.Union([Type.Number(), Type.Null()]),
    fromWaterline: Type.Union([Type.Number(), Type.Null()])
  },
  { additionalProperties: false }
)
const depthSensorsSchema = Type.Array(depthSensorSchema)
const depthConfigPayloadSchema = Type.Object(
  { sensors: depthSensorsSchema },
  { additionalProperties: false }
)

export type DepthSensorsPayload = Static<typeof depthSensorsSchema>
export type DepthConfigPayload = Static<typeof depthConfigPayloadSchema>

export function validateDepthConfigPayload(
  body: unknown
): { ok: true; value: DepthConfigPayload } | { ok: false; error: string } {
  if (!Value.Check(depthConfigPayloadSchema, body)) {
    const first = Value.Errors(depthConfigPayloadSchema, body).First()
    return {
      ok: false,
      error: first
        ? `Invalid depthSensors payload at ${first.path}: ${first.message}`
        : 'Invalid depthSensors payload'
    }
  }
  const value = body as DepthConfigPayload
  const duplicate = findDuplicate(value.sensors)
  return duplicate ? { ok: false, error: duplicate } : { ok: true, value }
}

// Reject positions outside the hull, and a transducer below the keel. The
// draft bound is skipped when no draft is set, like length and beam.
export function validateDepthSensorBounds(
  sensors: DepthSensorsPayload,
  lengthOverall: number | undefined,
  beam: number | undefined,
  draft: number | undefined
): string | null {
  const horizontal = validateGnssSensorBounds(sensors, lengthOverall, beam)
  if (horizontal) return horizontal
  for (const s of sensors) {
    if (s.fromWaterline === null) continue
    if (s.fromWaterline < 0) {
      return `fromWaterline ${s.fromWaterline} is above the waterline for sensor "${s.sensorId}"`
    }
    if (draft !== undefined && s.fromWaterline > draft) {
      return `fromWaterline ${s.fromWaterline} is below the draft ${draft} for sensor "${s.sensorId}"`
    }
  }
  return null
}
