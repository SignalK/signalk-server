/**
 * Default Fallback timeout (ms) applied to a freshly-added priority row
 * when no path-level override exists yet. Re-exported so the store
 * slice and PrefsEditor stay in sync — without a single canonical
 * value, "+ add row" via the slice and the auto-added row in
 * PrefsEditor end up with different timeouts.
 */
export const DEFAULT_FALLBACK_MS = 15000

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
