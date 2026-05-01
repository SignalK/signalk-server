import type { PriorityGroup } from '../store/types'

/**
 * Default Fallback timeout (ms) applied to a freshly-added priority row
 * when no path-level override exists yet. Re-exported so the store
 * slice and PrefsEditor stay in sync — without a single canonical
 * value, "+ add row" via the slice and the auto-added row in
 * PrefsEditor end up with different timeouts.
 */
export const DEFAULT_FALLBACK_MS = 15000

export interface DerivedGroup {
  id: string
  sources: string[]
  paths: string[]
}

function stableGroupId(sources: string[]): string {
  return [...sources].sort().join('\u0001')
}

/**
 * Compute connected-components over sources using multiSourcePaths as edges.
 * Two sources are in the same group iff there is a chain of shared paths
 * linking them. Single-source paths are excluded from grouping.
 *
 * Each returned group carries a stable id (derived from its sorted source
 * set), its sorted sources, and the list of shared paths that landed in it.
 */
export function computeGroups(
  multiSourcePaths: Record<string, string[]>
): DerivedGroup[] {
  const parent = new Map<string, string>()

  const find = (x: string): string => {
    let root = x
    while (parent.get(root)! !== root) {
      root = parent.get(root)!
    }
    let cur = x
    while (parent.get(cur)! !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const refs of Object.values(multiSourcePaths)) {
    if (!Array.isArray(refs) || refs.length < 2) continue
    for (const ref of refs) {
      if (!parent.has(ref)) parent.set(ref, ref)
    }
    for (let i = 1; i < refs.length; i++) {
      union(refs[0], refs[i])
    }
  }

  const bucketSources = new Map<string, Set<string>>()
  const bucketPaths = new Map<string, Set<string>>()

  for (const [path, refs] of Object.entries(multiSourcePaths)) {
    if (!Array.isArray(refs) || refs.length < 2) continue
    const root = find(refs[0])
    let srcSet = bucketSources.get(root)
    if (!srcSet) {
      srcSet = new Set()
      bucketSources.set(root, srcSet)
    }
    for (const ref of refs) srcSet.add(ref)
    let pathSet = bucketPaths.get(root)
    if (!pathSet) {
      pathSet = new Set()
      bucketPaths.set(root, pathSet)
    }
    pathSet.add(path)
  }

  const out: DerivedGroup[] = []
  for (const [root, srcSet] of bucketSources) {
    const sources = [...srcSet].sort()
    out.push({
      id: stableGroupId(sources),
      sources,
      paths: [...(bucketPaths.get(root) ?? [])].sort()
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Reconcile derived live groups with the user's persisted group rankings.
 *
 * For each derived group, find the saved group with the greatest source
 * overlap. Copy that ordering; any new sources join at the end of the list
 * in alphabetical order. If no saved group overlaps, the derived sources
 * stay in their alphabetical default order (caller can treat that as
 * "no ranking yet").
 *
 * Returns groups enriched with ordered `sources`, plus the `matchedSaved`
 * group id so the UI can tell "ranked" from "unranked".
 */
export interface ReconciledGroup extends DerivedGroup {
  matchedSavedId: string | null
  inactive?: boolean
  /**
   * Sources that are publishing this group's paths now but weren't in the
   * matched saved ranking. Empty for unranked groups (everything is new
   * by definition — the "Unranked" badge already covers that case).
   */
  newcomerSources: string[]
}

export function reconcileGroups(
  derived: DerivedGroup[],
  saved: PriorityGroup[]
): ReconciledGroup[] {
  return derived.map((group) => {
    const liveSet = new Set(group.sources)
    let bestOverlap = 0
    let bestSaved: PriorityGroup | null = null
    for (const s of saved) {
      let overlap = 0
      for (const src of s.sources) if (liveSet.has(src)) overlap++
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestSaved = s
      }
    }

    if (!bestSaved || bestOverlap === 0) {
      return {
        ...group,
        matchedSavedId: null,
        newcomerSources: []
      }
    }

    const savedOrder = bestSaved.sources.filter((src) => liveSet.has(src))
    const savedSet = new Set(savedOrder)
    const newcomers = group.sources.filter((src) => !savedSet.has(src)).sort()
    return {
      ...group,
      sources: [...savedOrder, ...newcomers],
      matchedSavedId: bestSaved.id,
      inactive: bestSaved.inactive ?? false,
      newcomerSources: newcomers
    }
  })
}
