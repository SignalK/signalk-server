/**
 * LatestValuesAccumulator - Accumulates Signal K delta values during backpressure,
 * keeping only the latest value for each unique context:path:$source combination.
 */

import {
  Context,
  Delta,
  hasValues,
  Path,
  SourceRef,
  Timestamp,
  Update
} from '@signalk/server-api'

export interface AccumulatedItem {
  context: Context
  path: Path
  value: unknown
  $source: SourceRef | undefined
  timestamp: Timestamp | undefined
}

export interface BackpressureDelta extends Delta {
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
    if (!hasValues(update)) continue
    for (const pv of update.values) {
      const key = `${delta.context}:${pv.path}:${update.$source || 'unknown'}`
      accumulator.set(key, {
        context: delta.context as Context,
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
  const byContext = new Map<Context, Map<string, Update>>()
  for (const [, item] of accumulator) {
    if (!byContext.has(item.context)) {
      byContext.set(item.context, new Map())
    }
    // Group by $source within context
    const bySource = byContext.get(item.context)!
    const sourceKey = item.$source || 'unknown'
    if (!bySource.has(sourceKey)) {
      bySource.set(sourceKey, {
        $source: item.$source as SourceRef,
        timestamp: item.timestamp as Timestamp,
        values: []
      })
    }
    const update = bySource.get(sourceKey)!
    if (hasValues(update)) {
      update.values.push({
        path: item.path as Path,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: item.value as any
      })
      // Use the most recent timestamp for this source
      if (
        item.timestamp &&
        (!update.timestamp || item.timestamp > update.timestamp)
      ) {
        update.timestamp = item.timestamp as Timestamp
      }
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
