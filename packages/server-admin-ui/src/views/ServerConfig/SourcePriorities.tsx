import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import { useSearchParams } from 'react-router-dom'

import {
  useStore,
  useSourcePriorities,
  useMultiSourcePaths,
  useReconciledGroups,
  usePriorityGroups,
  usePriorityDefaults,
  usePriorityOverrides,
  useSourceStatus,
  useSourceStatusLoaded
} from '../../store'
import type { SourcesData } from '../../utils/sourceLabels'
import type { SourcePriority } from '../../store/types'
import PrefsEditor from './PrefsEditor'
import PriorityGroupCard from './PriorityGroupCard'

interface DeviceIdentity {
  canName: string
  manufacturerCode?: string
  modelId?: string
  productCode?: number
  sourceRefs: string[]
}

function fetchDeviceIdentities(cb: (identities: DeviceIdentity[]) => void) {
  fetch(`${window.serverRoutesPrefix}/deviceIdentities`, {
    credentials: 'include'
  })
    .then((r) => r.json())
    .then((data) => cb(Array.isArray(data) ? data : []))
    .catch((err) => {
      console.warn('Failed to load device identities:', err)
      cb([])
    })
}

export interface DeviceIdentityIndex {
  canNameBySourceRef: Map<string, string>
  identityByCanName: Map<string, DeviceIdentity>
}

function indexDeviceIdentities(
  identities: DeviceIdentity[]
): DeviceIdentityIndex {
  const canNameBySourceRef = new Map<string, string>()
  const identityByCanName = new Map<string, DeviceIdentity>()
  for (const id of identities) {
    identityByCanName.set(id.canName, id)
    for (const ref of id.sourceRefs) {
      canNameBySourceRef.set(ref, id.canName)
    }
  }
  return { canNameBySourceRef, identityByCanName }
}

type SourceMetaMap = Map<string, { pgn?: number; sentence?: string }>

// Walk the Signal K self-vessel tree and extract per-(path, source) pgn /
// sentence info. Keyed as `${path}::${sourceRef}` for cheap lookup.
// Reads both `values[ref]` (multi-source leaves) and the top-level
// `{$source, pgn, sentence}` fields (single-source leaves — no values
// block is emitted when only one source is currently publishing).
function extractPathSourceMeta(tree: unknown): SourceMetaMap {
  const out: SourceMetaMap = new Map()
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>

    const topSource = typeof n.$source === 'string' ? n.$source : undefined
    const topPgn = typeof n.pgn === 'number' ? n.pgn : undefined
    const topSentence = typeof n.sentence === 'string' ? n.sentence : undefined
    if (topSource && (topPgn !== undefined || topSentence !== undefined)) {
      out.set(`${path}::${topSource}`, { pgn: topPgn, sentence: topSentence })
    }

    const values = n.values as
      | Record<string, Record<string, unknown>>
      | undefined
    if (values && typeof values === 'object') {
      for (const [ref, entry] of Object.entries(values)) {
        if (!entry || typeof entry !== 'object') continue
        const pgn = typeof entry.pgn === 'number' ? entry.pgn : undefined
        const sentence =
          typeof entry.sentence === 'string' ? entry.sentence : undefined
        if (pgn !== undefined || sentence !== undefined) {
          out.set(`${path}::${ref}`, { pgn, sentence })
        }
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (
        k === 'value' ||
        k === 'values' ||
        k === 'meta' ||
        k === 'timestamp' ||
        k === '$source' ||
        k === 'pgn' ||
        k === 'sentence' ||
        typeof v !== 'object' ||
        v === null
      ) {
        continue
      }
      visit(v, path ? `${path}.${k}` : k)
    }
  }
  if (tree && typeof tree === 'object') visit(tree, '')
  return out
}

const TimelineDiagram: React.FC = () => (
  <svg
    viewBox="0 0 840 300"
    xmlns="http://www.w3.org/2000/svg"
    style={{ maxWidth: '840px', width: '100%', height: 'auto' }}
    role="img"
    aria-label="Fallback timeline with three sources: Backup 1 takes over after Preferred is silent for Fallback after, then Backup 2 takes over after Backup 1 is also silent for its Fallback after. Each wait is measured from whichever source was last winning."
  >
    <defs>
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
      </marker>
    </defs>
    <rect x="0" y="0" width="10" height="10" fill="#2e7d32" rx="2" />
    <text x="16" y="9" fontSize="10" fill="#555">
      accepted (winning)
    </text>
    <rect x="150" y="0" width="10" height="10" fill="#bdbdbd" rx="2" />
    <text x="166" y="9" fontSize="10" fill="#555">
      ignored (not winning)
    </text>
    <rect x="305" y="0" width="10" height="10" fill="#1565c0" rx="2" />
    <text x="321" y="9" fontSize="10" fill="#555">
      accepted (takeover)
    </text>
    <text x="0" y="56" fontSize="12" fill="#333" fontWeight="600">
      Preferred
    </text>
    <text x="0" y="106" fontSize="12" fill="#333" fontWeight="600">
      Backup 1
    </text>
    <text x="0" y="156" fontSize="12" fill="#333" fontWeight="600">
      Backup 2
    </text>
    <rect x="80" y="48" width="30" height="16" fill="#2e7d32" rx="2" />
    <rect x="118" y="48" width="30" height="16" fill="#2e7d32" rx="2" />
    <rect x="156" y="48" width="30" height="16" fill="#2e7d32" rx="2" />
    <rect x="194" y="48" width="30" height="16" fill="#2e7d32" rx="2" />
    <rect x="232" y="48" width="30" height="16" fill="#2e7d32" rx="2" />
    <line
      x1="262"
      y1="56"
      x2="800"
      y2="56"
      stroke="#b71c1c"
      strokeWidth="1.5"
      strokeDasharray="4 3"
    />
    <text x="531" y="45" fontSize="11" fill="#b71c1c" textAnchor="middle">
      (silent)
    </text>
    <rect x="80" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="118" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="156" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="194" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="232" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="270" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="308" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="346" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="384" y="98" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="442" y="98" width="30" height="16" fill="#1565c0" rx="2" />
    <rect x="480" y="98" width="30" height="16" fill="#1565c0" rx="2" />
    <rect x="518" y="98" width="30" height="16" fill="#1565c0" rx="2" />
    <line
      x1="548"
      y1="106"
      x2="800"
      y2="106"
      stroke="#b71c1c"
      strokeWidth="1.5"
      strokeDasharray="4 3"
    />
    <text x="674" y="95" fontSize="11" fill="#b71c1c" textAnchor="middle">
      (silent)
    </text>
    <rect x="80" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="118" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="156" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="194" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="232" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="270" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="308" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="346" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="384" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="442" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="480" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="518" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="560" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="598" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="636" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="674" y="148" width="30" height="16" fill="#bdbdbd" rx="2" />
    <rect x="728" y="148" width="30" height="16" fill="#1565c0" rx="2" />
    <rect x="766" y="148" width="30" height="16" fill="#1565c0" rx="2" />
    <line
      x1="262"
      y1="30"
      x2="262"
      y2="185"
      stroke="#999"
      strokeWidth="1"
      strokeDasharray="3 3"
    />
    <text x="262" y="24" fontSize="10" fill="#555" textAnchor="middle">
      Preferred silent
    </text>
    <line
      x1="442"
      y1="30"
      x2="442"
      y2="185"
      stroke="#1565c0"
      strokeWidth="1"
      strokeDasharray="3 3"
    />
    <text x="442" y="24" fontSize="10" fill="#1565c0" textAnchor="middle">
      Backup 1 wins
    </text>
    <line
      x1="262"
      y1="80"
      x2="442"
      y2="80"
      stroke="#555"
      strokeWidth="1"
      markerStart="url(#arrow)"
      markerEnd="url(#arrow)"
    />
    <text x="352" y="76" fontSize="10" fill="#333" textAnchor="middle">
      Fallback after (15s)
    </text>
    <line
      x1="548"
      y1="80"
      x2="548"
      y2="185"
      stroke="#999"
      strokeWidth="1"
      strokeDasharray="3 3"
    />
    <text x="548" y="74" fontSize="10" fill="#555" textAnchor="middle">
      Backup 1 silent
    </text>
    <line
      x1="728"
      y1="130"
      x2="728"
      y2="185"
      stroke="#1565c0"
      strokeWidth="1"
      strokeDasharray="3 3"
    />
    <text x="728" y="126" fontSize="10" fill="#1565c0" textAnchor="middle">
      Backup 2 wins
    </text>
    <line
      x1="548"
      y1="175"
      x2="728"
      y2="175"
      stroke="#555"
      strokeWidth="1"
      markerStart="url(#arrow)"
      markerEnd="url(#arrow)"
    />
    <text x="638" y="171" fontSize="10" fill="#333" textAnchor="middle">
      Fallback after (15s)
    </text>
    <line x1="80" y1="200" x2="810" y2="200" stroke="#ccc" strokeWidth="1" />
    <text x="810" y="200" fontSize="10" fill="#999" textAnchor="end" dy="12">
      time →
    </text>
    <text
      x="420"
      y="240"
      fontSize="11"
      fill="#333"
      textAnchor="middle"
      fontWeight="600"
    >
      Each row&apos;s Fallback timer starts from the last source that was
      winning — not from row 1.
    </text>
    <text x="420" y="256" fontSize="10" fill="#666" textAnchor="middle">
      Backup 2 waits for Backup 1 to go silent, then 15 s more. It does NOT kick
      in 15 s after Preferred.
    </text>
    <text x="420" y="272" fontSize="10" fill="#666" textAnchor="middle">
      If Backup 1 keeps sending, Backup 2 never wins — only the next row up in
      the chain matters.
    </text>
  </svg>
)

const SourcePriorities: React.FC = () => {
  const sourcePrioritiesData = useSourcePriorities()
  const priorityGroupsData = usePriorityGroups()
  const priorityDefaultsData = usePriorityDefaults()
  const priorityOverridesData = usePriorityOverrides()
  const multiSourcePaths = useMultiSourcePaths()
  const reconciled = useReconciledGroups()
  const sourceStatus = useSourceStatus()
  const sourceStatusLoaded = useSourceStatusLoaded()

  const setSaving = useStore((s) => s.setSaving)
  const setSaved = useStore((s) => s.setSaved)
  const setSaveFailed = useStore((s) => s.setSaveFailed)
  const clearSaveFailed = useStore((s) => s.clearSaveFailed)
  const setGroupsSaving = useStore((s) => s.setGroupsSaving)
  const setGroupsSaved = useStore((s) => s.setGroupsSaved)
  const setGroupsSaveFailed = useStore((s) => s.setGroupsSaveFailed)
  const setSourcePriorities = useStore((s) => s.setSourcePriorities)
  const setGroupInactive = useStore((s) => s.setGroupInactive)
  const setPriorityDefaults = useStore((s) => s.setPriorityDefaults)
  const changePath = useStore((s) => s.changePath)
  const deletePath = useStore((s) => s.deletePath)

  const { sourcePriorities, saveState } = sourcePrioritiesData
  const { groups: savedGroups, saveState: groupsSaveState } = priorityGroupsData
  const { defaults: priorityDefaults, saveState: defaultsSaveState } =
    priorityDefaultsData
  const { paths: overridePathsList, saveState: overridesSaveState } =
    priorityOverridesData
  const effectiveFallbackMs =
    typeof priorityDefaults.fallbackMs === 'number' &&
    priorityDefaults.fallbackMs > 0
      ? priorityDefaults.fallbackMs
      : 15000
  const overridePathsSet = useMemo(
    () => new Set(overridePathsList),
    [overridePathsList]
  )

  const [fallbackDraft, setFallbackDraft] = useState<string>(
    String(effectiveFallbackMs)
  )
  const [fallbackFocused, setFallbackFocused] = useState(false)
  // The blur handler schedules setFallbackFocused(false) and the async
  // commit in the same batch. If a websocket echo for PRIORITYDEFAULTS
  // (from an in-flight group save that still carries the old fallback)
  // lands between those two, the useEffect below would resync the draft
  // to the stale store value — users saw their edit revert to 15000
  // right after typing 5000. Track the in-flight commit separately so
  // the draft does not get overwritten until the commit settles.
  const fallbackCommitInFlight = useRef(false)
  useEffect(() => {
    if (fallbackFocused || fallbackCommitInFlight.current) return
    setFallbackDraft(String(effectiveFallbackMs))
  }, [effectiveFallbackMs, fallbackFocused])

  const commitFallbackDraft = async () => {
    const next = Number(fallbackDraft)
    if (!Number.isFinite(next) || next <= 0) {
      setFallbackDraft(String(effectiveFallbackMs))
      return
    }
    if (next === effectiveFallbackMs) return
    const previous = effectiveFallbackMs
    fallbackCommitInFlight.current = true
    setPriorityDefaults({ fallbackMs: next })
    try {
      const res = await fetch(`${window.serverRoutesPrefix}/priorityDefaults`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallbackMs: next })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.warn('Failed to save fallback default:', err)
      setPriorityDefaults({ fallbackMs: previous })
      setFallbackDraft(String(previous))
      setSaveFailed()
      setTimeout(() => clearSaveFailed(), 5000)
    } finally {
      fallbackCommitInFlight.current = false
    }
  }

  const [sourcesData, setSourcesData] = useState<SourcesData | null>(null)
  const [deviceIdentityIndex, setDeviceIdentityIndex] =
    useState<DeviceIdentityIndex>({
      canNameBySourceRef: new Map(),
      identityByCanName: new Map()
    })
  const [pathSourceMeta, setPathSourceMeta] = useState<
    Map<string, { pgn?: number; sentence?: string }>
  >(new Map())
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Merge the user's in-progress DnD edits (stored in the slice) with the
  // reconciled live groups. Reconciled gives us the canonical group identity
  // and membership; the slice supplies the user's latest ordering override.
  // Look up saved state via matchedSavedId, not live id — the live id
  // changes the moment a new source joins the group, while matchedSavedId
  // tracks the persisted group across membership changes.
  const displayed = useMemo(() => {
    const savedById = new Map(savedGroups.map((g) => [g.id, g]))
    return reconciled.map((g) => {
      const saved =
        g.matchedSavedId !== null ? savedById.get(g.matchedSavedId) : undefined
      // For an unranked group the user might still have toggled
      // Deactivate, which writes a stub saved entry under the live id
      // (sources: [], inactive: true). reconcileGroups can't match that
      // to anything via overlap, so fall back to a direct live-id
      // lookup to surface the pending inactive state.
      const stub =
        !saved && g.matchedSavedId === null ? savedById.get(g.id) : undefined
      const inactive = saved?.inactive ?? stub?.inactive ?? false
      if (!saved) return { ...g, inactive }
      const liveSet = new Set(g.sources)
      const editedOrder = saved.sources.filter((src) => liveSet.has(src))
      const newcomers = g.sources.filter((src) => !editedOrder.includes(src))
      return {
        ...g,
        sources: [...editedOrder, ...newcomers],
        inactive
      }
    })
  }, [reconciled, savedGroups])

  // Ungrouped overrides: paths in sourcePriorities whose path is not in any
  // derived group's path list. These include plugin-only paths or paths with
  // a single source (user may have pre-configured).
  const groupPathSet = useMemo(() => {
    const all = new Set<string>()
    for (const g of reconciled) for (const p of g.paths) all.add(p)
    return all
  }, [reconciled])

  const ungroupedOverrides = useMemo(
    () =>
      sourcePriorities
        .map((pp, index) => ({ pp, index }))
        .filter(({ pp }) => pp.path && !groupPathSet.has(pp.path))
        .sort((a, b) => a.pp.path.localeCompare(b.pp.path)),
    [sourcePriorities, groupPathSet]
  )

  // A group is "unranked" when the user has not saved a ranking AND has not
  // yet dragged anything locally (i.e. there is no entry for it in the slice).
  const savedIds = useMemo(
    () => new Set(savedGroups.map((g) => g.id)),
    [savedGroups]
  )
  const pathParam = searchParams.get('path')
  useEffect(() => {
    if (!pathParam) return
    const alreadyExists = sourcePriorities.some((pp) => pp.path === pathParam)
    if (!alreadyExists) {
      changePath(sourcePriorities.length, pathParam)
    }
    setSearchParams({}, { replace: true })
  }, [pathParam, sourcePriorities, changePath, setSearchParams])

  useEffect(() => {
    fetch('/signalk/v1/api/sources', { credentials: 'include' })
      .then((r) => r.json())
      .then(setSourcesData)
      .catch((err) => console.warn('Failed to load sources data:', err))
    fetch('/signalk/v1/api/vessels/self', { credentials: 'include' })
      .then((r) => r.json())
      .then((tree) => setPathSourceMeta(extractPathSourceMeta(tree)))
      .catch((err) => console.warn('Failed to load vessel tree:', err))
    fetchDeviceIdentities((ids) =>
      setDeviceIdentityIndex(indexDeviceIdentities(ids))
    )
  }, [])

  const hasIncompleteEntries = useMemo(
    () =>
      sourcePriorities.some(
        (pp) => !pp.path || pp.priorities.some((prio) => !prio.sourceRef)
      ),
    [sourcePriorities]
  )

  const isSaving = !!(
    saveState.isSaving ||
    groupsSaveState.isSaving ||
    defaultsSaveState.isSaving ||
    overridesSaveState.isSaving
  )

  // Per-group dirty detection: a group is dirty if its ranking differs from
  // the saved one, or if any of its paths has a pending override edit.
  // Use matchedSavedId so that a new source joining the live group does
  // not by itself flip the group to "Unsaved" — the existing ranking is
  // preserved as a prefix, the newcomer is appended, and the explicit
  // "N new sources" badge tells the user it needs a Save.
  const dirtyByGroupId = useMemo(() => {
    const map = new Map<string, boolean>()
    const savedById = new Map(savedGroups.map((g) => [g.id, g.sources]))
    for (const g of displayed) {
      const saved =
        g.matchedSavedId !== null ? savedById.get(g.matchedSavedId) : undefined
      // Compare only the ordering of sources that are common to both,
      // then also flip dirty when newcomers are present so the user can
      // click Save to accept the appended sources without having to
      // drag anything first.
      const liveOrder = g.sources.filter(
        (src) => !g.newcomerSources.includes(src)
      )
      const orderingDirty =
        !saved ||
        saved.length !== liveOrder.length ||
        saved.some((src, i) => src !== liveOrder[i])
      const groupDirty = orderingDirty || g.newcomerSources.length > 0
      map.set(g.id, groupDirty)
    }
    return map
  }, [displayed, savedGroups])

  // Include groups whose displayed ranking differs from what is saved.
  // Without this, the auto-derived groups that appear after a reset (or
  // on first visit before anything has ever been saved) leave the
  // footer Save button greyed out — users had to make a fake edit to
  // un-grey it before they could persist the default ordering.
  const hasUnsavedGroupRanking = useMemo(() => {
    for (const dirty of dirtyByGroupId.values()) if (dirty) return true
    return false
  }, [dirtyByGroupId])

  const isDirty =
    saveState.dirty ||
    groupsSaveState.dirty ||
    defaultsSaveState.dirty ||
    overridesSaveState.dirty ||
    hasUnsavedGroupRanking

  const buildSavePayload = useCallback(() => {
    // If the user clicks "Save changes" with the Fallback input still
    // focused (typing, no blur yet), the store's priorityDefaults still
    // holds the old value. Resolve from the draft input first so the
    // save payload carries what the user sees on screen, not the stale
    // store value. A blank or invalid draft falls back to the store.
    const draftNum = Number(fallbackDraft)
    const pendingFallbackMs =
      Number.isFinite(draftNum) && draftNum > 0 ? draftNum : effectiveFallbackMs
    // Build the per-path overrides map. Group rankings are NOT fanned
    // out here — the server-side engine resolves them dynamically per
    // delta. Only paths with an explicit user override (path-level row
    // edited or fan-out checkbox set) appear in this map.
    // Normalise timeouts: rank 1 is always `timeout: 0`, -1 stays -1
    // (disabled), else a positive number.
    const overrides: Record<string, SourcePriority[]> = sourcePriorities.reduce<
      Record<string, SourcePriority[]>
    >((acc, pp) => {
      if (!pp.path) return acc
      if (!overridePathsSet.has(pp.path)) return acc
      const valid = pp.priorities
        .filter((p) => p.sourceRef)
        .map((p, i) => {
          const raw = Number(p.timeout)
          const coerced = Number.isFinite(raw) ? raw : 0
          // Disabled (-1) wins at every rank: forcing the rank-1 row to
          // 0 would silently re-enable a source the user explicitly
          // turned off. Otherwise the rank-1 row carries no fallback
          // window of its own; subsequent rows fall back after their
          // configured timeout, defaulting to pendingFallbackMs.
          const timeout =
            coerced === -1
              ? -1
              : i === 0
                ? 0
                : coerced > 0
                  ? coerced
                  : pendingFallbackMs
          return { sourceRef: p.sourceRef, timeout }
        })
      if (valid.length > 0) acc[pp.path] = valid
      return acc
    }, {})

    return {
      groups: displayed.map((g) => ({
        id: g.id,
        sources: g.sources,
        ...(g.inactive ? { inactive: true } : {})
      })),
      overrides,
      defaults: { fallbackMs: pendingFallbackMs }
    }
  }, [
    displayed,
    sourcePriorities,
    overridePathsSet,
    effectiveFallbackMs,
    fallbackDraft
  ])

  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset all source priorities, aliases, groups and overrides?\n\n' +
        'This cannot be undone. The priorities.json file is removed; ' +
        'other settings are unaffected.'
    )
    if (!confirmed) return
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await fetch(`${window.serverRoutesPrefix}/priorities`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Mirror the optimistic store sync used in handleSave so the page
      // reflects the empty state immediately, instead of waiting for a
      // websocket roundtrip or page reload.
      useStore.getState().setPriorityGroupsFromServer([])
      useStore.getState().setPriorityDefaultsFromServer({})
      useStore.getState().setPriorityOverridesFromServer([])
      setSourcePriorities({})
    } catch (e) {
      setResetError(
        `Reset failed: ${(e as Error).message}. You can also delete priorities.json on the server and restart.`
      )
    } finally {
      setResetBusy(false)
    }
  }, [setSourcePriorities])

  const handleSave = useCallback(async () => {
    setGroupsSaving()
    setSaving()
    const payload = buildSavePayload()
    try {
      const res = await fetch(`${window.serverRoutesPrefix}/priorities`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('save failed')
      // Reflect the save we just made in the local store before the
      // WS echo arrives. Otherwise savedGroups lags by one async tick
      // and dirty-detection flips on then off, which confuses the UI.
      useStore.getState().setPriorityGroupsFromServer(payload.groups)
      useStore.getState().setPriorityDefaultsFromServer(payload.defaults)
      // The override-paths list is implicit in the payload's overrides
      // map under the group-aware engine: every path with an entry is
      // an override.
      useStore
        .getState()
        .setPriorityOverridesFromServer(Object.keys(payload.overrides))
      setGroupsSaved()
      setSaved()
      setSourcePriorities(payload.overrides)
    } catch (err) {
      console.error('Failed to save priorities:', err)
      setGroupsSaveFailed()
      setSaveFailed()
      setTimeout(() => clearSaveFailed(), 5000)
    }
  }, [
    buildSavePayload,
    setGroupsSaving,
    setGroupsSaved,
    setGroupsSaveFailed,
    setSaving,
    setSaved,
    setSaveFailed,
    clearSaveFailed,
    setSourcePriorities
  ])

  return (
    <>
      <Card>
        <Card.Header className="d-flex align-items-center justify-content-between">
          <span>Source Priorities</span>
          <div className="d-flex align-items-center gap-2">
            <Button
              size="sm"
              variant="outline-danger"
              onClick={handleReset}
              disabled={resetBusy}
              title="Delete all priority state (priorities.json) and start fresh"
            >
              {resetBusy ? 'Resetting…' : 'Reset all priorities'}
            </Button>
            <Button
              size="sm"
              variant="link"
              className="pg-help-toggle"
              onClick={() => setHelpOpen((v) => !v)}
              aria-expanded={helpOpen}
            >
              <FontAwesomeIcon
                icon={helpOpen ? faChevronDown : faChevronRight}
                className="me-1"
              />
              <FontAwesomeIcon icon={faCircleInfo} className="me-1" />
              {helpOpen ? 'Hide help' : 'Show help'}
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {resetError && (
            <Alert
              variant="danger"
              dismissible
              onClose={() => setResetError(null)}
            >
              {resetError}
            </Alert>
          )}
          {helpOpen && (
            <Alert>
              <p>
                Signal K groups sources that share paths. Inside each group,
                drag the sources into your preferred order — the top one wins
                every shared path while it is sending. Each row below the top
                waits <b>Fallback after</b> milliseconds of silence from the
                source currently winning before it may take over.
              </p>
              <div style={{ margin: '12px 0' }}>
                <TimelineDiagram />
              </div>
              <p>
                <b>Example:</b> two GPS receivers both publishing{' '}
                <code>navigation.position</code> and a few related paths land in
                one group. Drag Furuno above Garmin and every shared path
                prefers Furuno. Add a <b>path-level override</b> only when you
                want a specific path to deviate — e.g. use Garmin&apos;s
                magnetic variation if its WMM model is better.
              </p>
              <p>
                The top row is always &quot;preferred&quot; — it has no Fallback
                value because nothing ranks higher. Uncheck <b>Enabled</b> on an
                override row to block a source on that path entirely. Data from
                unlisted sources can only take over after the configured
                Fallback timeout ({Math.round(effectiveFallbackMs / 1000)}{' '}
                seconds by default) of silence from every listed source.
              </p>
              <p>
                A blue <b>Plugin</b> badge on a source row means the source is a
                Signal K plugin (e.g. <code>derived-data</code>) emitting deltas
                directly into the server, not a device on a bus. Rank these
                explicitly — a derived or fallback plugin usually belongs at the
                bottom, an authoritative one at the top. If your plugin also
                injects N2K frames that come back through your gateway, you may
                see an extra row from the gateway address — rank that one
                explicitly too.
              </p>
              <p>
                If you feed the bus through a Yacht Devices YDEN-02 over UDP you
                may see ghost sources — a gateway-class device showing up as the
                source for PGNs it does not physically transmit. The same setup
                over TCP, or a directly attached CAN adapter, does not have this
                problem. Trash the ghost row once it goes Offline, or switch the
                connection to TCP for accurate attribution.
              </p>
              <p>
                Debug by activating <b>signalk-server:sourcepriorities</b> in{' '}
                <a
                  href="./#/serverConfiguration/log"
                  className="text-decoration-none"
                >
                  Server Log
                </a>
                .
              </p>
            </Alert>
          )}

          <div className="pg-default-fallback">
            <label
              htmlFor="pg-default-fallback-input"
              className="form-label small text-muted mb-1"
            >
              Default <b>Fallback after</b> (ms) — applied to every group when
              fanning out a saved ranking. Path-level overrides can still
              deviate.
            </label>
            <div className="d-flex align-items-center gap-2">
              <input
                id="pg-default-fallback-input"
                type="number"
                min={1}
                step={500}
                className="form-control form-control-sm pg-default-fallback-input"
                value={fallbackDraft}
                onChange={(e) => setFallbackDraft(e.target.value)}
                onFocus={() => setFallbackFocused(true)}
                onBlur={() => {
                  setFallbackFocused(false)
                  commitFallbackDraft()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setFallbackDraft(String(effectiveFallbackMs))
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
              <span className="text-muted small">ms</span>
            </div>
          </div>

          {displayed.length === 0 && (
            <Alert variant="info">
              No multi-source paths detected yet. When more than one source
              starts publishing the same path, a group card will appear here.
            </Alert>
          )}

          {displayed.map((group) => (
            <PriorityGroupCard
              key={group.id}
              group={group}
              hasLocalEdit={savedIds.has(group.id)}
              multiSourcePaths={multiSourcePaths}
              sourcePriorities={sourcePriorities}
              sourcesData={sourcesData}
              pathSourceMeta={pathSourceMeta}
              isSaving={isSaving}
              overridePaths={overridePathsSet}
              dirty={
                !!dirtyByGroupId.get(group.id) ||
                groupsSaveState.dirty ||
                overridesSaveState.dirty ||
                saveState.dirty
              }
              fallbackMs={effectiveFallbackMs}
              onToggleActive={(inactive) =>
                setGroupInactive(group.id, inactive)
              }
              deviceIdentityIndex={deviceIdentityIndex}
            />
          ))}

          {ungroupedOverrides.length > 0 && (
            <Card className="pg-card pg-card-unranked mt-3">
              <Card.Header>
                <strong>Ungrouped path overrides</strong>
                <span className="text-muted small ms-2">
                  {ungroupedOverrides.length} path
                  {ungroupedOverrides.length === 1 ? '' : 's'}
                </span>
              </Card.Header>
              <Card.Body>
                {ungroupedOverrides.map(({ pp, index }) => (
                  <div key={pp.path} className="pg-override-row">
                    <div className="pg-override-path d-flex justify-content-between align-items-center">
                      <code>{pp.path}</code>
                      <Button
                        size="sm"
                        variant="link"
                        className="text-danger"
                        onClick={() => deletePath(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    <PrefsEditor
                      path={pp.path}
                      priorities={pp.priorities}
                      pathIndex={index}
                      isSaving={isSaving}
                      sourcesData={sourcesData}
                      multiSourcePaths={multiSourcePaths}
                    />
                  </div>
                ))}
              </Card.Body>
            </Card>
          )}

          <AddUngroupedOverride
            availablePaths={Object.keys(multiSourcePaths)}
            groupPathSet={groupPathSet}
            configuredPaths={new Set(sourcePriorities.map((p) => p.path))}
            onAdd={(path) => changePath(sourcePriorities.length, path)}
          />
        </Card.Body>
        <Card.Footer>
          <Button
            size="sm"
            variant="primary"
            disabled={
              !isDirty ||
              isSaving ||
              !saveState.timeoutsOk ||
              hasIncompleteEntries
            }
            onClick={handleSave}
          >
            <FontAwesomeIcon icon={faFloppyDisk} /> Save all changes
          </Button>
          {(saveState.saveFailed || groupsSaveState.saveFailed) &&
            ' Saving priorities settings failed!'}
          {!saveState.timeoutsOk && (
            <span style={{ paddingLeft: '10px' }}>
              <Badge bg="danger">Error</Badge>
              {' Timeout values must be positive numbers (milliseconds).'}
            </span>
          )}
          {hasIncompleteEntries && (
            <span style={{ paddingLeft: '10px' }}>
              <Badge bg="warning" text="dark">
                Warning
              </Badge>
              {' All entries must have a path and source reference set.'}
            </span>
          )}
        </Card.Footer>
      </Card>
    </>
  )
}

interface AddUngroupedOverrideProps {
  availablePaths: string[]
  groupPathSet: Set<string>
  configuredPaths: Set<string>
  onAdd: (path: string) => void
}

const AddUngroupedOverride: React.FC<AddUngroupedOverrideProps> = ({
  availablePaths,
  groupPathSet,
  configuredPaths,
  onAdd
}) => {
  const [value, setValue] = useState('')
  const options = useMemo(
    () =>
      availablePaths
        .filter(
          (p) =>
            p !== 'notifications' &&
            !p.startsWith('notifications.') &&
            !groupPathSet.has(p) &&
            !configuredPaths.has(p)
        )
        .sort((a, b) => a.localeCompare(b)),
    [availablePaths, groupPathSet, configuredPaths]
  )
  if (options.length === 0) return null
  return (
    <div className="mt-3">
      <label className="form-label small text-muted">
        Add an ungrouped path-level override
      </label>
      <select
        className="form-select form-select-sm pg-add-override-select"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (!v) return
          onAdd(v)
          setValue('')
        }}
      >
        <option value="">Select a path…</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SourcePriorities
