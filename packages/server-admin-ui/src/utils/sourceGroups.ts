/**
 * Default Fallback timeout (ms) applied to a freshly-added priority row
 * when no path-level override exists yet. Re-exported so the store
 * slice and PrefsEditor stay in sync — without a single canonical
 * value, "+ add row" via the slice and the auto-added row in
 * PrefsEditor end up with different timeouts.
 */
export const DEFAULT_FALLBACK_MS = 15000

// CAN Name suffix matcher — kept in sync with src/deltaPriority.ts.
// An NMEA 2000 CAN Name is 16 hex digits. Identifying refs by their
// CAN Name lets a user rank a physical device once and have it count
// across transports. Hex digits are case-insensitive so a hand-edited
// priorities.json carrying uppercase letters still matches.
const CAN_NAME_SUFFIX = /\.([0-9a-fA-F]{16})$/

/**
 * Mirror of sourceRefIdentity in src/deltaPriority.ts. Keep in sync
 * — the engine uses it to match saved canName-form rankings against
 * the address-form refs that come in over the bus.
 */
export function sourceRefIdentity(sourceRef: string): string {
  const m = CAN_NAME_SUFFIX.exec(sourceRef)
  return m ? m[1]!.toLowerCase() : sourceRef
}

interface PrioritySource {
  sourceRef: string
  timeout?: string | number
}

interface PriorityGroupShape {
  id?: string
  sources?: string[]
  inactive?: boolean
}

const FANOUT_SOURCEREF = '*'

/**
 * Mirror of isOverrideDormantUnderGroups in src/deltaPriority.ts.
 *
 * An override is dormant when every one of its ranked sources belongs
 * to a group the user has marked inactive — the engine bypasses it,
 * so the admin UI should render it as visually disabled and exclude
 * it from the attention-count badge. Reactivating the parent group
 * flips the override back on without the user having to re-author it.
 *
 * Kept structurally identical to the server-side helper so the truth
 * derived from `(overrides, groups)` stays consistent on both sides
 * without an explicit dormant flag being pushed across the wire.
 */
export function isOverrideDormantUnderGroups(
  override: PrioritySource[] | undefined,
  groups: PriorityGroupShape[] | undefined
): boolean {
  if (!Array.isArray(override) || override.length === 0) return false
  if (override.length === 1 && override[0]?.sourceRef === FANOUT_SOURCEREF) {
    return false
  }
  if (!Array.isArray(groups) || groups.length === 0) return false
  const inactiveSourceIdentities = new Set<string>()
  const allClaimedIdentities = new Set<string>()
  for (const g of groups) {
    if (!Array.isArray(g?.sources)) continue
    for (const s of g.sources) {
      const id = sourceRefIdentity(s)
      allClaimedIdentities.add(id)
      if (g.inactive) {
        inactiveSourceIdentities.add(id)
      } else {
        inactiveSourceIdentities.delete(id)
      }
    }
  }
  for (const entry of override) {
    if (!entry?.sourceRef) continue
    const id = sourceRefIdentity(entry.sourceRef)
    if (!allClaimedIdentities.has(id)) return false
    if (!inactiveSourceIdentities.has(id)) return false
  }
  return true
}

/**
 * Reconciled priority group as delivered by the server's
 * /skServer/reconciledGroups endpoint and RECONCILEDGROUPS event.
 *
 * Saved groups are authoritative: their composition is fixed by
 * priorityGroups in the server config, not by current cache flux.
 * Unsaved sources fall through to connected-components discovery
 * surfacing as auto-grouped cards (matchedSavedId === null).
 */
export interface ReconciledGroup {
  id: string
  matchedSavedId: string | null
  inactive?: boolean
  sources: string[]
  paths: string[]
  newcomerSources: string[]
}
