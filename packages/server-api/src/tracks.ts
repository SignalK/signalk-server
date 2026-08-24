import { Temporal } from '@js-temporal/polyfill'
import { Context } from './deltas'

/**
 * Track API — recorded vessel positions over time.
 *
 * A track is what a vessel *did*: a recorded, time-ordered series of positions,
 * queried by time window and optionally by area. That makes it different from
 * `resources/routes`, which is what someone *intends*, authored and named, and
 * from the History API, which answers questions about arbitrary paths rather
 * than about where vessels have been.
 *
 * Discussed in https://github.com/SignalK/signalk-server/issues/2504
 *
 * @category Track API
 */

/**
 * Bounding box as `[west, south, east, north]` — GeoJSON coordinate order,
 * matching the Resources API.
 *
 * A box whose west edge is numerically greater than its east edge crosses the
 * antimeridian and is read the short way round, so `[175, -10, -175, 10]` is a
 * box near Fiji rather than a band across the rest of the globe.
 *
 * @category Track API
 */
export type TrackBoundingBox = [number, number, number, number]

/** @category Track API */
export interface TracksRequest {
  /**
   * Contexts to return tracks for. Defaults to the own vessel when neither
   * `contexts` nor a bounding box is given.
   *
   * A bare id is qualified with `vessels.`; other prefixes are accepted so that
   * aircraft — SAR aircraft appear in AIS — can be queried too.
   */
  contexts?: Context[]

  /** Start of the window. */
  from?: Temporal.Instant

  /** End of the window. Defaults to now when `from` or `duration` is given. */
  to?: Temporal.Instant

  /** Window ending at `to`, as an alternative to giving `from`. */
  duration?: Temporal.Duration

  /**
   * Only return tracks that pass through this box within the window.
   *
   * Intersection, not containment, and not "where the vessel is now": a vessel
   * that crossed the box an hour ago and has since left still matches.
   */
  bbox?: TrackBoundingBox

  /** Minimum spacing between returned points. */
  resolution?: Temporal.Duration

  /**
   * Upper bound on the number of points returned per track.
   *
   * A budget rather than a fidelity contract, for clients that must bound
   * transfer and rendering cost regardless of how convoluted a track is.
   */
  maxPoints?: number

  /**
   * Simplify the geometry, dropping points that do not change the line's shape
   * beyond `epsilon`.
   *
   * With a bounding box and no explicit `epsilon`, an implementation should
   * choose a tolerance suited to the size of the box.
   */
  simplify?: boolean

  /** Douglas-Peucker tolerance in metres. Implies `simplify`. */
  epsilon?: number

  /** Include the recording time of each point as `properties.coordTimes`. */
  times?: boolean

  /** Return metadata only, omitting geometry. */
  geometry?: boolean
}

/**
 * Per-track metadata.
 *
 * The time range, point count and resolution describe what was *returned*
 * rather than what was asked for, so a client can always tell whether it
 * received a simplified track and ask again for more detail.
 *
 * @category Track API
 */
export interface TrackProperties {
  /** The Signal K context this track belongs to. */
  context: Context

  /** Whether this is the own vessel's track. */
  isSelf: boolean

  /**
   * Name of the vessel, aircraft or other context, when known.
   *
   * Not the name of the track: a track recorded from position data has no name
   * of its own. Named tracks are `resources/tracks`.
   */
  contextName?: string

  /** Time of the first returned point. */
  from: string

  /** Time of the last returned point. */
  to: string

  /** Bounding box of the returned geometry, `[west, south, east, north]`. */
  bbox?: TrackBoundingBox

  /** Number of points returned across all segments. */
  pointCount: number

  /** Spacing actually applied, as an ISO 8601 duration. */
  resolution?: string

  /** Simplification tolerance actually applied, in metres. */
  epsilon?: number

  /**
   * Recording time of every point, ISO 8601 UTC, nested to match
   * `geometry.coordinates`: `coordTimes[i][j]` is when `coordinates[i][j]` was
   * recorded.
   *
   * Follows the `coordTimes` convention used by GPX-to-GeoJSON converters,
   * which RFC 7946 permits as a foreign member of `properties`. The nesting for
   * MultiLineString is specified here because the convention only covers
   * LineString.
   */
  coordTimes?: string[][]
}

/**
 * One vessel's track as a GeoJSON Feature.
 *
 * MultiLineString rather than LineString: a gap in recording — an overnight
 * stop, a receiver out of range — starts a new segment, so the line is not
 * drawn across a stretch the vessel did not travel.
 *
 * @category Track API
 */
export interface TrackFeature {
  type: 'Feature'
  geometry: {
    type: 'MultiLineString'
    /** `[longitude, latitude]` positions, per segment. */
    coordinates: [number, number][][]
  } | null
  properties: TrackProperties
}

/** @category Track API */
export interface TracksResponse {
  type: 'FeatureCollection'
  features: TrackFeature[]
}

/**
 * Provider interface for the Track API.
 *
 * Plugins that record positions implement this and register it via
 * {@link TrackProviderRegistry.registerTrackApiProvider}. How and where the
 * positions are stored is entirely the provider's business.
 *
 * @category Track API
 */
export interface TrackApi {
  /**
   * Returns tracks matching the query.
   *
   * Implementations should return the full time range requested. Where the
   * result would be too large, reduce the number of points and report what was
   * applied in {@link TrackProperties.resolution} or
   * {@link TrackProperties.epsilon} — never silently narrow the time range,
   * since a long voyage viewed at low zoom is a legitimate query.
   */
  getTracks(query: TracksRequest): Promise<TracksResponse>

  /**
   * Lists contexts that have track data within the window, without returning
   * geometry.
   */
  getTrackContexts(query: TracksRequest): Promise<Context[]>
}

/** @category Track API */
export type TrackProvider = TrackApi

/** @category Track API */
export type TrackProviderRegistry = {
  registerTrackApiProvider(provider: TrackProvider): void
  unregisterTrackApiProvider(): void
}

/** @category Track API */
export type WithTrackApi = {
  /**
   * Returns a promise for a Track API implementation, or rejects if none is
   * available. Optional so that plugins can support older servers.
   *
   * @param providerId - Optional id of a specific track provider plugin. If omitted, returns the default provider.
   */
  getTrackApi?: (providerId?: string) => Promise<TrackApi>
}

/** @category Track API */
export type TrackProviders = {
  [providerId: string]: { isDefault: boolean }
}

export function isTrackProvider(obj: unknown): obj is TrackProvider {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  return (
    typeof (obj as TrackProvider).getTracks === 'function' &&
    typeof (obj as TrackProvider).getTrackContexts === 'function'
  )
}
