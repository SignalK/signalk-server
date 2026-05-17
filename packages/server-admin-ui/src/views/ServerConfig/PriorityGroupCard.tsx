import React, { useMemo, useState } from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical } from '@fortawesome/free-solid-svg-icons/faGripVertical'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  useStore,
  useSourceStatus,
  useSourceStatusLoaded,
  useLivePreferredSources
} from '../../store'
import { getWebSocketService } from '../../hooks/useWebSocket'
import type { ReconciledGroup } from '../../utils/sourceGroups'
import {
  canonicaliseSourceRef,
  isN2kSource,
  isPluginSource,
  type SourcesData
} from '../../utils/sourceLabels'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import PrefsEditor from './PrefsEditor'
import type { PathPriority } from '../../store/types'

type PathKinds = Map<string, string[]>

interface SortableSourceRowProps {
  sourceRef: string
  index: number
  label: string
  secondaryLabel?: string | null
  wonPaths: string[]
  pathsPublished: Set<string>
  highlighted: boolean
  dimmed: boolean
  isOffline: boolean
  isNewcomer: boolean
  isPlugin: boolean
  canRemove: boolean
  onSelect: () => void
  onRemove?: () => void
  deviceDot?: { color: string; canName: string }
  deviceLabel?: string
}

const SortableSourceRow: React.FC<SortableSourceRowProps> = ({
  sourceRef,
  index,
  label,
  secondaryLabel,
  wonPaths,
  pathsPublished,
  highlighted,
  dimmed,
  isOffline,
  isNewcomer,
  isPlugin,
  canRemove,
  onSelect,
  onRemove,
  deviceDot,
  deviceLabel
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: sourceRef })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : dimmed ? 0.45 : 1,
    boxShadow: isDragging ? '0 6px 14px rgba(0,0,0,0.12)' : 'none',
    zIndex: isDragging ? 2 : undefined
  }

  const wins = wonPaths.length
  const publishes = pathsPublished.size

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`pg-source-row ${highlighted ? 'is-highlighted' : ''}`}
      aria-label={`Source ${label}, rank ${index + 1}`}
    >
      <button
        type="button"
        className="pg-drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}`}
        // Without touch-action: none, iOS Safari treats a vertical
        // drag on the handle as page scroll and DnD never starts.
        style={{ touchAction: 'none' }}
      >
        <FontAwesomeIcon icon={faGripVertical} />
      </button>
      <button
        type="button"
        className="pg-source-select"
        onClick={onSelect}
        aria-pressed={highlighted}
      >
        <span className="pg-rank">{index + 1}.</span>
        {deviceDot && (
          <span
            className="pg-device-dot"
            title={`Same physical device as another row in this group (CAN Name ${deviceDot.canName})`}
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              marginRight: 6,
              background: deviceDot.color,
              border: '1px solid rgba(0,0,0,0.2)'
            }}
          />
        )}
        <span className="pg-source-name">
          <span className="pg-source-label">{label}</span>
          {secondaryLabel && secondaryLabel !== label && (
            <span
              className="pg-source-canname text-muted"
              title={secondaryLabel}
            >
              {secondaryLabel}
            </span>
          )}
        </span>
        <span className="pg-source-meta">
          {deviceLabel && (
            <span
              className="pg-device-label text-muted small"
              style={{ fontStyle: 'italic' }}
              title="Device model / manufacturer resolved from the N2K ProductInformation PGN"
            >
              ({deviceLabel})
            </span>
          )}
          {isOffline && (
            <Badge
              bg="secondary"
              style={{ fontSize: '0.7em' }}
              title="No frames seen from this source in the last 90s — its rank is preserved so it auto-recovers when it returns."
            >
              Offline
            </Badge>
          )}
          {isNewcomer && (
            <Badge
              bg="warning"
              text="dark"
              style={{ fontSize: '0.7em' }}
              title="This source started publishing a path in this group after the ranking was saved. Drag it where you want it and Save to include it."
            >
              New
            </Badge>
          )}
          {isPlugin && (
            <Badge
              bg="info"
              style={{ fontSize: '0.7em' }}
              title="This source is a Signal K plugin emitting deltas directly into the server (no bus address). Rank it explicitly — a derived/fallback plugin usually belongs at the bottom, an authoritative one at the top."
            >
              Plugin
            </Badge>
          )}
          <span className="pg-source-stats text-muted small">
            wins {wins}/{publishes}
          </span>
        </span>
      </button>
      {canRemove && onRemove && (
        <button
          type="button"
          className="pg-source-remove"
          aria-label={`Remove ${label} from this group`}
          title="Remove this source from the group. It will be re-added automatically if it starts publishing again."
          onClick={onRemove}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      )}
    </li>
  )
}

interface PathRowProps {
  path: string
  kinds: string[]
  isOverride: boolean
  publisherCount: number
  groupSize: number
  highlighted: boolean
  dimmed: boolean
  onSelect: () => void
}

const PathRow: React.FC<PathRowProps> = ({
  path,
  kinds,
  isOverride,
  publisherCount,
  groupSize,
  highlighted,
  dimmed,
  onSelect
}) => {
  const classes = [
    'pg-path-row',
    isOverride ? 'is-override' : '',
    highlighted ? 'is-highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const style = { opacity: dimmed ? 0.45 : 1 }
  // Not every source in a group publishes every path. Surface the ratio so
  // users can see at a glance which paths are shared by how many sources.
  const partial = publisherCount < groupSize
  return (
    <li className={classes} style={style}>
      <button
        type="button"
        className="pg-path-row-button"
        onClick={onSelect}
        aria-pressed={highlighted}
      >
        <code>{path}</code>
        <span
          className={`pg-path-publishers ${partial ? 'is-partial' : ''}`}
          title={`${publisherCount} of ${groupSize} sources in this group publish this path`}
        >
          {publisherCount}/{groupSize}
        </span>
        {kinds.length > 0 && (
          <span className="pg-path-kinds">
            {kinds.map((k) => (
              <span key={k} className="pg-path-kind">
                {k}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  )
}

export interface DeviceIdentityIndex {
  canNameBySourceRef: Map<string, string>
  identityByCanName: Map<
    string,
    {
      canName: string
      manufacturerCode?: string
      modelId?: string
      productCode?: number
      sourceRefs: string[]
    }
  >
}

interface PriorityGroupCardProps {
  group: ReconciledGroup
  hasLocalEdit: boolean
  multiSourcePaths: Record<string, string[]>
  sourcePriorities: PathPriority[]
  sourcesData: SourcesData | null
  pathSourceMeta: Map<string, { pgn?: number; sentence?: string }>
  isSaving: boolean
  overridePaths: Set<string>
  dirty: boolean
  fallbackMs: number
  onToggleActive: (inactive: boolean) => void
  deviceIdentityIndex?: DeviceIdentityIndex
}

const PriorityGroupCard: React.FC<PriorityGroupCardProps> = ({
  group,
  hasLocalEdit,
  multiSourcePaths,
  sourcePriorities,
  sourcesData,
  pathSourceMeta,
  isSaving,
  overridePaths,
  dirty,
  fallbackMs,
  onToggleActive,
  deviceIdentityIndex
}) => {
  const setGroupSources = useStore((s) => s.setGroupSources)
  const setPathPriorities = useStore((s) => s.setPathPriorities)
  const addPriorityOverride = useStore((s) => s.addPriorityOverride)
  const removePriorityOverride = useStore((s) => s.removePriorityOverride)
  const deletePath = useStore((s) => s.deletePath)
  const suppressNewcomerInGroup = useStore((s) => s.suppressNewcomerInGroup)
  const sourceStatus = useSourceStatus()
  const livePreferredSourcesRaw = useLivePreferredSources()
  const sourceStatusLoaded = useSourceStatusLoaded()
  const { getDisplayName, getDisplayParts } = useSourceAliases()

  const [expanded, setExpanded] = useState(false)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // PointerSensor handles mouse + most pen/pointer-aware browsers, but
  // iOS Safari maps touch into pointer events tied to scroll gestures
  // and the drag never starts. A separate TouchSensor with a hold delay
  // makes touch DnD reliable and keeps a tap from being misread as a
  // drag. The drag handle also sets touch-action: none so the browser
  // doesn't preempt the gesture for scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // Paths in this group that publish >=2 of the group's sources.
  const groupPathSet = useMemo(() => new Set(group.paths), [group.paths])

  const newcomerSet = useMemo(
    () => new Set(group.newcomerSources),
    [group.newcomerSources]
  )

  // Lookup from path → configured priorities, for paths within this group.
  // Prefer entries with a populated rank-1 sourceRef when duplicates exist.
  const pathPrioritiesByPath = useMemo(() => {
    const map = new Map<
      string,
      (typeof sourcePriorities)[number]['priorities']
    >()
    for (const pp of sourcePriorities) {
      if (!groupPathSet.has(pp.path)) continue
      const existing = map.get(pp.path)
      const existingHasRankOne = !!existing?.[0]?.sourceRef
      const incomingHasRankOne = !!pp.priorities?.[0]?.sourceRef
      if (!existing || (!existingHasRankOne && incomingHasRankOne)) {
        map.set(pp.path, pp.priorities)
      }
    }
    return map
  }, [sourcePriorities, groupPathSet])

  // Short descriptor per path (PGNs / 0183 sentences).
  const pathKinds: PathKinds = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const path of group.paths) {
      const publishers = multiSourcePaths[path] ?? []
      const pgns = new Set<number>()
      const sentences = new Set<string>()
      for (const ref of publishers) {
        const meta = pathSourceMeta.get(`${path}::${ref}`)
        if (!meta) continue
        if (meta.pgn !== undefined) pgns.add(meta.pgn)
        if (meta.sentence) sentences.add(meta.sentence)
      }
      const parts: string[] = []
      for (const pgn of pgns) parts.push(`PGN ${pgn}`)
      for (const sentence of sentences) parts.push(sentence)
      map.set(path, parts)
    }
    return map
  }, [group.paths, multiSourcePaths, pathSourceMeta])

  // Live engine winner per path for the self vessel — the only context
  // priority groups apply to. Server keys are `${context}\0${path}` so
  // we strip the prefix matching skSelf and surface a path → winner
  // map. Used below to render `wins X/Y` directly from the engine's
  // actual choice instead of recomputing it client-side; without this
  // the rank-1 source's win counter is wrong any time the engine has
  // fallen back to rank-2 because rank-1 went silent past its timeout.
  const winnerByPath = useMemo(() => {
    const map = new Map<string, string>()
    const skSelf = getWebSocketService().getSkSelf()
    if (skSelf) {
      const ctxPrefix = skSelf + '\0'
      for (const [composite, src] of Object.entries(livePreferredSourcesRaw)) {
        if (!composite.startsWith(ctxPrefix)) continue
        const path = composite.slice(ctxPrefix.length)
        if (groupPathSet.has(path)) map.set(path, src)
      }
    }
    return map
  }, [livePreferredSourcesRaw, groupPathSet])

  // Inverse index: source → paths it wins, and source → paths it publishes.
  const { pathsWonBySource, pathsPublishedBySource } = useMemo(() => {
    const wins = new Map<string, string[]>()
    const publishes = new Map<string, Set<string>>()
    for (const source of group.sources) {
      wins.set(source, [])
      publishes.set(source, new Set())
    }
    for (const path of group.paths) {
      const publishers = multiSourcePaths[path] ?? []
      for (const ref of publishers) {
        publishes.get(ref)?.add(path)
      }
      const winner = winnerByPath.get(path)
      // Canonicalise the engine's winner before bumping the count so a
      // numeric-form delivery on a useCanName=false provider still maps
      // back onto the group's canName-form source list.
      const canonicalWinner = winner
        ? canonicaliseSourceRef(winner, sourcesData)
        : undefined
      if (canonicalWinner) wins.get(canonicalWinner)?.push(path)
    }
    for (const list of wins.values()) list.sort()
    return { pathsWonBySource: wins, pathsPublishedBySource: publishes }
  }, [group.sources, group.paths, multiSourcePaths, winnerByPath, sourcesData])

  // Given a path, which group sources publish it?
  const publishersByPath = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const path of group.paths) {
      const publishers = new Set(multiSourcePaths[path] ?? [])
      const onlyGroup = new Set<string>()
      for (const ref of publishers)
        if (group.sources.includes(ref)) onlyGroup.add(ref)
      map.set(path, onlyGroup)
    }
    return map
  }, [group.paths, group.sources, multiSourcePaths])

  // Override rows (priorities entries for paths flagged as overrides).
  const overrideRows = useMemo(
    () =>
      sourcePriorities
        .map((pp, index) => ({ pp, index }))
        .filter(
          ({ pp }) => groupPathSet.has(pp.path) && overridePaths.has(pp.path)
        )
        .sort((a, b) => a.pp.path.localeCompare(b.pp.path)),
    [sourcePriorities, groupPathSet, overridePaths]
  )

  const handleSelectSource = (ref: string) => {
    setSelectedSource((prev) => (prev === ref ? null : ref))
    setSelectedPath(null)
  }

  const handleSelectPath = (path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path))
    setSelectedSource(null)
  }

  const handleRemoveSource = (sourceRef: string, label: string) => {
    const ok = window.confirm(
      `Remove ${label} from this priority group?\n\n` +
        'Any path-level overrides in this group that mention the source ' +
        'will be pruned of it as well. Click Save afterwards to persist. ' +
        "If this source is still publishing one of the group's paths it " +
        'will reappear as a new source — restart the server (or stop the ' +
        'source for good) to drop it permanently.'
    )
    if (!ok) return
    // Always evict server-side, regardless of saved-vs-newcomer
    // status. The user's intent is "this source is gone", and a
    // saved-but-Offline source whose cache leaves are still around
    // (because deltacache holds the LAST seen value indefinitely)
    // would otherwise reappear in the Data Browser, in newcomer lists
    // after re-Save, and in any other consumer that walks the cache.
    // Pick the endpoint by source type so an N2K device also gets
    // its bus-address state cleared. Also suppress the entry in the
    // local store so the row disappears instantly — without this the
    // dnd list briefly bounces while the eviction round-trips.
    suppressNewcomerInGroup(group.id, sourceRef)
    const endpoint = isN2kSource(sourceRef, sourcesData)
      ? 'n2kRemoveSource'
      : 'removeSource'
    void fetch(
      `${window.serverRoutesPrefix}/${endpoint}?sourceRef=${encodeURIComponent(sourceRef)}`,
      { method: 'DELETE', credentials: 'include' }
    ).catch((err) => {
      console.warn(`Failed to evict source ${sourceRef}:`, err)
    })
    // Read sources from the LIVE store, not the render-time `group.sources`
    // prop. Two trash clicks in quick succession would otherwise resolve
    // the second one against a snapshot that still contains the source
    // the first click just removed — setGroupSources would then write
    // back the older source list and undo the prior deletion. When the
    // store has no entry yet (group never edited locally), fall back to
    // the SAVED-only subset of the displayed list — using the displayed
    // list directly would silently promote every visible newcomer to a
    // saved member on the next setGroupSources call.
    const liveGroups = useStore.getState().priorityGroupsData.groups
    const newcomerLookup = new Set(group.newcomerSources)
    const liveSources =
      liveGroups.find((g) => g.id === group.id)?.sources ??
      group.sources.filter((src) => !newcomerLookup.has(src))
    setGroupSources(
      group.id,
      liveSources.filter((src) => src !== sourceRef)
    )
    // Plan the per-path mutations first against the render-time
    // snapshot, then apply them by resolving each path's current index
    // from the live store right before the call. Walking the snapshot
    // back-to-front and trusting indices to stay valid breaks the
    // moment a deletePath triggers a re-render mid-loop or another
    // tab races a delete in.
    const pathsToDelete: string[] = []
    const pathsToUpdate: Array<{
      path: string
      remaining: { sourceRef: string; timeout: string | number }[]
    }> = []
    for (const pp of sourcePriorities) {
      if (!groupPathSet.has(pp.path)) continue
      if (!overridePaths.has(pp.path)) continue
      if (!pp.priorities.some((p) => p.sourceRef === sourceRef)) continue
      const remaining = pp.priorities.filter((p) => p.sourceRef !== sourceRef)
      if (remaining.length === 0) {
        pathsToDelete.push(pp.path)
      } else {
        pathsToUpdate.push({ path: pp.path, remaining })
      }
    }
    for (const { path, remaining } of pathsToUpdate) {
      setPathPriorities(path, remaining)
    }
    for (const path of pathsToDelete) {
      removePriorityOverride(path)
      const live = useStore.getState().sourcePrioritiesData.sourcePriorities
      const idx = live.findIndex((pp) => pp.path === path)
      if (idx !== -1) deletePath(idx)
    }
    if (selectedSource === sourceRef) setSelectedSource(null)
  }

  const handleToggleOverride = (path: string) => {
    if (overridePaths.has(path)) {
      // Remove override: drop from overrides list AND delete the stored row
      // so the next save doesn't resurrect it via fan-out comparison.
      removePriorityOverride(path)
      const existingIdx = sourcePriorities.findIndex((pp) => pp.path === path)
      if (existingIdx !== -1) deletePath(existingIdx)
      return
    }
    addPriorityOverride(path)
    // Seed the new override using the existing group order so the
    // current winner does not silently flip on the moment the user
    // clicks "Override this path". Reordering is the next deliberate
    // action the user takes — they pick the rank-1 source explicitly.
    const publishers = new Set(multiSourcePaths[path] ?? [])
    const groupOrderForPath = group.sources.filter((src) => publishers.has(src))
    const priorities = groupOrderForPath.map((sourceRef, i) => ({
      sourceRef,
      timeout: i === 0 ? 0 : fallbackMs
    }))
    setPathPriorities(path, priorities)
    setSelectedPath(path)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = group.sources.indexOf(String(active.id))
    const to = group.sources.indexOf(String(over.id))
    if (from === -1 || to === -1 || from === to) return
    const sources = [...group.sources]
    const [moved] = sources.splice(from, 1)
    sources.splice(to, 0, moved)
    setGroupSources(group.id, sources)
  }

  const isRanked = group.matchedSavedId !== null

  // Which sources/paths are highlighted / dimmed based on the current selection?
  const activeSource = selectedSource
  const activePath = selectedPath
  const highlightedPathsFromSource = activeSource
    ? new Set(pathsPublishedBySource.get(activeSource) ?? [])
    : null
  const winningPathsFromSource = activeSource
    ? new Set(pathsWonBySource.get(activeSource) ?? [])
    : null
  const highlightedSourcesFromPath = activePath
    ? (publishersByPath.get(activePath) ?? null)
    : null

  return (
    <Card
      className={`pg-card ${isRanked ? '' : 'pg-card-unranked'} ${dirty ? 'pg-card-dirty' : ''}`}
    >
      <Card.Header className="pg-card-header">
        <button
          type="button"
          className="pg-card-header-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="me-2"
          />
          <strong>
            {group.sources.length} sources · {group.paths.length} shared paths
          </strong>
          {!isRanked && (
            <Badge bg="warning" text="dark" className="ms-2">
              Unranked
            </Badge>
          )}
          {isRanked && group.newcomerSources.length > 0 && (
            <Badge
              bg="warning"
              text="dark"
              className="ms-2"
              title="A new source has started publishing a path in this group since the ranking was saved. Click Save to append it at the bottom, or drag it into place first."
            >
              {group.newcomerSources.length} new source
              {group.newcomerSources.length === 1 ? '' : 's'}
            </Badge>
          )}
          {dirty && group.newcomerSources.length === 0 && (
            <Badge bg="warning" text="dark" className="ms-2">
              Unsaved
            </Badge>
          )}
          {overrideRows.length > 0 && (
            <Badge bg="info" className="ms-2">
              {overrideRows.length} override
              {overrideRows.length === 1 ? '' : 's'}
            </Badge>
          )}
          {group.inactive && (
            <Badge
              bg="secondary"
              className="ms-2"
              title={
                overrideRows.length > 0
                  ? `Group is deactivated. ${overrideRows.length} path override${overrideRows.length === 1 ? ' is' : 's are'} dormant — they keep their saved ranking and will resume when the group is reactivated.`
                  : 'Group is deactivated.'
              }
            >
              Inactive
            </Badge>
          )}
        </button>
        <Button
          size="sm"
          variant={group.inactive ? 'outline-success' : 'outline-secondary'}
          disabled={isSaving}
          onClick={() => onToggleActive(!group.inactive)}
          className="pg-card-save"
          title={
            group.inactive
              ? 'Resume enforcement using the saved ranking and reactivate any path overrides that belong to this group'
              : 'Keep the ranking but stop enforcing it. Path overrides whose sources all belong to this group go dormant too — every source on those paths is accepted again.'
          }
        >
          {group.inactive ? 'Activate' : 'Deactivate'}
        </Button>
      </Card.Header>
      {expanded && (
        <Card.Body className="pg-card-body">
          {!isRanked && !group.inactive && (
            <div className="pg-unranked-hint mb-2">
              {hasLocalEdit
                ? 'Unsaved ranking — hit Save changes to apply.'
                : 'No ranking saved yet — drag sources on the left to set the order, then Save.'}
            </div>
          )}
          {group.inactive && (
            <div className="pg-unranked-hint mb-2">
              Group inactive — paths in this group accept every source
              first-come, first-served. Click Activate to enforce the saved
              ranking again.
            </div>
          )}
          <div className="pg-three-col">
            <div className="pg-col pg-col-sources">
              <h6 className="pg-col-title">Sources</h6>
              {(() => {
                // Assign each source in this group a device identity.
                // Two rows sharing a CAN Name are the same physical
                // device reached via different transports. Priority
                // matching already treats them as one (CAN-Name
                // matching in the engine); the UI just labels it.
                const canNameByRef =
                  deviceIdentityIndex?.canNameBySourceRef ?? new Map()
                const refsByCanName = new Map<string, string[]>()
                for (const src of group.sources) {
                  const cn = canNameByRef.get(src)
                  if (!cn) continue
                  const arr = refsByCanName.get(cn) ?? []
                  arr.push(src)
                  refsByCanName.set(cn, arr)
                }
                const pairedCanNames = new Set<string>()
                for (const [cn, refs] of refsByCanName) {
                  if (refs.length > 1) pairedCanNames.add(cn)
                }
                const colorFor = (cn: string) => {
                  let h = 0
                  for (let i = 0; i < cn.length; i++) {
                    h = (h * 31 + cn.charCodeAt(i)) | 0
                  }
                  const hue = Math.abs(h) % 360
                  return `hsl(${hue} 60% 85%)`
                }
                return (
                  <>
                    {pairedCanNames.size > 0 && (
                      <div
                        className="pg-device-legend mb-2"
                        style={{ fontSize: '0.8em', color: '#555' }}
                      >
                        Coloured dots mark transports of the same physical
                        device — priorities apply to the device, not to each
                        transport row.
                      </div>
                    )}
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={group.sources}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="pg-source-list">
                          {group.sources.map((src, i) => {
                            const highlighted =
                              activeSource === src ||
                              (!!highlightedSourcesFromPath &&
                                highlightedSourcesFromPath.has(src))
                            const dimmed =
                              (!!activeSource && activeSource !== src) ||
                              (!!highlightedSourcesFromPath &&
                                !highlightedSourcesFromPath.has(src))
                            const cn = canNameByRef.get(src)
                            const deviceDot =
                              cn && pairedCanNames.has(cn)
                                ? { color: colorFor(cn), canName: cn }
                                : undefined
                            const identity = cn
                              ? deviceIdentityIndex?.identityByCanName.get(cn)
                              : undefined
                            const deviceLabel =
                              identity?.modelId ?? identity?.manufacturerCode
                            // Offline either means the server explicitly
                            // reports the source down, or — once the
                            // status snapshot has loaded — that the
                            // source has been silent since boot. The
                            // slice merges incoming snapshots, so an
                            // entry that was once present can never
                            // disappear due to transient upstream
                            // reconnect drift; missing-after-loaded
                            // therefore means "never seen this session".
                            const statusEntry = sourceStatus[src]
                            const isOffline = !sourceStatusLoaded
                              ? false
                              : statusEntry
                                ? !statusEntry.online
                                : true
                            const isPlugin = isPluginSource(src)
                            const isNewcomer = newcomerSet.has(src)
                            // Offer removal when the source is plainly
                            // not contributing right now (Offline badge
                            // fired) — drag-rank is the right tool for
                            // online sources we actually want to keep.
                            // Also offer it for newcomers: by
                            // definition the user has not added the
                            // source to the saved ranking. If they
                            // already trashed it once and the
                            // reconciler re-promoted it (because the
                            // source is still publishing into the
                            // cache), they need a second click to make
                            // the deletion stick across the next
                            // reconcile, or to drop it again after
                            // saving.
                            const canRemove = isOffline || isNewcomer
                            const displayLabel = getDisplayName(
                              src,
                              sourcesData
                            )
                            const displayParts = getDisplayParts(
                              src,
                              sourcesData
                            )
                            return (
                              <SortableSourceRow
                                key={src}
                                sourceRef={src}
                                index={i}
                                label={displayParts.primary}
                                secondaryLabel={displayParts.secondary}
                                wonPaths={pathsWonBySource.get(src) ?? []}
                                pathsPublished={
                                  pathsPublishedBySource.get(src) ?? new Set()
                                }
                                highlighted={highlighted}
                                dimmed={dimmed}
                                isOffline={isOffline}
                                isNewcomer={newcomerSet.has(src)}
                                isPlugin={isPlugin}
                                canRemove={canRemove}
                                onSelect={() => handleSelectSource(src)}
                                onRemove={
                                  canRemove
                                    ? () =>
                                        handleRemoveSource(src, displayLabel)
                                    : undefined
                                }
                                deviceDot={deviceDot}
                                deviceLabel={deviceLabel}
                              />
                            )
                          })}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  </>
                )
              })()}
            </div>

            <div className="pg-col pg-col-paths">
              <h6 className="pg-col-title">Paths</h6>
              <ul className="pg-path-list">
                {group.paths.map((p) => {
                  const kinds = pathKinds.get(p) ?? []
                  const isOverride = overridePaths.has(p)
                  const publisherCount = publishersByPath.get(p)?.size ?? 0
                  const highlighted =
                    activePath === p ||
                    (!!winningPathsFromSource && winningPathsFromSource.has(p))
                  const dimmed =
                    (!!activePath && activePath !== p) ||
                    (!!highlightedPathsFromSource &&
                      !highlightedPathsFromSource.has(p))
                  return (
                    <PathRow
                      key={p}
                      path={p}
                      kinds={kinds}
                      isOverride={isOverride}
                      publisherCount={publisherCount}
                      groupSize={group.sources.length}
                      highlighted={highlighted}
                      dimmed={dimmed}
                      onSelect={() => handleSelectPath(p)}
                    />
                  )
                })}
              </ul>
              {activePath && (
                <div className="pg-path-actions">
                  <Button
                    size="sm"
                    variant={
                      overridePaths.has(activePath) ? 'outline-danger' : 'info'
                    }
                    onClick={() => handleToggleOverride(activePath)}
                  >
                    {overridePaths.has(activePath)
                      ? 'Remove override'
                      : 'Override this path'}
                  </Button>
                </div>
              )}
            </div>

            <div className="pg-col pg-col-overrides">
              <h6 className="pg-col-title">
                Path overrides ({overrideRows.length})
              </h6>
              {overrideRows.length === 0 ? (
                <div className="pg-overrides-empty text-muted small">
                  None. Click a path on the left and press{' '}
                  <em>Override this path</em> to deviate from the group ranking.
                </div>
              ) : (
                <div className="pg-overrides-list">
                  {overrideRows.map(({ pp, index }) => {
                    const kinds = pathKinds.get(pp.path) ?? []
                    const isFanOut =
                      pp.priorities.length === 1 &&
                      pp.priorities[0].sourceRef === '*'
                    // Restrict missing-sources detection to the group's
                    // current source list — sources the user removed from
                    // the group should not reappear via the "Add them"
                    // helper, even if they still echo into multiSourcePaths.
                    // Fan-out paths intentionally accept every source, so
                    // there are no "missing" sources to surface.
                    const groupSrcSet = new Set(group.sources)
                    const publishers = (multiSourcePaths[pp.path] ?? []).filter(
                      (ref) => groupSrcSet.has(ref)
                    )
                    const listed = new Set(
                      pp.priorities.map((p) => p.sourceRef).filter(Boolean)
                    )
                    const missing = isFanOut
                      ? []
                      : publishers.filter((ref) => !listed.has(ref))
                    const handleAddMissing = () => {
                      const appended = [
                        ...pp.priorities.filter((p) => p.sourceRef),
                        ...missing.map((sourceRef) => ({
                          sourceRef,
                          timeout: fallbackMs
                        }))
                      ]
                      setPathPriorities(pp.path, appended)
                    }
                    const focused =
                      activePath === pp.path ||
                      (!!activeSource && listed.has(activeSource))
                    return (
                      <div
                        key={pp.path}
                        className={`pg-override-row ${focused ? 'is-focused' : ''}`}
                      >
                        <div className="pg-override-path d-flex align-items-center">
                          <code className="pg-override-path-code">
                            {pp.path}
                          </code>
                          {kinds.length > 0 && (
                            <span className="pg-path-kinds ms-2">
                              {kinds.map((kind) => (
                                <span key={kind} className="pg-path-kind">
                                  {kind}
                                </span>
                              ))}
                            </span>
                          )}
                          <button
                            type="button"
                            className="pg-override-delete ms-auto"
                            aria-label={`Delete override for ${pp.path}`}
                            title="Delete override (path will follow group ranking)"
                            disabled={isSaving}
                            onClick={() => {
                              if (isSaving) return
                              // Re-derive the index from current state at
                              // click time. The render-time `index` goes
                              // stale the moment another override is
                              // deleted: subsequent clicks would otherwise
                              // remove the wrong row.
                              const currentIdx = sourcePriorities.findIndex(
                                (p) => p.path === pp.path
                              )
                              removePriorityOverride(pp.path)
                              if (currentIdx !== -1) deletePath(currentIdx)
                            }}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                        {missing.length > 0 && (
                          <div className="pg-override-missing">
                            <FontAwesomeIcon
                              icon={faTriangleExclamation}
                              className="me-1"
                            />
                            <span>
                              {missing.length} source
                              {missing.length === 1 ? '' : 's'} not listed.
                            </span>
                            <Button
                              size="sm"
                              variant="warning"
                              className="ms-2 pg-override-fix"
                              onClick={handleAddMissing}
                            >
                              Add {missing.length === 1 ? 'it' : 'them'}
                            </Button>
                          </div>
                        )}
                        <PrefsEditor
                          path={pp.path}
                          priorities={pp.priorities}
                          pathIndex={index}
                          isSaving={isSaving}
                          sourcesData={sourcesData}
                          multiSourcePaths={multiSourcePaths}
                          restrictToSources={group.sources}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      )}
    </Card>
  )
}

export default PriorityGroupCard
