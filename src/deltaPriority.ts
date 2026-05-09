/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Path, SourceRef } from '@signalk/server-api'
import { createDebug } from './debug'
const debug = createDebug('signalk-server:sourcepriorities')

interface SourcePriority {
  sourceRef: SourceRef
  timeout: number
}

export interface SourcePrioritiesData {
  [path: string]: SourcePriority[]
}

export interface PriorityGroupConfig {
  id: string
  sources: string[]
  inactive?: boolean
}

export interface PriorityResolutionConfig {
  groups?: PriorityGroupConfig[]
  overrides?: SourcePrioritiesData
  fallbackMs?: number
  unknownSourceTimeout?: number
  canonicalise?: CanonicaliseSourceRef
  /**
   * Optional initial state for the per-path "publishers seen" map and
   * the per-path "claimed-by-group" map. Used at engine init to
   * recover the routing state across server restarts: walking the
   * already-loaded delta cache surfaces every publisher that has
   * historically emitted each path, which lets routesPath flip on
   * immediately for paths that already have ≥2 publishers — instead
   * of the admin UI flashing a "no priority configured" warning for
   * a few seconds while the engine waits for live deltas to arrive.
   * Each ref must already be in canonical (canName) form; the engine
   * does not re-canonicalise the seed.
   */
  seenPublishersByPath?: Record<string, string[]>
}

// An NMEA 2000 CAN Name is a 64-bit identifier rendered as 16 hex
// digits. Matching $source refs by CAN Name suffix lets a user
// rank a physical device once (e.g. "YDEN02.c0788c00e7e04312") and
// have it count whenever the same device is seen through a different
// transport (e.g. "canhat.c0788c00e7e04312" forwarded from a remote
// Signal K server). Hex digits are case-insensitive so a hand-edited
// or imported priorities.json carrying uppercase letters still
// matches the lowercase form our pipeline emits. Shorter suffixes —
// NMEA 0183 talker IDs, N2K addresses like "43" — are not globally
// unique and stay exact-match.
const CAN_NAME_SUFFIX = /\.([0-9a-fA-F]{16})$/

/**
 * Sentinel sourceRef that turns a path-level override into a
 * "fan out" rule: every source's value is delivered unchanged for that
 * path, regardless of ranking. Stored in priorities.json as a single
 * entry of the form `[{ sourceRef: '*', timeout: 0 }]` so older code
 * paths see a sourceRef that doesn't match any real device and fall
 * through their existing "no match" branches without crashing.
 */
export const FANOUT_SOURCEREF = '*'

export function isFanOutPriorities(
  entries: SourcePriority[] | undefined
): boolean {
  return (
    Array.isArray(entries) &&
    entries.length === 1 &&
    entries[0]?.sourceRef === (FANOUT_SOURCEREF as SourceRef)
  )
}

/**
 * An override is dormant when every one of its ranked sources belongs
 * to a group that the user has marked inactive. The principle: an
 * override only filters if at least one of its sources can win, and a
 * source from an inactive group is treated as ineligible. Sources that
 * belong to no group, or to an active one, keep the override alive.
 *
 * Used by both the server engine (to bypass dormant overrides during
 * delta routing) and by the admin-UI (to render dormant overrides as
 * visually disabled and exclude them from the attention-count badge),
 * so the truth derived from `(overrides, groups)` stays consistent on
 * both sides without an explicit flag being pushed across the wire.
 *
 * The fan-out sentinel never goes dormant — it has no real source to
 * map onto a group.
 */
export function isOverrideDormantUnderGroups(
  override: SourcePriority[] | undefined,
  groups: PriorityGroupConfig[] | undefined
): boolean {
  if (!Array.isArray(override) || override.length === 0) return false
  if (isFanOutPriorities(override)) return false
  if (!Array.isArray(groups) || groups.length === 0) return false
  // Build a quick lookup of source-identity → "the group that owns it
  // is inactive". Active groups (or "no group at all") leave the
  // identity off the map and keep the override eligible.
  const inactiveSourceIdentities = new Set<string>()
  const allClaimedIdentities = new Set<string>()
  for (const g of groups) {
    if (!Array.isArray(g?.sources)) continue
    for (const s of g.sources) {
      const id = sourceRefIdentity(s)
      allClaimedIdentities.add(id)
      if (g.inactive) {
        inactiveSourceIdentities.add(id)
      } else {
        // An active group's claim wins on overlap — drop any prior
        // inactive claim for the same identity. Mirrors the
        // first-active-wins rule the engine enforces elsewhere.
        inactiveSourceIdentities.delete(id)
      }
    }
  }
  for (const entry of override) {
    if (!entry?.sourceRef) continue
    const id = sourceRefIdentity(entry.sourceRef)
    // Source belongs to no group at all → keeps the override alive.
    if (!allClaimedIdentities.has(id)) return false
    // Source belongs to an active group → keeps it alive.
    if (!inactiveSourceIdentities.has(id)) return false
  }
  return true
}

/**
 * Device identity for transport-agnostic matching. Returns the CAN Name
 * if the sourceRef encodes one; otherwise the sourceRef itself is
 * returned so exact-match semantics are preserved for non-N2K sources.
 */
export function sourceRefIdentity(sourceRef: string): string {
  const m = CAN_NAME_SUFFIX.exec(sourceRef)
  // Normalise to lowercase: the canonical wire format is lowercase
  // (Uint64LE().toString(16)) but a hand-edited priorities.json may
  // carry uppercase letters. Without lowercasing, identity comparison
  // would silently fail to match the same device.
  return m ? m[1]!.toLowerCase() : sourceRef
}

interface PathValue {
  path: string
  value: any
}

interface TimestampedSource {
  timestamp: number
  sourceRef: SourceRef
}

interface SourcePrecedenceData {
  precedence: number
  timeout: number
}

type PathLatestTimestamps = Map<Path, TimestampedSource>

// Keys are identities — either a CAN Name (stripped of its providerId
// prefix) or the raw sourceRef when no CAN Name is present. This is
// what lets the priority list match the same physical N2K device
// regardless of which transport delivered it.
type SourcePrecedences = Map<string, SourcePrecedenceData>

const DEFAULT_FALLBACK_MS = 15000

const buildOverridePrecedences = (
  overrides: SourcePrioritiesData
): Map<Path, SourcePrecedences> => {
  const out = new Map<Path, SourcePrecedences>()
  for (const path of Object.keys(overrides)) {
    const entries = overrides[path]
    const precedences: SourcePrecedences = new Map()
    entries.forEach(({ sourceRef, timeout }, i) => {
      precedences.set(sourceRefIdentity(sourceRef), {
        precedence: i,
        timeout
      })
    })
    out.set(path as Path, precedences)
  }
  return out
}

const buildGroupPrecedences = (
  groups: PriorityGroupConfig[],
  fallbackMs: number
): {
  sourceToGroupId: Map<string, string>
  groupPrecedences: Map<string, SourcePrecedences>
} => {
  const sourceToGroupId = new Map<string, string>()
  const groupPrecedences = new Map<string, SourcePrecedences>()
  for (const group of groups) {
    if (group.inactive) continue
    const precedences: SourcePrecedences = new Map()
    group.sources.forEach((sourceRef, i) => {
      const identity = sourceRefIdentity(sourceRef)
      // First group wins on overlap. The PUT validator on the server
      // and the connected-component derivation on the client both
      // prevent a source from belonging to two groups; this is a
      // defence against a hand-edited priorities.json.
      if (!sourceToGroupId.has(identity)) {
        sourceToGroupId.set(identity, group.id)
      }
      precedences.set(identity, {
        precedence: i,
        timeout: i === 0 ? 0 : fallbackMs
      })
    })
    groupPrecedences.set(group.id, precedences)
  }
  return { sourceToGroupId, groupPrecedences }
}

export type ToPreferredDelta = ((
  delta: any,
  now: Date,
  selfContext: string
) => any) & {
  /**
   * Returns true when the engine actively filters this (path, sourceRef)
   * tuple — i.e. there is a non-dormant path-level override OR the
   * source belongs to an active group. Used by the deltacache to gate
   * `preferredSources` writes: a path the engine doesn't route should
   * not produce a "live preferred winner" entry, otherwise the admin-UI
   * Data Browser's Priority-filtered view would suppress the other
   * sources on a path that's actually pass-through.
   */
  routesPath: (path: string, sourceRef: string) => boolean
}

/**
 * Translate a raw `$source` (e.g. `can0.4`) into its canonical form
 * (e.g. `can0.c0788c00e7e04312`) so the engine can match it against
 * priorities saved in canName form. Implementations should return the
 * raw ref unchanged when no translation is known — that lets the
 * engine fall through to the existing "unknown source" rules and
 * keeps non-canName setups (legacy node-red flows) working as before.
 */
export type CanonicaliseSourceRef = (sourceRef: string) => string

const identityCanonicaliser: CanonicaliseSourceRef = (s) => s

export const getToPreferredDelta = (
  config: PriorityResolutionConfig = {}
): ToPreferredDelta => {
  const overrides = config.overrides ?? {}
  const groups = config.groups ?? []
  const fallbackMs = config.fallbackMs ?? DEFAULT_FALLBACK_MS
  const unknownSourceTimeout = config.unknownSourceTimeout ?? 10000
  const canonicalise = config.canonicalise ?? identityCanonicaliser

  const hasOverrides = Object.keys(overrides).length > 0
  const hasActiveGroups = groups.some((g) => !g.inactive)
  if (!hasOverrides && !hasActiveGroups) {
    debug('No priorities data')
    const passthrough = ((delta: any, _now: Date, _selfContext: string) =>
      delta) as ToPreferredDelta
    passthrough.routesPath = () => false
    return passthrough
  }

  // Drop overrides whose every ranked source belongs to a group the
  // user has marked inactive — the override is dormant in that case
  // and should not filter incoming deltas. Restoring the group flips
  // the override back on without the user having to re-author it.
  const activeOverrides: SourcePrioritiesData = {}
  for (const path of Object.keys(overrides)) {
    if (isOverrideDormantUnderGroups(overrides[path], groups)) continue
    activeOverrides[path] = overrides[path]
  }

  // Paths with a single sentinel-source entry bypass priority filtering
  // entirely — every source's value is delivered unchanged. Used when
  // the user wants to compare or aggregate readings across sources
  // (e.g. satellitesInView from multiple GPSes) while still honouring
  // priorities on the rest of the group.
  const fanOutPaths = new Set<string>(
    Object.keys(activeOverrides).filter((p) =>
      isFanOutPriorities(activeOverrides[p])
    )
  )
  const overridePrecedences = buildOverridePrecedences(activeOverrides)
  const { sourceToGroupId, groupPrecedences } = buildGroupPrecedences(
    groups,
    fallbackMs
  )

  // Tracks which group has "claimed" each path. A path is claimed the
  // first time a delta from any group source emits it. Once claimed,
  // every delta on that path — including from sources NOT in the group
  // (e.g. a derived-data plugin computing the same value) — resolves
  // against the claiming group's ranking. Without this, an
  // unconfigured source publishing a group-covered path would always
  // bypass priority filtering, defeating the user's saved ranking.
  const pathToGroupId = new Map<string, string>()
  // Per-path set of distinct publisher identities the engine has
  // seen. Used by routesPath to gate the "this path is contested"
  // signal on ≥2 publishers — single-publisher paths shouldn't
  // surface a "Preferred" badge in the admin UI even though the
  // engine internally claims the path for the group (the claim is
  // there to keep an unconfigured second publisher in line, not to
  // declare the engine has made a decision).
  const pathSeenPublishers = new Map<string, Set<string>>()
  // Seed from the caller's snapshot (typically derived from the
  // delta cache loaded from disk). Without this, every server
  // restart leaves routesPath returning false for every path until
  // a second publisher's first delta lands — which can take seconds
  // for slow PGNs and surfaces as a transient "no priority
  // configured" warning across the admin UI. Pre-claim every path
  // that already had ≥2 known publishers.
  const seed = config.seenPublishersByPath
  if (seed) {
    for (const path of Object.keys(seed)) {
      const refs = seed[path]
      if (!refs || refs.length === 0) continue
      const identities = new Set<string>()
      for (const ref of refs) {
        identities.add(sourceRefIdentity(canonicalise(ref)))
      }
      pathSeenPublishers.set(path, identities)
      if (identities.size >= 2) {
        // Find which group (if any) owns this path via one of its
        // sources, so routesPath flips on at boot.
        for (const id of identities) {
          const groupId = sourceToGroupId.get(id)
          if (groupId) {
            pathToGroupId.set(path, groupId)
            break
          }
        }
      }
    }
  }

  const contextPathTimestamps = new Map<Context, PathLatestTimestamps>()

  const setLatest = (
    context: Context,
    path: Path,
    sourceRef: SourceRef,
    millis: number
  ) => {
    let pathLatestTimestamps = contextPathTimestamps.get(context)
    if (!pathLatestTimestamps) {
      pathLatestTimestamps = new Map<Path, TimestampedSource>()
      contextPathTimestamps.set(context, pathLatestTimestamps)
    }
    pathLatestTimestamps.set(path, { sourceRef, timestamp: millis })
  }

  const getLatest = (context: Context, path: Path): TimestampedSource => {
    const pathLatestTimestamps = contextPathTimestamps.get(context)
    if (!pathLatestTimestamps) {
      return {
        sourceRef: '' as SourceRef,
        timestamp: 0
      }
    }
    const latestTimestamp = pathLatestTimestamps.get(path)
    if (!latestTimestamp) {
      return {
        sourceRef: '' as SourceRef,
        timestamp: 0
      }
    }
    return latestTimestamp
  }

  const HIGHESTPRECEDENCE = {
    precedence: 0,
    timeout: 0
  }

  const LOWESTPRECEDENCE = {
    precedence: Number.POSITIVE_INFINITY,
    timeout: unknownSourceTimeout
  }

  // Resolve which precedence map applies to (path, source).
  // Override on the path wins; otherwise the source's group ranking
  // applies AND the path is claimed by that group for any future
  // delta on the same path (from any source); otherwise the path's
  // existing claim — if any — applies; otherwise null → passthrough.
  //
  // Once a path is claimed by a group, an unconfigured source emitting
  // the same path is treated as an unknown source against the group's
  // precedences (LOWESTPRECEDENCE) and obeys the existing
  // configured-displaces-unknown rule. That stops a derived-data
  // plugin from oscillating the cache's preferred winner against the
  // group's actual rank-1 source.
  const resolvePrecedences = (
    path: Path,
    canonicalSource: SourceRef
  ): SourcePrecedences | null => {
    // Track distinct publishers per path. Used by routesPath to
    // suppress the Preferred badge for single-publisher paths.
    let publishers = pathSeenPublishers.get(path)
    if (!publishers) {
      publishers = new Set<string>()
      pathSeenPublishers.set(path, publishers)
    }
    publishers.add(sourceRefIdentity(canonicalSource))

    const override = overridePrecedences.get(path)
    if (override) return override
    const groupId = sourceToGroupId.get(sourceRefIdentity(canonicalSource))
    if (groupId) {
      // Claim this path for the source's group on first encounter.
      // Subsequent deltas on this path from sources NOT in the group
      // will fall through to the existing claim below.
      if (!pathToGroupId.has(path)) {
        pathToGroupId.set(path, groupId)
      }
      return groupPrecedences.get(groupId) ?? null
    }
    const claimedGroupId = pathToGroupId.get(path)
    if (claimedGroupId) {
      return groupPrecedences.get(claimedGroupId) ?? null
    }
    return null
  }

  const getPrecedence = (
    pathPrecedences: SourcePrecedences,
    sourceRef: SourceRef,
    isLatest: boolean
  ): SourcePrecedenceData => {
    const p = pathPrecedences.get(sourceRefIdentity(canonicalise(sourceRef)))
    if (p) return p
    return isLatest ? HIGHESTPRECEDENCE : LOWESTPRECEDENCE
  }

  const isKnownSource = (
    pathPrecedences: SourcePrecedences,
    sourceRef: SourceRef
  ): boolean => {
    return pathPrecedences.has(sourceRefIdentity(canonicalise(sourceRef)))
  }

  const isPreferredValue = (
    pathPrecedences: SourcePrecedences,
    path: Path,
    latest: TimestampedSource,
    sourceRef: SourceRef,
    millis: number
  ) => {
    const latestPrecedence = getPrecedence(
      pathPrecedences,
      latest.sourceRef,
      true
    )
    const incomingPrecedence = getPrecedence(pathPrecedences, sourceRef, false)

    // Negative timeout means the source is disabled — always reject
    if (incomingPrecedence.timeout < 0) {
      return false
    }

    const latestKnown = isKnownSource(pathPrecedences, latest.sourceRef)
    const incomingKnown = isKnownSource(pathPrecedences, sourceRef)

    // A configured source must always outrank an unconfigured one:
    // if the user ranked source X for this path, X should displace
    // any unranked competitor that happens to be publishing the same
    // path — otherwise the unknown incumbent keeps its HIGHESTPRECEDENCE
    // and the ranked source (with precedence >= 0) can never take over.
    if (incomingKnown && !latestKnown) {
      return true
    }

    // A source updating its own value is always accepted — but only if
    // the currently-latest source is actually configured. Otherwise an
    // unknown source that briefly won (e.g. because the configured
    // source was momentarily silent) would self-renew forever and
    // permanently shadow the configured preference.
    if (latest.sourceRef === sourceRef && (latestKnown || !incomingKnown)) {
      return true
    }

    const latestIsFromHigherPrecedence =
      latestPrecedence.precedence < incomingPrecedence.precedence

    // Baseline: the incoming (lower-ranked) source's timeout governs —
    // that is how path-level priority lists express "b may take over
    // after 5s of a-silence".
    //
    // Additional constraint when a known source is winning and an
    // unknown source tries to take over: the unknown source must also
    // outwait the winner's own timeout. Otherwise a configured source
    // with a long timeout can still be stolen after just
    // unknownSourceTimeout by any random source that publishes the
    // same path.
    const holdTimeout =
      latestKnown && !incomingKnown
        ? Math.max(latestPrecedence.timeout, incomingPrecedence.timeout)
        : incomingPrecedence.timeout

    const isPreferred =
      !latestIsFromHigherPrecedence || millis - latest.timestamp > holdTimeout
    if (debug.enabled) {
      debug(`${path}:${sourceRef}:${isPreferred}:${millis - latest.timestamp}`)
    }
    return isPreferred
  }

  // Mirror of the per-delta resolvePrecedences gate, exposed so the
  // deltacache can decide whether a given (path, sourceRef) tuple is
  // routed by the engine — i.e. whether updating preferredSources for
  // it would mean anything to the admin UI's Priority-filtered view.
  // Pass-through paths return false so onValue skips the write and
  // the UI renders every source's row without a Preferred badge.
  //
  // The check is path-driven, NOT source-driven, AND requires ≥2
  // publishers seen on the path. A saved group's ranking applies to
  // the group's path list, not to every path the group's sources
  // happen to publish; a single-publisher path has no contention to
  // resolve, so tagging the lone source as "Preferred" would imply a
  // decision the engine never made. The 2-publisher gate filters
  // those out — the engine still tracks the path internally so a
  // late-arriving second publisher gets correctly demoted.
  const routesPath = (path: string, _sourceRef: string): boolean => {
    if (overridePrecedences.has(path as Path)) return true
    if (!pathToGroupId.has(path as Path)) return false
    const publishers = pathSeenPublishers.get(path)
    return !!publishers && publishers.size >= 2
  }

  const fn = ((delta: any, now: Date, selfContext: string) => {
    if (delta.context === selfContext) {
      const millis = now.getTime()
      delta.updates &&
        delta.updates.forEach((update: any) => {
          if ('values' in update) {
            // Translate the source once per update so identity matching,
            // self-renew (`latest.sourceRef === sourceRef`), and the
            // setLatest snapshot all key off the same canonical form.
            // Without this, a saved canName-form ranking never matches
            // a numeric-form delta and the engine silently ignores the
            // user's preference.
            const canonicalSource = canonicalise(update.$source) as SourceRef
            update.values = update.values.reduce(
              (acc: any, pathValue: PathValue) => {
                // Notifications are events, not measurements — never subject
                // to source priority. Every source's notifications are
                // delivered unchanged.
                const p = pathValue.path as string
                if (p === 'notifications' || p.startsWith('notifications.')) {
                  acc.push(pathValue)
                  return acc
                }
                // Fan-out path: user explicitly wants every source's
                // value delivered (e.g. satellitesInView aggregated
                // from multiple GPSes). Bypass identity matching.
                if (fanOutPaths.has(p)) {
                  acc.push(pathValue)
                  return acc
                }
                const path = pathValue.path as Path
                const pathPrecedences = resolvePrecedences(
                  path,
                  canonicalSource
                )
                if (!pathPrecedences) {
                  // No override and source not in any active group → passthrough.
                  acc.push(pathValue)
                  return acc
                }
                const latest = getLatest(delta.context as Context, path)
                const isPreferred = isPreferredValue(
                  pathPrecedences,
                  path,
                  latest,
                  canonicalSource,
                  millis
                )
                if (isPreferred) {
                  setLatest(
                    delta.context as Context,
                    path,
                    canonicalSource,
                    millis
                  )
                  acc.push(pathValue)
                  return acc
                }
                return acc
              },
              []
            )
          }
        })
    }
    return delta
  }) as ToPreferredDelta
  fn.routesPath = routesPath
  return fn
}
