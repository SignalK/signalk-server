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
  value: Value
  $source: SourceRef | undefined
  timestamp: Timestamp | undefined
}

export interface BackpressureDelta extends Delta {
  $backpressure: {
    accumulated: number
    duration: number
  }
}

const UNDEFINED_SOURCE_KEY = '0'
const DEFINED_SOURCE_KEY_PREFIX = '1'

function accumulationKey(
  context: Context,
  path: Path,
  $source: SourceRef | undefined
): string {
  const sourceKey =
    $source === undefined
      ? UNDEFINED_SOURCE_KEY
      : `${DEFINED_SOURCE_KEY_PREFIX}${$source}`
  return `${context}:${path}:${sourceKey}`
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
  const context = delta.context as Context
  for (const update of delta.updates) {
    if (!hasValues(update)) continue
    const $source = update.$source
    const timestamp = update.timestamp
    for (const pv of update.values) {
      const key = accumulationKey(context, pv.path, $source)
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
    Map<SourceRef | undefined, Update & { values: PathValue[] }>
  >()
  for (const item of accumulator.values()) {
    let bySource = byContext.get(item.context)
    if (!bySource) {
      bySource = new Map()
      byContext.set(item.context, bySource)
    }
    let update = bySource.get(item.$source)
    if (!update) {
      update = {
        $source: item.$source,
        timestamp: item.timestamp,
        values: []
      }
      bySource.set(item.$source, update)
    }
    update.values.push({
      path: item.path,
      value: item.value
    })
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
