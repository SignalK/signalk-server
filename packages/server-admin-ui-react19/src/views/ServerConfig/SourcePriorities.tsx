import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import Creatable from 'react-select/creatable'
import Select from 'react-select'
import { useSearchParams } from 'react-router-dom'
import {
  useStore,
  useSourcePriorities,
  useSourceRanking,
  useMultiSourcePaths
} from '../../store'
import { type SourcesData } from '../../utils/sourceLabels'
import { useSourceAliases } from '../../hooks/useSourceAliases'

// Types
interface Priority {
  sourceRef: string
  timeout: string | number
}

interface PathPriority {
  path: string
  priorities: Priority[]
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
}

const PrefsEditor: React.FC<PrefsEditorProps> = ({
  path,
  priorities,
  pathIndex,
  isSaving,
  sourcesData,
  multiSourcePaths
}) => {
  const changePriority = useStore((s) => s.changePriority)
  const deletePriority = useStore((s) => s.deletePriority)
  const movePriority = useStore((s) => s.movePriority)
  const { getDisplayName } = useSourceAliases()

  const sourceRefs = useMemo(
    () => (path && multiSourcePaths[path]) || [],
    [path, multiSourcePaths]
  )

  const allOptions: SelectOption[] = sourceRefs.map((ref) => ({
    label: getDisplayName(ref, sourcesData),
    value: ref
  }))

  // Build rows: append an empty placeholder row if unassigned sources remain
  const rows = useMemo(() => {
    const assigned = new Set(priorities.map((p) => p.sourceRef).filter(Boolean))
    if (priorities.length >= sourceRefs.length) {
      return priorities
    }
    const hasUnassigned = sourceRefs.some((ref) => !assigned.has(ref))
    if (hasUnassigned) {
      return [...priorities, { sourceRef: '', timeout: 60000 }]
    }
    return priorities
  }, [priorities, sourceRefs])

  // Set of all sourceRefs currently shown in rows (for dropdown filtering)
  const selectedRefs = useMemo(
    () => new Set(rows.map((r) => r.sourceRef).filter(Boolean)),
    [rows]
  )

  return (
    <Table size="sm">
      <thead>
        <tr>
          <td style={{ width: '30px' }}>#</td>
          <td>Source Reference (see DataBrowser for details)</td>
          <td style={{ width: '120px' }}>Timeout (ms)</td>
          <td style={{ width: '70px' }}>Enabled</td>
          <td style={{ width: '80px' }}>Order</td>
          <td></td>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ sourceRef, timeout }, index) => {
          // Filter dropdown to sources not already assigned to other rows
          const availableOptions = allOptions.filter(
            (o) => o.value === sourceRef || !selectedRefs.has(o.value)
          )
          const priorityKey = `${index}-${sourceRef || 'new'}`
          const isDisabled = Number(timeout) === -1
          return (
            <tr key={priorityKey}>
              <td>{index + 1}.</td>
              <td>
                <Creatable
                  menuPortalTarget={document.body}
                  options={availableOptions}
                  value={{
                    value: sourceRef,
                    label: getDisplayName(sourceRef, sourcesData)
                  }}
                  onChange={(e) => {
                    changePriority(pathIndex, index, e?.value || '', timeout)
                  }}
                />
              </td>
              <td>
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
              <td className="text-center">
                <Form.Check
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={(e) =>
                    changePriority(
                      pathIndex,
                      index,
                      sourceRef,
                      e.target.checked ? (index === 0 ? 0 : 60000) : -1
                    )
                  }
                />
              </td>
              <td>
                {index > 0 && index < priorities.length && (
                  <button
                    type="button"
                    onClick={() =>
                      !isSaving && movePriority(pathIndex, index, -1)
                    }
                  >
                    <FontAwesomeIcon icon={faArrowUp} />
                  </button>
                )}
                {index < priorities.length - 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      !isSaving && movePriority(pathIndex, index, 1)
                    }
                  >
                    <FontAwesomeIcon icon={faArrowDown} />
                  </button>
                )}
              </td>
              <td>
                {index < priorities.length && (
                  <FontAwesomeIcon
                    icon={faTrash}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      !isSaving && deletePriority(pathIndex, index)
                    }
                  />
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

function fetchAvailablePaths(cb: (paths: string[]) => void) {
  fetch(`${window.serverRoutesPrefix}/availablePaths`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then(cb)
}

// ─── Source Ranking Section ─────────────────────────────────────────────────

const SourceRankingSection: React.FC<{
  sourcesData: SourcesData | null
  multiSourcePaths: Record<string, string[]>
}> = ({ sourcesData, multiSourcePaths }) => {
  const rankingData = useSourceRanking()
  const addRankedSource = useStore((s) => s.addRankedSource)
  const removeRankedSource = useStore((s) => s.removeRankedSource)
  const moveRankedSource = useStore((s) => s.moveRankedSource)
  const changeRankedTimeout = useStore((s) => s.changeRankedTimeout)
  const setRankingSaving = useStore((s) => s.setRankingSaving)
  const setRankingSaved = useStore((s) => s.setRankingSaved)
  const setRankingSaveFailed = useStore((s) => s.setRankingSaveFailed)
  const clearRankingSaveFailed = useStore((s) => s.clearRankingSaveFailed)
  const { getDisplayName } = useSourceAliases()

  const { ranking, saveState } = rankingData

  // Sources that share at least one path with another source
  const allSourceRefs = useMemo(() => {
    const overlapping = new Set<string>()
    for (const sources of Object.values(multiSourcePaths)) {
      for (const ref of sources) overlapping.add(ref)
    }
    return Array.from(overlapping).sort()
  }, [multiSourcePaths])

  // Sources not yet in the ranking
  const rankedRefs = useMemo(
    () => new Set(ranking.map((r) => r.sourceRef)),
    [ranking]
  )
  const unrankedOptions: SelectOption[] = useMemo(
    () =>
      allSourceRefs
        .filter((ref) => !rankedRefs.has(ref))
        .map((ref) => ({
          label: getDisplayName(ref, sourcesData),
          value: ref
        })),
    [allSourceRefs, rankedRefs, getDisplayName, sourcesData]
  )

  const handleAdd = useCallback(
    (option: SelectOption | null) => {
      if (option) {
        addRankedSource(option.value, 60000)
      }
    },
    [addRankedSource]
  )

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setRankingSaving()
      fetch(`${window.serverRoutesPrefix}/sourceRanking`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          ranking.map(({ sourceRef, timeout }) => ({
            sourceRef,
            timeout: Number(timeout)
          }))
        )
      })
        .then((response) => {
          if (response.status === 200) {
            setRankingSaved()
          } else {
            throw new Error()
          }
        })
        .catch(() => {
          setRankingSaveFailed()
          setTimeout(() => clearRankingSaveFailed(), 5000)
        })
    },
    [
      ranking,
      setRankingSaving,
      setRankingSaved,
      setRankingSaveFailed,
      clearRankingSaveFailed
    ]
  )

  return (
    <Card className="mb-3">
      <Card.Header>Source Ranking</Card.Header>
      <Card.Body>
        <Alert>
          <p>
            Rank your sources globally. This applies to{' '}
            <b>all paths where multiple ranked sources overlap</b>. Path-level
            overrides below take precedence over this ranking.
          </p>
          <p>
            Sources not listed here are unranked and treated as lowest priority
            with a 120 second timeout. Uncheck <b>Enabled</b> to block a source
            entirely.
          </p>
        </Alert>
        {ranking.length > 0 && (
          <Table responsive bordered striped size="sm">
            <thead>
              <tr>
                <th style={{ width: '30px' }}>#</th>
                <th>Source</th>
                <th style={{ width: '120px' }}>Timeout (ms)</th>
                <th style={{ width: '70px' }}>Enabled</th>
                <th style={{ width: '80px' }}>Order</th>
                <th style={{ width: '30px' }}></th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(({ sourceRef, timeout }, index) => {
                const isDisabled = Number(timeout) === -1
                return (
                  <tr key={sourceRef}>
                    <td>{index + 1}.</td>
                    <td>{getDisplayName(sourceRef, sourcesData)}</td>
                    <td>
                      {index === 0 && !isDisabled ? (
                        <span className="text-muted small">preferred</span>
                      ) : (
                        <Form.Control
                          type="number"
                          value={isDisabled ? '' : timeout}
                          disabled={isDisabled}
                          onChange={(e) =>
                            changeRankedTimeout(index, e.target.value)
                          }
                        />
                      )}
                    </td>
                    <td className="text-center">
                      <Form.Check
                        type="checkbox"
                        checked={!isDisabled}
                        onChange={(e) =>
                          changeRankedTimeout(
                            index,
                            e.target.checked ? (index === 0 ? 0 : 60000) : -1
                          )
                        }
                      />
                    </td>
                    <td>
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            !saveState.isSaving && moveRankedSource(index, -1)
                          }
                        >
                          <FontAwesomeIcon icon={faArrowUp} />
                        </button>
                      )}
                      {index < ranking.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            !saveState.isSaving && moveRankedSource(index, 1)
                          }
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </button>
                      )}
                    </td>
                    <td>
                      <FontAwesomeIcon
                        icon={faTrash}
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          !saveState.isSaving && removeRankedSource(index)
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {unrankedOptions.length > 0 && (
          <div style={{ maxWidth: '400px' }}>
            <Select
              menuPortalTarget={document.body}
              options={unrankedOptions}
              value={null}
              placeholder="Add source to ranking..."
              onChange={handleAdd}
              isClearable
            />
          </div>
        )}
        {ranking.length > 0 && unrankedOptions.length === 0 && (
          <p className="text-muted small">All known sources are ranked.</p>
        )}
      </Card.Body>
      <Card.Footer>
        <Button
          size="sm"
          variant="primary"
          disabled={
            !saveState.dirty || saveState.isSaving || !saveState.timeoutsOk
          }
          onClick={handleSave}
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> Save Ranking
        </Button>
        {saveState.saveFailed && ' Saving ranking failed!'}
        {!saveState.timeoutsOk && (
          <span style={{ paddingLeft: '10px' }}>
            <Badge bg="danger">Error</Badge>
            {' Timeout values must be positive numbers (milliseconds).'}
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const SourcePriorities: React.FC = () => {
  const sourcePrioritiesData = useSourcePriorities()
  const sourceRankingData = useSourceRanking()
  const changePath = useStore((s) => s.changePath)
  const deletePath = useStore((s) => s.deletePath)
  const setSaving = useStore((s) => s.setSaving)
  const setSaved = useStore((s) => s.setSaved)
  const setSaveFailed = useStore((s) => s.setSaveFailed)
  const clearSaveFailed = useStore((s) => s.clearSaveFailed)

  const { sourcePriorities, saveState } = sourcePrioritiesData

  const [availablePaths, setAvailablePaths] = useState<SelectOption[]>([])
  const [sourcesData, setSourcesData] = useState<SourcesData | null>(null)
  const multiSourcePaths = useMultiSourcePaths()

  const [searchParams, setSearchParams] = useSearchParams()

  // Compute unconfigured multi-source paths for warning banner
  const unconfiguredPaths = useMemo(() => {
    const configuredSourcesByPath = new Map<string, Set<string>>()
    for (const pp of sourcePriorities) {
      if (pp.path) {
        configuredSourcesByPath.set(
          pp.path,
          new Set(pp.priorities.map((p) => p.sourceRef))
        )
      }
    }
    const rankedRefs = new Set(
      sourceRankingData.ranking.map((r) => r.sourceRef)
    )

    const result: string[] = []
    for (const [path, sources] of Object.entries(multiSourcePaths)) {
      const hasUncoveredSource = sources.some((ref) => {
        if (configuredSourcesByPath.get(path)?.has(ref)) return false
        if (rankedRefs.has(ref)) return false
        return true
      })
      if (hasUncoveredSource) result.push(path)
    }
    return result.sort()
  }, [multiSourcePaths, sourcePriorities, sourceRankingData])

  // Handle ?path= query parameter — render-time sync.
  // changePath is a synchronous zustand action, safe during render.
  const pathParam = searchParams.get('path')
  if (pathParam) {
    const alreadyExists = sourcePriorities.some((pp) => pp.path === pathParam)
    if (!alreadyExists) {
      changePath(sourcePriorities.length, pathParam)
    }
    setSearchParams({}, { replace: true })
  }

  const handleAddPath = useCallback(
    (path: string) => {
      const alreadyExists = sourcePriorities.some((pp) => pp.path === path)
      if (!alreadyExists) {
        changePath(sourcePriorities.length, path)
      }
    },
    [sourcePriorities, changePath]
  )

  useEffect(() => {
    fetchAvailablePaths((pathsArray) => {
      setAvailablePaths(
        pathsArray.map((path) => ({
          value: path,
          label: path
        }))
      )
    })
    fetch('/signalk/v1/api/sources', { credentials: 'include' })
      .then((r) => r.json())
      .then(setSourcesData)
      .catch(() => {})
  }, [])

  // Check for incomplete entries (paths with empty sourceRef in priorities)
  const hasIncompleteEntries = useMemo(
    () =>
      sourcePriorities.some(
        (pp) => !pp.path || pp.priorities.some((prio) => !prio.sourceRef)
      ),
    [sourcePriorities]
  )

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setSaving()
      // Filter out entries with empty path or priorities with empty sourceRef
      const cleanData = sourcePriorities.reduce<Record<string, Priority[]>>(
        (acc, pathPriority) => {
          if (!pathPriority.path) return acc
          const validPriorities = pathPriority.priorities.filter(
            (p) => p.sourceRef
          )
          if (validPriorities.length > 0) {
            acc[pathPriority.path] = validPriorities
          }
          return acc
        },
        {}
      )
      fetch(`${window.serverRoutesPrefix}/sourcePriorities`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cleanData)
      })
        .then((response) => {
          if (response.status === 200) {
            setSaved()
          } else {
            throw new Error()
          }
        })
        .catch(() => {
          setSaveFailed()
          setTimeout(() => clearSaveFailed(), 5000)
        })
    },
    [sourcePriorities, setSaving, setSaved, setSaveFailed, clearSaveFailed]
  )

  const priosWithEmpty: PathPriority[] = [
    ...sourcePriorities,
    { path: '', priorities: [] }
  ]

  return (
    <>
      <SourceRankingSection
        sourcesData={sourcesData}
        multiSourcePaths={multiSourcePaths}
      />

      <Card>
        <Card.Header>Path-Level Overrides</Card.Header>
        <Card.Body>
          <Alert>
            <p>
              Override source ranking for specific paths. Path-level overrides
              take precedence over the global source ranking above.
            </p>
            <p>
              Incoming data is not handled if the{' '}
              <b>
                latest value for a path is from a higher priority source and it
                is not older than the timeout
              </b>{' '}
              specified for the source of the incoming data. Timeout for data
              from unlisted sources is 120 seconds. Uncheck <b>Enabled</b> to
              block a source for a specific path.
            </p>
            <p>
              You can debug the settings by saving them and activating debug key{' '}
              <b>signalk-server:sourcepriorities</b> in{' '}
              <a
                href="./#/serverConfiguration/log"
                className="text-decoration-none"
              >
                Server Log
              </a>
            </p>
          </Alert>
          {unconfiguredPaths.length > 0 && (
            <Alert variant="warning">
              <strong>
                {unconfiguredPaths.length} path(s) have multiple sources without
                priority configuration:
              </strong>
              <div style={{ marginTop: '8px' }}>
                {unconfiguredPaths.map((p) => (
                  <Badge
                    key={p}
                    bg="warning"
                    text="dark"
                    style={{ margin: '2px', cursor: 'pointer' }}
                    onClick={() => handleAddPath(p)}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </Alert>
          )}
          <Table responsive bordered striped size="sm">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Path</th>
                <th>Priorities</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {priosWithEmpty.map(({ path, priorities }, index) => {
                // Path items may be empty for new entries
                const pathKey = `${index}-${path || 'new'}`
                return (
                  <tr key={pathKey}>
                    <td>
                      <Creatable
                        menuPortalTarget={document.body}
                        options={availablePaths}
                        value={{ value: path, label: path }}
                        onChange={(e) => {
                          changePath(index, e?.value || '')
                        }}
                      />
                    </td>
                    <td>
                      <PrefsEditor
                        key={path}
                        path={path}
                        priorities={priorities}
                        pathIndex={index}
                        isSaving={saveState.isSaving || false}
                        sourcesData={sourcesData}
                        multiSourcePaths={multiSourcePaths}
                      />
                    </td>
                    <td style={{ border: 'none' }}>
                      {index < sourcePriorities.length && (
                        <FontAwesomeIcon
                          icon={faTrash}
                          style={{ cursor: 'pointer' }}
                          onClick={() => deletePath(index)}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card.Body>
        <Card.Footer>
          <Button
            size="sm"
            variant="primary"
            disabled={
              !saveState.dirty ||
              saveState.isSaving ||
              !saveState.timeoutsOk ||
              hasIncompleteEntries
            }
            onClick={handleSave}
          >
            <FontAwesomeIcon icon={faFloppyDisk} /> Save
          </Button>
          {saveState.saveFailed && 'Saving priorities settings failed!'}
          {!saveState.timeoutsOk && (
            <span style={{ paddingLeft: '10px' }}>
              <Badge bg="danger">Error</Badge>
              {'Timeout values must be positive numbers (milliseconds).'}
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

export default SourcePriorities
