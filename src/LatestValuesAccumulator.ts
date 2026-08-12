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
 * Groups values by context, $source, and timestamp for proper delta structure.
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

  const byContext = new Map<
    Context,
    Map<SourceRef | undefined, Map<Timestamp | undefined, Update>>
  >()
  for (const item of accumulator.values()) {
    let bySource = byContext.get(item.context)
    if (!bySource) {
      bySource = new Map()
      byContext.set(item.context, bySource)
    }
    // One update timestamp applies to every path value in that update, so values from different
    // source frames must remain in separate updates even when their $source is the same.
    let byTimestamp = bySource.get(item.$source)
    if (!byTimestamp) {
      byTimestamp = new Map()
      bySource.set(item.$source, byTimestamp)
    }
    let update = byTimestamp.get(item.timestamp)
    if (!update) {
      update = {
        $source: item.$source as SourceRef,
        timestamp: item.timestamp as Timestamp,
        values: []
      }
      byTimestamp.set(item.timestamp, update)
    }
    if (hasValues(update)) {
      update.values.push({
        path: item.path as Path,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: item.value as any
      })
    }
  }

  const deltas: BackpressureDelta[] = []
  for (const [context, bySource] of byContext) {
    deltas.push({
      context,
      updates: Array.from(bySource.values()).flatMap((byTimestamp) =>
        Array.from(byTimestamp.values())
      ),
      $backpressure: {
        accumulated: countBefore,
        duration
      }
    })
  }

  return deltas
}
