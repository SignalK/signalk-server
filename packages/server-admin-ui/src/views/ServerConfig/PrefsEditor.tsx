import React, { useEffect, useMemo, useRef } from 'react'
import Badge from 'react-bootstrap/Badge'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import Creatable from 'react-select/creatable'
import { useStore, useSourceStatus, useSourceStatusLoaded } from '../../store'
import { type SourcesData } from '../../utils/sourceLabels'
import { DEFAULT_FALLBACK_MS } from '../../utils/sourceGroups'
import { useSourceAliases } from '../../hooks/useSourceAliases'

interface Priority {
  sourceRef: string
  timeout: string | number
}

interface SelectOption {
  label: string
  value: string
}

interface PrefsEditorProps {
  path: string
  priorities: Priority[]
  pathIndex: number
  isSaving: boolean
  sourcesData: SourcesData | null
  multiSourcePaths: Record<string, string[]>
  /**
   * When set, restrict the picker (and the auto-add row) to sources that
   * are also in this list. Used by group-scoped overrides so a source the
   * user removed from the group cannot reappear via the override picker.
   * Ungrouped overrides leave it undefined, falling back to all
   * multiSourcePaths publishers.
   */
  restrictToSources?: string[]
}

/**
 * Server-side sentinel: a single entry with sourceRef '*' marks the
 * path as "fan out — every source's value is delivered without
 * priority filtering". Kept in sync with FANOUT_SOURCEREF in
 * src/deltaPriority.ts.
 */
const FANOUT_SOURCEREF = '*'

function isFanOut(priorities: Priority[]): boolean {
  return priorities.length === 1 && priorities[0].sourceRef === FANOUT_SOURCEREF
}

export const PrefsEditor: React.FC<PrefsEditorProps> = ({
  path,
  priorities,
  pathIndex,
  isSaving,
  sourcesData,
  multiSourcePaths,
  restrictToSources
}) => {
  const changePriority = useStore((s) => s.changePriority)
  const deletePriority = useStore((s) => s.deletePriority)
  const movePriority = useStore((s) => s.movePriority)
  const setPathPriorities = useStore((s) => s.setPathPriorities)
  const sourceStatus = useSourceStatus()
  const sourceStatusLoaded = useSourceStatusLoaded()
  const { getDisplayName } = useSourceAliases()
  const fanOut = isFanOut(priorities)

  const sourceRefs = useMemo(() => {
    const publishers = (path && multiSourcePaths[path]) || []
    if (!restrictToSources) return publishers
    const allowed = new Set(restrictToSources)
    return publishers.filter((ref) => allowed.has(ref))
  }, [path, multiSourcePaths, restrictToSources])

  const allOptions: SelectOption[] = useMemo(
    () =>
      sourceRefs.map((ref) => ({
        label: getDisplayName(ref, sourcesData),
        value: ref
      })),
    [sourceRefs, getDisplayName, sourcesData]
  )

  const rows = useMemo(() => {
    const assigned = new Set(priorities.map((p) => p.sourceRef).filter(Boolean))
    if (priorities.length >= sourceRefs.length) return priorities
    const hasUnassigned = sourceRefs.some((ref) => !assigned.has(ref))
    if (hasUnassigned)
      return [...priorities, { sourceRef: '', timeout: DEFAULT_FALLBACK_MS }]
    return priorities
  }, [priorities, sourceRefs])

  const selectedRefs = useMemo(
    () => new Set(rows.map((r) => r.sourceRef).filter(Boolean)),
    [rows]
  )

  // Remember each row's last enabled timeout so re-enabling restores
  // the previous value instead of clobbering it with the default
  // fallback. Keyed by sourceRef|index because a row may briefly have
  // an empty sourceRef during edits.
  const lastEnabledTimeout = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    for (let i = 0; i < priorities.length; i++) {
      const p = priorities[i]
      const t = Number(p.timeout)
      if (Number.isFinite(t) && t !== -1) {
        lastEnabledTimeout.current.set(`${p.sourceRef}|${i}`, t)
      }
    }
  }, [priorities])

  const handleFanOutToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setPathPriorities(path, [{ sourceRef: FANOUT_SOURCEREF, timeout: 0 }])
    } else {
      // Toggling off restores an empty list — the auto-add row in
      // PrefsEditor will surface the publishers so the user can rank
      // them again from scratch.
      setPathPriorities(path, [])
    }
  }

  const fanOutControl = (
    <Form.Check
      type="checkbox"
      id={`pg-fanout-${pathIndex}`}
      label="Fan out — deliver every source's value (skip priority filtering)"
      checked={fanOut}
      disabled={isSaving}
      onChange={handleFanOutToggle}
      className="mb-2"
    />
  )

  if (fanOut) {
    return fanOutControl
  }

  return (
    <>
      {fanOutControl}
      <Table size="sm" className="mb-0 pg-prefs-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: '30px' }}>
              #
            </th>
            <th scope="col">Source</th>
            <th scope="col" style={{ width: '140px' }}>
              Fallback after (ms)
            </th>
            <th scope="col" style={{ width: '70px' }}>
              Enabled
            </th>
            <th scope="col" style={{ width: '80px' }}>
              Order
            </th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sourceRef, timeout }, index) => {
            const availableOptions = allOptions.filter(
              (o) => o.value === sourceRef || !selectedRefs.has(o.value)
            )
            const isDisabled = Number(timeout) === -1
            // sourceRef is stable across renders even when rows reorder; the
            // index suffix lets multiple unassigned rows coexist.
            const rowKey = sourceRef || `unassigned-${index}`
            return (
              <tr key={rowKey}>
                <td data-th="#">{index + 1}.</td>
                <td data-th="Source">
                  <div className="d-flex align-items-center gap-2">
                    <div style={{ flex: 1 }}>
                      <Creatable
                        menuPortalTarget={document.body}
                        options={availableOptions}
                        value={{
                          value: sourceRef,
                          label: getDisplayName(sourceRef, sourcesData)
                        }}
                        onChange={(e) => {
                          changePriority(
                            pathIndex,
                            index,
                            e?.value || '',
                            timeout
                          )
                        }}
                      />
                    </div>
                    {(() => {
                      if (!sourceRef || !sourceStatusLoaded) return null
                      const entry = sourceStatus[sourceRef]
                      // Only badge as Offline when the server positively
                      // reports it offline. A missing entry is "unknown"
                      // (plugin disabled, or transient sourceMeta drift
                      // across an upstream reconnect) — silence is better
                      // than a stale Offline that won't clear.
                      if (!entry || entry.online) return null
                      return (
                        <Badge
                          bg="secondary"
                          style={{ fontSize: '0.7em', flexShrink: 0 }}
                          title="No frames seen from this source — its rank is preserved so it auto-recovers when it returns."
                        >
                          Offline
                        </Badge>
                      )
                    })()}
                  </div>
                </td>
                <td data-th="Fallback after (ms)">
                  {index === 0 && !isDisabled ? (
                    <span className="text-muted small">preferred</span>
                  ) : (
                    <Form.Control
                      type="number"
                      name="timeout"
                      disabled={isDisabled}
                      onChange={(e) =>
                        changePriority(
                          pathIndex,
                          index,
                          sourceRef,
                          e.target.value
                        )
                      }
                      value={isDisabled ? '' : timeout}
                    />
                  )}
                </td>
                <td data-th="Enabled" className="text-center">
                  <Form.Check
                    type="checkbox"
                    checked={!isDisabled}
                    aria-label={`Enable source ${sourceRef || 'row ' + (index + 1)}`}
                    onChange={(e) => {
                      let nextTimeout: number
                      if (e.target.checked) {
                        // Rank-1 always has timeout 0; lower-ranked rows
                        // restore their previous enabled timeout if we
                        // remember it, otherwise fall back to the
                        // configured default.
                        if (index === 0) {
                          nextTimeout = 0
                        } else {
                          const remembered = lastEnabledTimeout.current.get(
                            `${sourceRef}|${index}`
                          )
                          nextTimeout =
                            typeof remembered === 'number' && remembered > 0
                              ? remembered
                              : DEFAULT_FALLBACK_MS
                        }
                      } else {
                        nextTimeout = -1
                      }
                      changePriority(pathIndex, index, sourceRef, nextTimeout)
                    }}
                  />
                </td>
                <td data-th="Order">
                  {index > 0 && index < priorities.length && (
                    <button
                      type="button"
                      aria-label={`Move row ${index + 1} up`}
                      disabled={isSaving}
                      onClick={() => movePriority(pathIndex, index, -1)}
                    >
                      <FontAwesomeIcon icon={faArrowUp} />
                    </button>
                  )}
                  {index < priorities.length - 1 && (
                    <button
                      type="button"
                      aria-label={`Move row ${index + 1} down`}
                      disabled={isSaving}
                      onClick={() => movePriority(pathIndex, index, 1)}
                    >
                      <FontAwesomeIcon icon={faArrowDown} />
                    </button>
                  )}
                </td>
                <td data-th="" className="pg-prefs-actions">
                  {index < priorities.length && (
                    <button
                      type="button"
                      aria-label={`Delete row ${index + 1}`}
                      disabled={isSaving}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        color: 'inherit'
                      }}
                      onClick={() => deletePriority(pathIndex, index)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </>
  )
}

export default PrefsEditor
