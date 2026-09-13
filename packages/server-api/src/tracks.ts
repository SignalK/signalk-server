import { Temporal } from '@js-temporal/polyfill'
import { Context, Path } from './deltas'

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
   *
   * It selects tracks; it does not clip them. A matching track is returned
   * whole, including the stretches outside the box, so a client gets the
   * approach and the departure rather than a line that stops at an invisible
   * edge. Providers must agree on this or the same query returns different
   * geometry depending on which one answered.
   */
  bbox?: TrackBoundingBox

  /**
   * Minimum spacing between returned points.
   *
   * Normalised to hours and below before it reaches a provider, so
   * `total({ unit: 'milliseconds' })` is always safe on it —
   * `Temporal.Duration` refuses that for day-and-larger units without a
   * reference date, since their length is timezone-dependent. Windows here are
   * absolute, so `P1D` means 24h and arrives as `PT24H`. Years and months are
   * rejected: a month is 744h from January and 672h from February, so it does
   * not describe a spacing. So is anything below a millisecond, which is the
   * finest granularity a timestamp carries.
   */
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

  /**
   * Signal K paths to return alongside each position, as arrays nested to
   * match `coordinates` in the same way `coordTimes` is.
   *
   * A client colouring a track by speed, or deriving a route from a recorded
   * passage, otherwise has to query the History API for those paths and join
   * the two responses by timestamp — the row-alignment problem `coordTimes`
   * exists to remove, reintroduced one level down.
   *
   * Optional for a provider: one that cannot co-record other paths returns the
   * geometry alone and omits them from
   * {@link TrackProperties.appliedProperties}, so a client can tell what it
   * actually received rather than inferring it from absent data.
   *
   * Values are matched to the *nearest* sample of that path, not to one sharing
   * the position's timestamp. Paths arrive from different talkers on their own
   * cadences — position and speed over ground typically a couple of hundred
   * milliseconds apart — so an equality join returns null for every point while
   * `appliedProperties` still claims success. A provider that buckets should
   * match within a tolerance of its bucket width; a value that genuinely has no
   * nearby sample is null.
   */
  properties?: Path[]

  /** Include geometry. Defaults to true; set false to return metadata only. */
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
  /**
   * Identifies this track, and is what `GET` and `DELETE /tracks/{id}` address.
   *
   * Stable for as long as the track exists, and unique **within the provider
   * that holds it** — two providers may mint the same id for different tracks,
   * which is why the server resolves a track and then acts on the provider
   * that answered rather than on the default one. `?provider=` narrows the
   * search when a client knows where the track lives.
   *
   * A recorded track may derive it from the context; an imported one has
   * nothing to derive it from and gets an opaque id.
   */
  id: string

  /**
   * The Signal K context this track belongs to, when it has one.
   *
   * Absent for an imported track that names no vessel — a GPX a friend sent,
   * with no MMSI in it. Such a track is still a track: a recorded series of
   * positions, which is what this API serves. What it is not is a claim about
   * a vessel in the data model, so it carries no context rather than an
   * invented one.
   */
  context?: Context

  /**
   * Whether this is the own vessel's track.
   *
   * Absent along with `context`: a track that names no vessel cannot be the
   * own vessel's, and saying `false` would imply the question was asked of a
   * vessel that exists.
   */
  isSelf?: boolean

  /**
   * Which registered provider answered for this track.
   *
   * Set by the server from the registry, so a provider neither has to name
   * itself nor can name itself wrongly. Every registered provider is queried
   * and their features concatenated, so a vessel recorded by two of them
   * yields two features, and this is what tells them apart.
   */
  providerId?: string

  /**
   * Name of the vessel, aircraft or other context, when known.
   *
   * Not the name of the track — see `name` for that. A track recorded from
   * position data has no name of its own; an imported one usually does.
   */
  contextName?: string

  /**
   * The track's own name, when it has one.
   *
   * A GPX `<trk><name>` survives an import here. Recorded tracks have no name
   * until someone gives them one, which is why this is separate from
   * `contextName` rather than overloading it.
   */
  name?: string

  /**
   * Time of the first returned point.
   *
   * Absent for a track whose points carry no times — an imported GPX without
   * `<time>` is a shape someone sailed, with no recording times to report.
   * Present for everything a provider recorded itself.
   */
  from?: string

  /** Time of the last returned point, absent whenever `from` is. */
  to?: string

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

  /**
   * Which of the requested {@link TracksRequest.properties} the provider
   * actually returned.
   *
   * Reported rather than inferred, for the same reason `resolution` and
   * `epsilon` are: a client must be able to tell "this provider does not have
   * that path" from "that path had no values in this window".
   */
  appliedProperties?: Path[]

  /**
   * Values for each requested path, keyed by path and nested to match
   * `coordinates`: `values[path][i][j]` belongs with `coordinates[i][j]`.
   *
   * A position with no value for a path at that instant carries null rather
   * than being omitted, so the arrays stay aligned.
   */
  values?: Record<string, (number | string | null)[][]>
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

  /**
   * Returns one stored track by id, or undefined when no such track exists.
   *
   * Optional, like the writes. Every other way of finding a track filters by
   * something a track might not have — a time window needs times, a context
   * query needs a context — so a track imported with neither would be
   * unreachable without this.
   */
  getTrack?(id: string): Promise<TrackFeature | undefined>

  /**
   * Stores a track the client supplied, and returns it as stored.
   *
   * Optional: a provider that only records what it observes does not implement
   * this, and the server answers 501 rather than refusing its registration.
   *
   * The returned feature carries the `id` the provider assigned, which is what
   * a later `DELETE` addresses. A provider assigns the id rather than accepting
   * one, so two clients importing the same file cannot collide, and an import
   * can never overwrite a recorded track by naming its context.
   */
  storeTrack?(track: TrackImport): Promise<TrackFeature>

  /**
   * Deletes a stored track by id, resolving false when no such track exists.
   *
   * Optional, and independent of `storeTrack`: a provider may accept imports
   * without allowing recorded tracks to be deleted, or the reverse.
   */
  deleteTrack?(id: string): Promise<boolean>
}

/**
 * Thrown by {@link TrackApi.storeTrack} when the track itself is unacceptable
 * to that provider — an import carrying no `coordTimes` offered to a store
 * that only keeps timed tracks, say.
 *
 * Distinct from a store that failed: this says the client sent something this
 * provider will not keep, which is a 400 rather than a 500. A provider that
 * rejects for any other reason should throw an ordinary error.
 */
export class TrackRejectedError extends Error {
  /**
   * Marks the error across module boundaries.
   *
   * A plugin resolving `@signalk/server-api` gets its own copy of this class,
   * so `instanceof` against the server's copy fails and a deliberate refusal
   * would be reported as a store failure. The flag survives that.
   */
  readonly isTrackRejected = true as const

  constructor(message?: string) {
    super(message)
    this.name = 'TrackRejectedError'
  }
}

/** Whether a provider refused the track, whichever copy of the class it used. */
export function isTrackRejectedError(
  error: unknown
): error is { message: string } {
  if (error instanceof TrackRejectedError) {
    return true
  }
  // The message is part of what is proved, not assumed: a duck-typed refusal
  // without one would otherwise narrow to Error and answer 400 with an empty
  // body, telling the client nothing about what it sent.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isTrackRejected?: unknown }).isTrackRejected === true &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

/**
 * A track offered to a provider for storage.
 *
 * Geometry and times only, plus what the source said about it. Everything a
 * provider computes for itself — the bounding box, the point count, the time
 * range — is absent here, because a client cannot be trusted to have derived
 * it from the geometry it actually sent.
 *
 * @category Track API
 */
export interface TrackImport {
  /** `[longitude, latitude]` positions, per segment. */
  coordinates: [number, number][][]

  /**
   * Recording time of every point, nested to match `coordinates`.
   *
   * Optional because not every GPX carries `<time>`. A track without times is
   * still a track — a shape someone sailed — but it cannot answer a time
   * window query, and a provider may refuse it for that reason. A provider
   * that accepts one returns it with no `from` or `to`, which are optional
   * for exactly this case.
   */
  coordTimes?: string[][]

  /** The track's own name, typically a GPX `<trk><name>`. */
  name?: string

  /**
   * The vessel this track belongs to, when the client knows.
   *
   * Supplying it associates the import with a vessel in the data model; it
   * does not merge the import into that vessel's recorded track, which stays
   * separate and separately addressable.
   */
  context?: Context
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
