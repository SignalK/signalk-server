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

/**
 * Extract a scalar query value; express repeats a key into an array.
 *
 * Returns undefined only when the parameter is genuinely absent. A present but
 * empty value is returned as the empty string so callers can reject it —
 * treating `?duration=` as omitted would quietly skip the window check rather
 * than telling the client its query was malformed. `readFlag` is the one place
 * an empty value legitimately means something.
 */
const first = (value: unknown): string | undefined => {
  const scalar = Array.isArray(value) ? (value as unknown[])[0] : value
  return typeof scalar === 'string' ? scalar : undefined
}

/** A present-but-blank value, which every parameter except a flag rejects. */
const blank = (value: string): boolean => value.trim() === ''

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
  let parsed: Temporal.Duration
  try {
    parsed = Temporal.Duration.from(value)
  } catch {
    // The seconds fallback has to be guarded too: Temporal refuses a total
    // above its safe range, so an absurd integer would throw out of the parser
    // and surface as a 500 for what is really a bad query string.
    if (/^\d+$/.test(value)) {
      try {
        parsed = Temporal.Duration.from({ seconds: Number(value) })
      } catch {
        errors.push(`${name} is out of range`)
        return undefined
      }
    } else {
      errors.push(
        `${name} must be an ISO 8601 duration string (e.g. 'PT15M') or an integer number of seconds`
      )
      return undefined
    }
  }
  // Temporal accepts a leading minus, and zero parses fine, but neither
  // describes a window or a spacing: a negative duration would ask for a range
  // ending before it starts, and a zero resolution would thin nothing.
  if (parsed.sign <= 0) {
    errors.push(`${name} must be a positive duration`)
    return undefined
  }
  return parsed
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

const MAX_LONGITUDE = 180
const MAX_LATITUDE = 90

/**
 * `west,south,east,north` — GeoJSON coordinate order, as the Resources API
 * uses. A west edge numerically greater than the east edge is a box crossing
 * the antimeridian, which is legal and left to the provider to interpret.
 */
const parseBbox = (
  value: string,
  errors: string[]
): TrackBoundingBox | undefined => {
  const raw = value.split(',')
  // Number('') is 0, not NaN, so a blank component would pass the finite check
  // and place an edge on the equator or the prime meridian rather than failing.
  if (raw.length !== 4 || raw.some((p) => p.trim() === '')) {
    errors.push(
      'bbox must be four comma-separated numbers: west,south,east,north'
    )
    return undefined
  }
  const parts = raw.map((p) => Number(p.trim()))
  if (parts.some((n) => !Number.isFinite(n))) {
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
  if ([west, east].some((n) => n < -MAX_LONGITUDE || n > MAX_LONGITUDE)) {
    errors.push('bbox longitudes must be between -180 and 180')
    return undefined
  }
  if ([south, north].some((n) => n < -MAX_LATITUDE || n > MAX_LATITUDE)) {
    errors.push('bbox latitudes must be between -90 and 90')
    return undefined
  }
  return [west, south, east, north]
}

/** A bare id is qualified with `vessels.`; other prefixes pass through. */
const qualifyContext = (value: string): Context =>
  (value.includes('.') ? value : `vessels.${value}`) as Context

/** A valueless parameter — `?times` — reads as true, as query strings spell flags. */
const TRUE_FLAGS = new Set(['true', '1', 'yes', ''])
const FALSE_FLAGS = new Set(['false', '0', 'no'])

const parseFlag = (
  value: string,
  name: string,
  errors: string[]
): boolean | undefined => {
  const flag = value.trim().toLowerCase()
  if (TRUE_FLAGS.has(flag)) {
    return true
  }
  if (FALSE_FLAGS.has(flag)) {
    return false
  }
  errors.push(`${name} must be true or false`)
  return undefined
}

/**
 * Read a boolean parameter, honouring the valueless form.
 *
 * `first()` returns undefined for an empty string, so presence has to be
 * tested on the raw query rather than on the extracted value; otherwise
 * `?simplify` would be silently ignored while `?simplify=true` worked.
 */
const readFlag = (
  query: Record<string, unknown>,
  name: string,
  errors: string[]
): boolean | undefined => {
  if (!Object.prototype.hasOwnProperty.call(query, name)) {
    return undefined
  }
  return parseFlag(first(query[name]) ?? '', name, errors)
}

export function parseTracksQuery(
  query: Record<string, unknown>
): ParsedTracksQuery {
  const errors: string[] = []
  const request: TracksRequest = {}

  const contexts = first(query.contexts) ?? first(query.context)
  if (contexts !== undefined && blank(contexts)) {
    errors.push('context must not be empty')
  } else if (contexts !== undefined) {
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
    if (blank(from)) {
      errors.push('from must not be empty')
    } else {
      request.from = parseInstant(from, 'from', errors)
    }
  }

  const to = first(query.to)
  if (to !== undefined) {
    if (blank(to)) {
      errors.push('to must not be empty')
    } else {
      request.to = parseInstant(to, 'to', errors)
    }
  }

  const duration = first(query.duration)
  if (duration !== undefined) {
    if (blank(duration)) {
      errors.push('duration must not be empty')
    } else {
      request.duration = parseDuration(duration, 'duration', errors)
    }
  }

  const bbox = first(query.bbox)
  if (bbox !== undefined) {
    if (blank(bbox)) {
      errors.push('bbox must not be empty')
    } else {
      request.bbox = parseBbox(bbox, errors)
    }
  }

  const resolution = first(query.resolution)
  if (resolution !== undefined) {
    if (blank(resolution)) {
      errors.push('resolution must not be empty')
    } else {
      request.resolution = parseDuration(resolution, 'resolution', errors)
    }
  }

  const maxPoints = first(query.maxPoints)
  if (maxPoints !== undefined) {
    // Decimal digits only. Number() would otherwise read hex (0x10 -> 16) and
    // exponential (1e3 -> 1000) forms, so a typo becomes a silently different
    // budget. The History API's duration parsing guards the same way.
    const n = /^\d+$/.test(maxPoints.trim()) ? Number(maxPoints.trim()) : NaN
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('maxPoints must be a positive integer')
    } else {
      request.maxPoints = n
    }
  }

  const epsilon = first(query.epsilon)
  if (epsilon !== undefined) {
    const n = blank(epsilon) ? NaN : Number(epsilon)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('epsilon must be a positive number of metres')
    } else {
      request.epsilon = n
      // epsilon is meaningless without simplification, so asking for one is
      // asking for the other.
      request.simplify = true
    }
  }

  const simplify = readFlag(query, 'simplify', errors)
  if (simplify !== undefined) {
    // epsilon sets simplify above, so an explicit simplify=false alongside it
    // is a contradiction. Rejecting beats silently honouring one of the two.
    if (simplify === false && request.epsilon !== undefined) {
      errors.push('simplify=false cannot be combined with epsilon')
    } else {
      request.simplify = simplify
    }
  }

  const times = readFlag(query, 'times', errors)
  if (times !== undefined) {
    request.times = times
  }

  const geometry = readFlag(query, 'geometry', errors)
  if (geometry !== undefined) {
    request.geometry = geometry
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
