/**
 * LatestValuesAccumulator - Accumulates Signal K delta values during backpressure,
 * keeping only the latest value for each unique context:path:$source combination.
 */

interface PathValue {
  path: string
  value: unknown
}

interface Update {
  $source?: string
  timestamp?: string
  values?: PathValue[]
}

interface Delta {
  context: string
  updates?: Update[]
}

interface AccumulatedItem {
  context: string
  path: string
  value: unknown
  $source: string | undefined
  timestamp: string | undefined
}

interface GroupedUpdate {
  $source: string | undefined
  timestamp: string | undefined
  values: PathValue[]
}

export interface BackpressureDelta {
  context: string
  updates: GroupedUpdate[]
  $backpressure: {
    accumulated: number
    duration: number
  }
}

/**
 * Accumulate latest value per context:path:$source during backpressure.
 * Only keeps the most recent value for each unique combination, dropping intermediate updates.
 *
 * @param accumulator - Map to store accumulated values, keyed by context:path:$source
 * @param delta - Signal K delta to accumulate
 */
export function accumulateLatestValue(
  accumulator: Map<string, AccumulatedItem>,
  delta: Delta
): void {
  if (!delta.updates) return
  for (const update of delta.updates) {
    if (!update.values) continue
    for (const pv of update.values) {
      const key = `${delta.context}:${pv.path}:${update.$source || 'unknown'}`
      accumulator.set(key, {
        context: delta.context,
        path: pv.path,
        value: pv.value,
        $source: update.$source,
        timestamp: update.timestamp
      })
    }
  }
}

/**
 * Convert accumulated values to spec-compliant deltas.
 * Groups values by context and $source for proper delta structure.
 *
 * @param accumulator - Map of accumulated values
 * @param duration - How long backpressure was active in milliseconds
 * @returns Array of deltas, one per context, with $backpressure indicator
 */
export function buildFlushDeltas(
  accumulator: Map<string, AccumulatedItem>,
  duration: number
): BackpressureDelta[] {
  if (accumulator.size === 0) return []

  const countBefore = accumulator.size

  // Group by context
  const byContext = new Map<string, Map<string, GroupedUpdate>>()
  for (const [, item] of accumulator) {
    if (!byContext.has(item.context)) {
      byContext.set(item.context, new Map())
    }
    // Group by $source within context
    const bySource = byContext.get(item.context)!
    const sourceKey = item.$source || 'unknown'
    if (!bySource.has(sourceKey)) {
      bySource.set(sourceKey, {
        $source: item.$source,
        timestamp: item.timestamp,
        values: []
      })
    }
    const update = bySource.get(sourceKey)!
    update.values.push({
      path: item.path,
      value: item.value
    })
    // Use the most recent timestamp for this source
    if (
      item.timestamp &&
      (!update.timestamp || item.timestamp > update.timestamp)
    ) {
      update.timestamp = item.timestamp
    }
  }

  // Build one delta per context with backpressure indicator
  const deltas: BackpressureDelta[] = []
  for (const [context, bySourceTime] of byContext) {
    deltas.push({
      context,
      updates: Array.from(bySourceTime.values()),
      $backpressure: {
        accumulated: countBefore,
        duration
      }
    })
  }

  return deltas
}
