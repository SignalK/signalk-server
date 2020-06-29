type Brand<K, T> = K & { __brand: T }

type Context = Brand<string, 'context'>
type SourceRef = Brand<string, 'sourceRef'>
type Path = Brand<string, 'path'>

interface SourcePreference {
  sourceRef: SourceRef
  timeout: number
}

export interface SourcePreferencesData {
  [path: string]: Array<SourcePreference>
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
const toPrecedences = (sourcePreferencesMap: {
  [path: string]: Array<SourcePreference>
}) =>
  Object.keys(sourcePreferencesMap).reduce<Map<Path, PathPrecedences>>(
    (acc, path: string) => {
      const priorityIndices = sourcePreferencesMap[path].reduce<
        PathPrecedences
      >((acc, { sourceRef, timeout }, i: number) => {
        acc.set(sourceRef, {
          precedence: i,
          timeout: timeout
        })
        return acc
      }, new Map<SourceRef, SourcePrecedenceData>())
      acc.set(path as Path, priorityIndices)
      return acc
    },
    new Map<Path, PathPrecedences>()
  )

export const getToPreferredDelta = (
  sourcePreferencesData: SourcePreferencesData
) => {
  const precedences = toPrecedences(sourcePreferencesData)

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
      pathPrecedences.get(sourceRef) || HIGHESTPRECEDENCE

    const latestIsFromHigherPrecedence =
      latestPrecedence.precedence < incomingPrecedence.precedence

    return (
      !latestIsFromHigherPrecedence ||
      millis - latest.timestamp > incomingPrecedence.timeout
    )
  }

  return (delta: any, now: Date, selfContext: string) => {
    if (delta.context === selfContext) {
      const millis = now.getTime()
      delta.updates &&
        delta.updates.forEach((update: any) => {
          update.values =
            update.values &&
            update.values.reduce((acc: any, pathValue: PathValue) => {
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
            }, [])
        })
    }
    return delta
  }
}
