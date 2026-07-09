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
  // in the data model on PUT; reject before we mutate anything. Duplicate
  // non-empty $source values would create an ambiguous source→sensor mapping.
  const seenIds = new Set<string>()
  const seenSources = new Set<string>()
  for (const s of value.sensors) {
    if (seenIds.has(s.sensorId)) {
      return { ok: false, error: `Duplicate sensorId "${s.sensorId}"` }
    }
    seenIds.add(s.sensorId)
    if (s.$source.length > 0) {
      if (seenSources.has(s.$source)) {
        return { ok: false, error: `Duplicate $source "${s.$source}"` }
      }
      seenSources.add(s.$source)
    }
  }
  return { ok: true, value }
}

// Reject offsets that would place an antenna outside the configured hull.
// Skipped silently when the relevant dimension is unset — the user might
// just not have filled in length/beam yet, and we'd rather let them save
// reasonable offsets than block on missing vessel metadata.
export function validateGnssSensorBounds(
  sensors: GnssSensorsPayload,
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
