/**
 * Accumulates Signal K delta values during backpressure, keeping only the
 * latest value for each unique context:path:$source combination.
 */

import {
  Context,
  Delta,
  hasValues,
  Path,
  PathValue,
  SourceRef,
  Timestamp,
  Update,
  Value
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

const UNKNOWN_SOURCE = 'unknown'

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
  const context = delta.context as Context
  for (const update of delta.updates) {
    if (!hasValues(update)) continue
    const $source = update.$source
    const sourceKey = $source || UNKNOWN_SOURCE
    const timestamp = update.timestamp
    for (const pv of update.values) {
      const key = `${context}:${pv.path}:${sourceKey}`
      const existing = accumulator.get(key)
      if (existing) {
        existing.value = pv.value
        existing.$source = $source
        existing.timestamp = timestamp
      } else {
        accumulator.set(key, {
          context,
          path: pv.path,
          value: pv.value,
          $source,
          timestamp
        })
      }
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

  const byContext = new Map<
    Context,
    Map<string, Update & { values: PathValue[] }>
  >()
  for (const item of accumulator.values()) {
    let bySource = byContext.get(item.context)
    if (!bySource) {
      bySource = new Map()
      byContext.set(item.context, bySource)
    }
    const sourceKey = item.$source || UNKNOWN_SOURCE
    let update = bySource.get(sourceKey)
    if (!update) {
      update = {
        $source: item.$source,
        timestamp: item.timestamp,
        values: []
      }
      bySource.set(sourceKey, update)
    }
    update.values.push({
      path: item.path,
      value: item.value as Value
    })
    // Keep the newest timestamp seen for this source so the flushed delta reflects the latest update.
    if (
      item.timestamp &&
      (!update.timestamp || item.timestamp > update.timestamp)
    ) {
      update.timestamp = item.timestamp
    }
  }

  const deltas: BackpressureDelta[] = []
  for (const [context, bySource] of byContext) {
    deltas.push({
      context,
      updates: Array.from(bySource.values()),
      $backpressure: {
        accumulated: countBefore,
        duration
      }
    })
  }

  return deltas
}
