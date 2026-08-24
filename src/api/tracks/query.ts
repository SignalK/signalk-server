import { Temporal } from '@js-temporal/polyfill'
import { Context } from '@signalk/server-api'
import { TrackBoundingBox, TracksRequest } from '@signalk/server-api/tracks'

/**
 * Query parsing for the Track API.
 *
 * Kept separate from the HTTP registry so the rules are testable without
 * standing up express or a provider.
 */

export interface ParsedTracksQuery {
  request: TracksRequest
  errors: string[]
}

const first = (value: unknown): string | undefined => {
  const scalar = Array.isArray(value) ? (value as unknown[])[0] : value
  return typeof scalar === 'string' && scalar.trim() !== '' ? scalar : undefined
}

/**
 * ISO 8601 duration, or a bare integer read as seconds.
 *
 * The integer form is not in the spec but the History API accepts it, and a
 * client that has learned History's behaviour will reasonably expect the same
 * here.
 */
const parseDuration = (
  value: string,
  name: string,
  errors: string[]
): Temporal.Duration | undefined => {
  try {
    return Temporal.Duration.from(value)
  } catch {
    if (/^\d+$/.test(value)) {
      return Temporal.Duration.from({ seconds: Number(value) })
    }
    errors.push(
      `${name} must be an ISO 8601 duration string (e.g. 'PT15M') or an integer number of seconds`
    )
    return undefined
  }
}

const parseInstant = (
  value: string,
  name: string,
  errors: string[]
): Temporal.Instant | undefined => {
  try {
    return Temporal.Instant.from(value)
  } catch {
    errors.push(`${name} must be a valid ISO 8601 timestamp`)
    return undefined
  }
}

/**
 * `west,south,east,north` — GeoJSON coordinate order, as the Resources API
 * uses. A west edge numerically greater than the east edge is a box crossing
 * the antimeridian, which is legal and left to the provider to interpret.
 */
const parseBbox = (
  value: string,
  errors: string[]
): TrackBoundingBox | undefined => {
  const parts = value.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    errors.push(
      'bbox must be four comma-separated numbers: west,south,east,north'
    )
    return undefined
  }
  const [west, south, east, north] = parts as [number, number, number, number]
  if (south > north) {
    errors.push(
      `bbox south (${south}) must not be greater than north (${north})`
    )
    return undefined
  }
  if ([west, east].some((n) => n < -180 || n > 180)) {
    errors.push('bbox longitudes must be between -180 and 180')
    return undefined
  }
  if ([south, north].some((n) => n < -90 || n > 90)) {
    errors.push('bbox latitudes must be between -90 and 90')
    return undefined
  }
  return [west, south, east, north]
}

/** A bare id is qualified with `vessels.`; other prefixes pass through. */
const qualifyContext = (value: string): Context =>
  (value.includes('.') ? value : `vessels.${value}`) as Context

const parseFlag = (
  value: string,
  name: string,
  errors: string[]
): boolean | undefined => {
  const flag = value.trim().toLowerCase()
  if (['true', '1', 'yes', ''].includes(flag)) {
    return true
  }
  if (['false', '0', 'no'].includes(flag)) {
    return false
  }
  errors.push(`${name} must be true or false`)
  return undefined
}

export function parseTracksQuery(
  query: Record<string, unknown>
): ParsedTracksQuery {
  const errors: string[] = []
  const request: TracksRequest = {}

  const contexts = first(query.contexts) ?? first(query.context)
  if (contexts !== undefined) {
    request.contexts = contexts
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c !== '')
      .map(qualifyContext)
    if (request.contexts.length === 0) {
      errors.push('context must not be empty')
    }
  }

  const from = first(query.from)
  if (from !== undefined) {
    request.from = parseInstant(from, 'from', errors)
  }

  const to = first(query.to)
  if (to !== undefined) {
    request.to = parseInstant(to, 'to', errors)
  }

  const duration = first(query.duration)
  if (duration !== undefined) {
    request.duration = parseDuration(duration, 'duration', errors)
  }

  const bbox = first(query.bbox)
  if (bbox !== undefined) {
    request.bbox = parseBbox(bbox, errors)
  }

  const resolution = first(query.resolution)
  if (resolution !== undefined) {
    request.resolution = parseDuration(resolution, 'resolution', errors)
  }

  const maxPoints = first(query.maxPoints)
  if (maxPoints !== undefined) {
    const n = Number(maxPoints)
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('maxPoints must be a positive integer')
    } else {
      request.maxPoints = n
    }
  }

  const epsilon = first(query.epsilon)
  if (epsilon !== undefined) {
    const n = Number(epsilon)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('epsilon must be a positive number of metres')
    } else {
      request.epsilon = n
      // epsilon is meaningless without simplification, so asking for one is
      // asking for the other.
      request.simplify = true
    }
  }

  const simplify = first(query.simplify)
  if (simplify !== undefined) {
    const flag = parseFlag(simplify, 'simplify', errors)
    if (flag !== undefined) {
      request.simplify = flag
    }
  }

  const times = first(query.times)
  if (
    times !== undefined ||
    Object.prototype.hasOwnProperty.call(query, 'times')
  ) {
    const flag = parseFlag(times ?? '', 'times', errors)
    if (flag !== undefined) {
      request.times = flag
    }
  }

  const geometry = first(query.geometry)
  if (geometry !== undefined) {
    const flag = parseFlag(geometry, 'geometry', errors)
    if (flag !== undefined) {
      request.geometry = flag
    }
  }

  if (
    request.from &&
    request.to &&
    Temporal.Instant.compare(request.from, request.to) >= 0
  ) {
    errors.push('from must be before to')
  }

  // An unbounded query is allowed for a single context — "my whole track since
  // I started recording" is the point of keeping own-vessel data forever — but
  // not across every context the server has ever seen, which on a busy coast
  // is years of data for hundreds of vessels.
  const bounded = request.from !== undefined || request.duration !== undefined
  const singleContext = request.contexts?.length === 1
  if (!bounded && !singleContext) {
    errors.push(
      'a time window (from or duration) is required unless a single context is given'
    )
  }

  return { request, errors }
}
