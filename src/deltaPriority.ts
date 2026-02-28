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

export interface SourceRankingEntry {
  sourceRef: SourceRef
  timeout: number
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

type PathPrecedences = Map<SourceRef, SourcePrecedenceData>
const toPrecedences = (sourcePrioritiesMap: {
  [path: string]: SourcePriority[]
}) =>
  Object.keys(sourcePrioritiesMap).reduce<Map<Path, PathPrecedences>>(
    (acc, path: string) => {
      const priorityIndices = sourcePrioritiesMap[path].reduce<PathPrecedences>(
        (acc2, { sourceRef, timeout }, i: number) => {
          acc2.set(sourceRef, {
            precedence: i,
            timeout
          })
          return acc2
        },
        new Map<SourceRef, SourcePrecedenceData>()
      )
      acc.set(path as Path, priorityIndices)
      return acc
    },
    new Map<Path, PathPrecedences>()
  )

const toRankingPrecedences = (
  ranking: SourceRankingEntry[]
): Map<SourceRef, SourcePrecedenceData> =>
  ranking.reduce<Map<SourceRef, SourcePrecedenceData>>(
    (acc, { sourceRef, timeout }, i) => {
      acc.set(sourceRef, { precedence: i, timeout })
      return acc
    },
    new Map<SourceRef, SourcePrecedenceData>()
  )

export type ToPreferredDelta = (
  delta: any,
  now: Date,
  selfContext: string
) => any

export const getToPreferredDelta = (
  sourcePrioritiesData: SourcePrioritiesData,
  sourceRanking?: SourceRankingEntry[],
  unknownSourceTimeout = 120000
): ToPreferredDelta => {
  if (!sourcePrioritiesData && (!sourceRanking || sourceRanking.length === 0)) {
    debug('No priorities data and no source ranking')
    return (delta: any, _now: Date, _selfContext: string) => delta
  }
  const precedences = sourcePrioritiesData
    ? toPrecedences(sourcePrioritiesData)
    : new Map<Path, PathPrecedences>()
  const rankingPrecedences =
    sourceRanking && sourceRanking.length > 0
      ? toRankingPrecedences(sourceRanking)
      : null

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
    // Path-level config takes priority
    const pathPrecedences = precedences.get(path)
    if (pathPrecedences) {
      const p = pathPrecedences.get(sourceRef)
      if (p) return p
      return isLatest ? HIGHESTPRECEDENCE : LOWESTPRECEDENCE
    }
    // Fall back to source-level ranking
    if (rankingPrecedences) {
      const p = rankingPrecedences.get(sourceRef)
      if (p) return p
      return isLatest ? HIGHESTPRECEDENCE : LOWESTPRECEDENCE
    }
    // No config at all — accept everything
    return HIGHESTPRECEDENCE
  }

  const isPreferredValue = (
    path: Path,
    latest: TimestampedSource,
    sourceRef: SourceRef,
    millis: number
  ) => {
    const pathPrecedences = precedences.get(path)

    // No path-level config AND no source ranking → accept all
    if (!pathPrecedences && !rankingPrecedences) {
      return true
    }

    const latestPrecedence = getPrecedence(path, latest.sourceRef, true)
    const incomingPrecedence = getPrecedence(path, sourceRef, false)

    // Negative timeout means the source is disabled — always reject
    if (incomingPrecedence.timeout < 0) {
      return false
    }

    const latestIsFromHigherPrecedence =
      latestPrecedence.precedence < incomingPrecedence.precedence

    const isPreferred =
      !latestIsFromHigherPrecedence ||
      millis - latest.timestamp > incomingPrecedence.timeout
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
            update.values = update.values.reduce(
              (acc: any, pathValue: PathValue) => {
                const latest = getLatest(
                  delta.context as Context,
                  pathValue.path as Path
                )
                const isPreferred = isPreferredValue(
                  pathValue.path as Path,
                  latest,
                  update.$source,
                  millis
                )
                if (isPreferred) {
                  setLatest(
                    delta.context as Context,
                    pathValue.path as Path,
                    update.$source as SourceRef,
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
