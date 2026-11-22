/**
 * LatestValuesAccumulator - Accumulates Signal K deltas during backpressure,
 * keeping only the latest value for each unique context:path:$source
 * combination and the metadata for each context:path.
 */

import {
  Context,
  Delta,
  hasMeta,
  hasValues,
  Meta,
  MetaValue,
  Path,
  PathValue,
  SourceRef,
  Timestamp,
  Update
} from '@signalk/server-api'

interface AccumulatedFields {
  context: Context
  path: Path
  $source: SourceRef | undefined
  timestamp: Timestamp | undefined
}

export interface AccumulatedValue extends AccumulatedFields {
  kind: 'value'
  value: PathValue['value']
}

export interface AccumulatedMeta extends AccumulatedFields {
  kind: 'meta'
  value: MetaValue
}

export type AccumulatedItem = AccumulatedValue | AccumulatedMeta

export interface BackpressureDelta extends Delta {
  $backpressure: {
    accumulated: number
    duration: number
  }
}

interface UpdateEntries {
  values: PathValue[]
  meta: Meta[]
}

/**
 * Accumulate latest value per context:path:$source during backpressure.
 * Only keeps the most recent value for each unique combination, dropping intermediate updates.
 * Metadata is kept per context:path. A metadata delta carries only the fields
 * it changes, so later ones are merged into earlier ones rather than replacing
 * them, and none counts as dropped.
 *
 * @param accumulator - Map to store accumulated values, keyed by context:path:$source
 * @param delta - Signal K delta to accumulate
 * @returns Number of accumulated values replaced by a newer update
 */
export function accumulateLatestValue(
  accumulator: Map<string, AccumulatedItem>,
  delta: Delta
): number {
  let dropped = 0
  if (!delta.updates) return dropped
  for (const update of delta.updates) {
    if (hasMeta(update)) accumulateMeta(accumulator, delta, update)
    if (!hasValues(update)) continue
    for (const pv of update.values) {
      const key = `${delta.context}:${pv.path}:${update.$source || 'unknown'}`
      // A cache replay re-sends an update that is already accumulated; only
      // an update with another timestamp means one was lost.
      const previous = accumulator.get(key)
      if (previous && previous.timestamp !== update.timestamp) dropped++
      accumulator.set(key, {
        kind: 'value',
        context: delta.context as Context,
        path: pv.path,
        value: pv.value,
        $source: update.$source,
        timestamp: update.timestamp
      })
    }
  }
  return dropped
}

function accumulateMeta(
  accumulator: Map<string, AccumulatedItem>,
  delta: Delta,
  update: Update & { meta: Meta[] }
): void {
  for (const meta of update.meta) {
    const key = `meta:${delta.context}:${meta.path}`
    const previous = accumulator.get(key)
    accumulator.set(key, {
      kind: 'meta',
      context: delta.context as Context,
      path: meta.path,
      value:
        previous?.kind === 'meta'
          ? { ...previous.value, ...meta.value }
          : meta.value,
      $source: update.$source,
      timestamp: update.timestamp
    })
  }
}

function toUpdate(
  $source: SourceRef | undefined,
  timestamp: Timestamp | undefined,
  { values, meta }: UpdateEntries
): Update {
  if (meta.length === 0) return { $source, timestamp, values }
  if (values.length === 0) return { $source, timestamp, meta }
  return { $source, timestamp, values, meta }
}

/**
 * Convert accumulated values to spec-compliant deltas.
 * Groups values by context, $source, and timestamp for proper delta structure.
 *
 * @param accumulator - Map of accumulated values
 * @param duration - How long backpressure was active in milliseconds
 * @param dropped - How many updates were replaced while accumulating
 * @returns Array of deltas, one per context, with a $backpressure indicator
 * when updates were dropped
 */
export function buildFlushDeltas(
  accumulator: Map<string, AccumulatedItem>,
  duration: number,
  dropped: number
): Array<Delta | BackpressureDelta> {
  if (accumulator.size === 0) return []

  const countBefore = accumulator.size

  const byContext = new Map<
    Context,
    Map<SourceRef | undefined, Map<Timestamp | undefined, UpdateEntries>>
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
    let entries = byTimestamp.get(item.timestamp)
    if (!entries) {
      entries = { values: [], meta: [] }
      byTimestamp.set(item.timestamp, entries)
    }
    if (item.kind === 'meta') {
      entries.meta.push({ path: item.path, value: item.value })
    } else {
      entries.values.push({ path: item.path, value: item.value })
    }
  }

  const deltas: Array<Delta | BackpressureDelta> = []
  for (const [context, bySource] of byContext) {
    const updates = Array.from(bySource).flatMap(([$source, byTimestamp]) =>
      Array.from(byTimestamp, ([timestamp, entries]) =>
        toUpdate($source, timestamp, entries)
      )
    )
    deltas.push(
      dropped > 0
        ? {
            context,
            updates,
            $backpressure: { accumulated: countBefore, duration }
          }
        : { context, updates }
    )
  }

  return deltas
}
