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

// An NMEA 2000 CAN Name is a 64-bit identifier rendered as 16 lowercase
// hex digits. Matching $source refs by CAN Name suffix lets a user
// rank a physical device once (e.g. "YDEN02.c0788c00e7e04312") and
// have it count whenever the same device is seen through a different
// transport (e.g. "canhat.c0788c00e7e04312" forwarded from a remote
// Signal K server). Shorter suffixes — NMEA 0183 talker IDs, N2K
// addresses like "43" — are not globally unique and stay exact-match.
const CAN_NAME_SUFFIX = /\.([0-9a-f]{16})$/

/**
 * Sentinel sourceRef that turns a path-level priority entry into a
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
  return m ? m[1]! : sourceRef
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

// Keys in PathPrecedences are identities — either a CAN Name (stripped
// of its providerId prefix) or the raw sourceRef when no CAN Name is
// present. This is what lets the priority list match the same physical
// N2K device regardless of which transport delivered it.
type PathPrecedences = Map<string, SourcePrecedenceData>
const toPrecedences = (sourcePrioritiesMap: {
  [path: string]: SourcePriority[]
}) =>
  Object.keys(sourcePrioritiesMap).reduce<Map<Path, PathPrecedences>>(
    (acc, path: string) => {
      const priorityIndices = sourcePrioritiesMap[path].reduce<PathPrecedences>(
        (acc2, { sourceRef, timeout }, i: number) => {
          acc2.set(sourceRefIdentity(sourceRef), {
            precedence: i,
            timeout
          })
          return acc2
        },
        new Map<string, SourcePrecedenceData>()
      )
      acc.set(path as Path, priorityIndices)
      return acc
    },
    new Map<Path, PathPrecedences>()
  )

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
  sourcePrioritiesData: SourcePrioritiesData,
  unknownSourceTimeout = 10000,
  canonicalise: CanonicaliseSourceRef = identityCanonicaliser
): ToPreferredDelta => {
  if (!sourcePrioritiesData || Object.keys(sourcePrioritiesData).length === 0) {
    debug('No priorities data')
    return (delta: any, _now: Date, _selfContext: string) => delta
  }
  // Paths with a single sentinel-source entry bypass priority filtering
  // entirely — every source's value is delivered unchanged. Used when
  // the user wants to compare or aggregate readings across sources
  // (e.g. satellitesInView from multiple GPSes) while still honouring
  // priorities on the rest of the group.
  const fanOutPaths = new Set<string>(
    Object.keys(sourcePrioritiesData).filter((p) =>
      isFanOutPriorities(sourcePrioritiesData[p])
    )
  )
  const precedences = toPrecedences(sourcePrioritiesData)

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

  const getPrecedence = (
    path: Path,
    sourceRef: SourceRef,
    isLatest: boolean
  ): SourcePrecedenceData => {
    const pathPrecedences = precedences.get(path)
    if (!pathPrecedences) {
      // No config for this path — accept everything
      return HIGHESTPRECEDENCE
    }
    const p = pathPrecedences.get(sourceRefIdentity(canonicalise(sourceRef)))
    if (p) return p
    return isLatest ? HIGHESTPRECEDENCE : LOWESTPRECEDENCE
  }

  const isKnownSource = (path: Path, sourceRef: SourceRef): boolean => {
    return (
      precedences.get(path)?.has(sourceRefIdentity(canonicalise(sourceRef))) ??
      false
    )
  }

  const isPreferredValue = (
    path: Path,
    latest: TimestampedSource,
    sourceRef: SourceRef,
    millis: number
  ) => {
    const pathPrecedences = precedences.get(path)

    // No path-level config → accept all
    if (!pathPrecedences) {
      return true
    }

    const latestPrecedence = getPrecedence(path, latest.sourceRef, true)
    const incomingPrecedence = getPrecedence(path, sourceRef, false)

    // Negative timeout means the source is disabled — always reject
    if (incomingPrecedence.timeout < 0) {
      return false
    }

    const latestKnown = isKnownSource(path, latest.sourceRef)
    const incomingKnown = isKnownSource(path, sourceRef)

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
                const latest = getLatest(
                  delta.context as Context,
                  pathValue.path as Path
                )
                const isPreferred = isPreferredValue(
                  pathValue.path as Path,
                  latest,
                  canonicalSource,
                  millis
                )
                if (isPreferred) {
                  setLatest(
                    delta.context as Context,
                    pathValue.path as Path,
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
