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

interface PrecedenceMaps {
  precedences: Map<Path, PathPrecedences>
  highestPrecedenceSources: Map<Path, SourceRef>
}

const toPrecedences = (sourcePrioritiesMap: {
  [path: string]: SourcePriority[]
}): PrecedenceMaps => {
  const precedences = new Map<Path, PathPrecedences>()
  const highestPrecedenceSources = new Map<Path, SourceRef>()

  Object.keys(sourcePrioritiesMap).forEach((path: string) => {
    const priorities = sourcePrioritiesMap[path]
    if (priorities.length > 0) {
      highestPrecedenceSources.set(path as Path, priorities[0].sourceRef)
    }
    const priorityIndices = priorities.reduce<PathPrecedences>(
      (acc, { sourceRef, timeout }, i: number) => {
        acc.set(sourceRef, {
          precedence: i,
          timeout
        })
        return acc
      },
      new Map<SourceRef, SourcePrecedenceData>()
    )
    precedences.set(path as Path, priorityIndices)
  })

  return { precedences, highestPrecedenceSources }
}

export type ToPreferredDelta = (
  delta: any,
  now: Date,
  selfContext: string
) => any

export const getToPreferredDelta = (
  sourcePrioritiesData: SourcePrioritiesData,
  unknownSourceTimeout = 10000
): ToPreferredDelta => {
  if (!sourcePrioritiesData) {
    debug('No priorities data')
    return (delta: any, _now: Date, _selfContext: string) => delta
  }
  const { precedences, highestPrecedenceSources } =
    toPrecedences(sourcePrioritiesData)

  const contextPathTimestamps = new Map<Context, PathLatestTimestamps>()

  const setLatest = (
    context: Context,
    path: Path,
    sourceRef: SourceRef,
    millis: number
  ) => {
    contextPathTimestamps
      .get(context)!
      .set(path, { sourceRef, timestamp: millis })
  }

  const getLatest = (
    context: Context,
    path: Path,
    millis: number
  ): TimestampedSource => {
    let pathLatestTimestamps = contextPathTimestamps.get(context)
    if (!pathLatestTimestamps) {
      pathLatestTimestamps = new Map<Path, TimestampedSource>()
      contextPathTimestamps.set(context, pathLatestTimestamps)
    }

    let latestTimestamp = pathLatestTimestamps.get(path)
    if (!latestTimestamp) {
      const highestPrecedenceSource = highestPrecedenceSources.get(path)
      if (highestPrecedenceSource) {
        latestTimestamp = {
          sourceRef: highestPrecedenceSource,
          timestamp: millis
        }
        pathLatestTimestamps.set(path, latestTimestamp)
        return latestTimestamp
      }
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

  const isPreferredValue = (
    path: Path,
    latest: TimestampedSource,
    sourceRef: SourceRef,
    millis: number
  ) => {
    const pathPrecedences: PathPrecedences | undefined = precedences.get(path)

    if (!pathPrecedences) {
      return true
    }

    const latestPrecedence =
      pathPrecedences.get(latest.sourceRef) || HIGHESTPRECEDENCE
    const incomingPrecedence =
      pathPrecedences.get(sourceRef) || LOWESTPRECEDENCE

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
                  pathValue.path as Path,
                  millis
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
