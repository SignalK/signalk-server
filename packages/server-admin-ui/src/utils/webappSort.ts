import Type, { type Static } from 'typebox'

export const WebappSortModeSchema = Type.Union([
  Type.Literal('name'),
  Type.Literal('custom'),
  Type.Literal('lastUsed')
])

export type WebappSortMode = Static<typeof WebappSortModeSchema>

// Runtime list derived from the schema so the localStorage validation
// (readString allow-list) and the document validation cannot drift.
export const WEBAPP_SORT_MODES: readonly WebappSortMode[] =
  WebappSortModeSchema.anyOf.map((literal) => literal.const as WebappSortMode)

export const WebappCustomOrderSchema = Type.Array(Type.String())

export const WebappLastUsedSchema = Type.Record(Type.String(), Type.Number())

// The document synced to /signalk/v1/applicationData/user/webapp-sort —
// also the shape persisted (field by field) in localStorage. Everything
// read from either source is validated against these schemas before use.
export const WebappSortDocSchema = Type.Object({
  sortMode: WebappSortModeSchema,
  customOrder: WebappCustomOrderSchema,
  lastUsed: WebappLastUsedSchema
})

export type WebappSortDoc = Static<typeof WebappSortDocSchema>

export interface SortableWebapp {
  name: string
  signalk?: {
    displayName?: string
  }
}

const sortName = (webapp: SortableWebapp) =>
  webapp.signalk?.displayName || webapp.name

const byName = (a: SortableWebapp, b: SortableWebapp) =>
  sortName(a).localeCompare(sortName(b), undefined, { sensitivity: 'base' })

export function applyWebappSort<T extends SortableWebapp>(
  webapps: T[],
  mode: WebappSortMode,
  customOrder: string[],
  lastUsed: Record<string, number>
): T[] {
  const sorted = [...webapps]
  if (mode === 'custom') {
    // Ranked names keep their stored position; webapps not in the stored
    // order (newly installed) form an alphabetical tail.
    const rank = new Map(customOrder.map((name, index) => [name, index]))
    sorted.sort((a, b) => {
      const rankA = rank.get(a.name)
      const rankB = rank.get(b.name)
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB
      if (rankA !== undefined) return -1
      if (rankB !== undefined) return 1
      return byName(a, b)
    })
  } else if (mode === 'lastUsed') {
    // Most recently launched first; never-launched webapps form an
    // alphabetical tail. Map lookup instead of property access so a
    // webapp named like an Object.prototype member cannot resolve to
    // an inherited value.
    const launched = new Map(Object.entries(lastUsed))
    sorted.sort((a, b) => {
      const launchedA = launched.get(a.name)
      const launchedB = launched.get(b.name)
      if (launchedA !== undefined && launchedB !== undefined)
        return launchedB - launchedA
      if (launchedA !== undefined) return -1
      if (launchedB !== undefined) return 1
      return byName(a, b)
    })
  } else {
    sorted.sort(byName)
  }
  return sorted
}

// Per-webapp maximum of both timestamp maps, so partial histories from
// two devices combine instead of one overwriting the other.
export function mergeLastUsed(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const merged = new Map(Object.entries(a))
  for (const [name, timestamp] of Object.entries(b)) {
    const existing = merged.get(name)
    if (existing === undefined || timestamp > existing) {
      merged.set(name, timestamp)
    }
  }
  return Object.fromEntries(merged)
}
