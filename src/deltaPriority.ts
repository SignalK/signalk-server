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

export type ToPreferredDelta = (
  delta: any,
  now: Date,
  selfContext: string
) => any

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
    return (delta: any, _now: Date, _selfContext: string) => delta
  }

  // Paths with a single sentinel-source entry bypass priority filtering
  // entirely — every source's value is delivered unchanged. Used when
  // the user wants to compare or aggregate readings across sources
  // (e.g. satellitesInView from multiple GPSes) while still honouring
  // priorities on the rest of the group.
  const fanOutPaths = new Set<string>(
    Object.keys(overrides).filter((p) => isFanOutPriorities(overrides[p]))
  )
  const overridePrecedences = buildOverridePrecedences(overrides)
  const { sourceToGroupId, groupPrecedences } = buildGroupPrecedences(
    groups,
    fallbackMs
  )

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
  // applies; otherwise null → no config, accept all.
  const resolvePrecedences = (
    path: Path,
    canonicalSource: SourceRef
  ): SourcePrecedences | null => {
    const override = overridePrecedences.get(path)
    if (override) return override
    const groupId = sourceToGroupId.get(sourceRefIdentity(canonicalSource))
    if (!groupId) return null
    return groupPrecedences.get(groupId) ?? null
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

  return (delta: any, now: Date, selfContext: string) => {
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
  }
}
