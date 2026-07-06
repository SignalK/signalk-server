import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons/faSatelliteDish'
import {
  useStore,
  useGnssSensorsData,
  usePositionSources,
  useUnconfiguredGnssSources,
  useSourcesData
} from '../../store'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import type { GnssSensorConfig } from '../../store/types'
import BoatSchematicEditor from './BoatSchematicEditor'

interface VesselDimensions {
  length: number | null
  beam: number | null
}

const COLORS = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0']
const SAVE_ERROR_CLEAR_MS = 8000

const GnssPositionSettings: React.FC = () => {
  const gnssSensorsData = useGnssSensorsData()
  const positionSources = usePositionSources()
  const unconfiguredSources = useUnconfiguredGnssSources()
  const sourcesData = useSourcesData()
  const { getDisplayParts } = useSourceAliases()

  const updateGnssSensor = useStore((s) => s.updateGnssSensor)
  const addGnssSensor = useStore((s) => s.addGnssSensor)
  const removeGnssSensor = useStore((s) => s.removeGnssSensor)
  const setGnssSaving = useStore((s) => s.setGnssSaving)
  const setGnssSaved = useStore((s) => s.setGnssSaved)
  const setGnssSaveFailed = useStore((s) => s.setGnssSaveFailed)
  const clearGnssSaveFailed = useStore((s) => s.clearGnssSaveFailed)

  const [vesselDimensions, setVesselDimensions] = useState<VesselDimensions>({
    length: null,
    beam: null
  })
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  // Stacked save-error timers would let an earlier 8s fire wipe a fresh
  // validation message; keep the id in a ref so a new failure cancels and
  // restarts the timer instead of queueing a second one.
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSaveErrorClear = useCallback(() => {
    if (saveErrorTimerRef.current !== null) {
      clearTimeout(saveErrorTimerRef.current)
    }
    saveErrorTimerRef.current = setTimeout(() => {
      saveErrorTimerRef.current = null
      clearGnssSaveFailed()
    }, SAVE_ERROR_CLEAR_MS)
  }, [clearGnssSaveFailed])
  useEffect(() => {
    return () => {
      if (saveErrorTimerRef.current !== null) {
        clearTimeout(saveErrorTimerRef.current)
        saveErrorTimerRef.current = null
      }
    }
  }, [])
  // Per-input draft strings. Keeping a draft lets the user type transient
  // values like "-" or "-2." without losing them to Number()->null on every
  // keystroke; the committed numeric value goes to the store on blur (or
  // immediately when the input parses to a valid finite number).
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Key drafts by the sensor's immutable $source so an in-progress edit
  // stays attached to the right row across add / remove / reorder.
  const draftKey = useCallback(
    ($source: string, field: 'fromBow' | 'fromCenter') => `${$source}.${field}`,
    []
  )

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/vessel`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const length = Number(data.length)
        const beam = Number(data.beam)
        setVesselDimensions({
          length: length > 0 ? length : null,
          beam: beam > 0 ? beam : null
        })
      })
      .catch(() => {})
  }, [])

  const { sensors, saveState } = gnssSensorsData

  const mergedRows = useMemo(() => {
    const activeSourceRefs = new Set(positionSources)
    const rows: {
      sensor: GnssSensorConfig | null
      $source: string
      index: number
      status: 'configured' | 'unconfigured' | 'offline'
    }[] = []

    sensors.forEach((sensor, index) => {
      rows.push({
        sensor,
        $source: sensor.$source,
        index,
        status: activeSourceRefs.has(sensor.$source) ? 'configured' : 'offline'
      })
    })

    unconfiguredSources.forEach((ref) => {
      rows.push({
        sensor: null,
        $source: ref,
        index: -1,
        status: 'unconfigured'
      })
    })

    return rows
  }, [sensors, positionSources, unconfiguredSources])

  const handleSave = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      setGnssSaving()
      try {
        const response = await fetch(
          `${window.serverRoutesPrefix}/gnssSensors`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sensors)
          }
        )
        if (response.ok) {
          // The server clears any legacy sensors.gps.<id>.fromBow/fromCenter
          // base-delta entries on every save, but FullSignalK retains the
          // already-emitted values in `signalk.self` until the next
          // restart. The server signals `restartRequired: true` only when
          // such entries were actually swept on this save.
          const body = (await response.json().catch(() => ({}))) as {
            restartRequired?: boolean
          }
          if (body.restartRequired) {
            useStore.getState().setRestartRequired(true)
          }
          setGnssSaved()
          return
        }
        // Backend validators (typebox shape, duplicate ids, physical bounds)
        // send the rejection reason as plain text — surface it so the user
        // can correct the specific sensor/value instead of guessing.
        const message =
          (await response.text().catch(() => '')) ||
          `Save failed (HTTP ${response.status})`
        setGnssSaveFailed(message)
        scheduleSaveErrorClear()
      } catch (err) {
        setGnssSaveFailed((err as Error).message || 'Save failed')
        scheduleSaveErrorClear()
      }
    },
    [
      sensors,
      setGnssSaving,
      setGnssSaved,
      setGnssSaveFailed,
      scheduleSaveErrorClear
    ]
  )

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset all GNSS antenna positions?\n\n' +
        'This removes every configured sensor row. The server stops ' +
        'applying lever-arm correction to navigation.position and detected ' +
        'sources will reappear as "unconfigured" rows.'
    )
    if (!confirmed) return
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await fetch(`${window.serverRoutesPrefix}/gnssSensors`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Same restart-banner trigger as the PUT path: only when legacy
      // base-delta entries were swept by this DELETE.
      const body = (await res.json().catch(() => ({}))) as {
        restartRequired?: boolean
      }
      if (body.restartRequired) {
        useStore.getState().setRestartRequired(true)
      }
      // Force past the dirty guard: the server-side config is gone, so
      // there is nothing left for unsaved local edits to apply to.
      useStore.getState().setGnssSensors([], true)
      setDrafts({})
    } catch (e) {
      setResetError(`Reset failed: ${(e as Error).message}`)
    } finally {
      setResetBusy(false)
    }
  }, [])

  // Clear in-flight draft strings keyed by $source. Drafts hold partial
  // user input like "-" or "-2." so the typed value survives null commits
  // mid-edit; without this clear, a stale draft would shadow the fresh
  // store value if the same $source came back into the table.
  const clearDraftsForSource = useCallback(
    ($source: string) => {
      setDrafts((d) => {
        const next = { ...d }
        delete next[draftKey($source, 'fromBow')]
        delete next[draftKey($source, 'fromCenter')]
        return next
      })
    },
    [draftKey]
  )

  const handleConfigure = useCallback(
    ($source: string) => {
      clearDraftsForSource($source)
      addGnssSensor($source)
    },
    [addGnssSensor, clearDraftsForSource]
  )

  const handleRemove = useCallback(
    (index: number, $source: string) => {
      clearDraftsForSource($source)
      removeGnssSensor(index)
    },
    [removeGnssSensor, clearDraftsForSource]
  )

  const handleFieldChange = useCallback(
    (
      index: number,
      $source: string,
      field: keyof GnssSensorConfig,
      value: string
    ) => {
      if (field === 'fromBow' || field === 'fromCenter') {
        setDrafts((d) => ({ ...d, [draftKey($source, field)]: value }))
        if (value === '') {
          updateGnssSensor(index, { [field]: null })
          return
        }
        const num = Number(value)
        // Only commit fully-parsable finite numbers; partial inputs like
        // "-", "-2.", or "1e" leave the store value alone so the user can
        // keep typing without seeing it snap back to null.
        if (Number.isFinite(num)) {
          updateGnssSensor(index, { [field]: num })
        }
      } else if (!updateGnssSensor(index, { [field]: value })) {
        // The slice rejects duplicate labels; without feedback the input
        // just snaps back and the edit looks like it was swallowed.
        setGnssSaveFailed(`Sensor label "${value}" is already in use`)
        scheduleSaveErrorClear()
      }
    },
    [updateGnssSensor, draftKey, setGnssSaveFailed, scheduleSaveErrorClear]
  )

  const handleFieldBlur = useCallback(
    ($source: string, field: 'fromBow' | 'fromCenter') => {
      const key = draftKey($source, field)
      setDrafts((d) => {
        if (d[key] === undefined) return d
        const next = { ...d }
        delete next[key]
        return next
      })
      // If the user left a partial input ("-", "2."), the store still holds
      // the last good value but the visible draft would have been the
      // partial — clearing the draft on blur snaps the input back to the
      // canonical store value.
    },
    [draftKey]
  )

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span>
          <FontAwesomeIcon icon={faSatelliteDish} />{' '}
          <strong>GNSS Antenna Positions</strong>
        </span>
        <Button
          size="sm"
          variant="outline-danger"
          onClick={handleReset}
          disabled={resetBusy}
          title="Remove all GNSS sensor rows; the server will stop applying lever-arm correction to navigation.position"
        >
          {resetBusy ? 'Resetting…' : 'Reset all GNSS sensors'}
        </Button>
      </Card.Header>
      <Card.Body>
        {resetError && (
          <Alert
            variant="danger"
            onClose={() => setResetError(null)}
            dismissible
          >
            {resetError}
          </Alert>
        )}
        <Alert variant="info" className="mb-3">
          Configure the physical location of each GNSS antenna on your vessel.
          Accurate antenna positions improve position data by accounting for the
          offset between GNSS receiver and vessel reference point. Positive
          &quot;From Center&quot; values indicate port, negative indicate
          starboard (per Signal K specification).
        </Alert>

        {mergedRows.length === 0 ? (
          <Alert variant="secondary">
            No GNSS sources detected. GNSS sources will appear here when they
            start providing position data.
          </Alert>
        ) : (
          <Table responsive hover size="sm">
            <thead>
              <tr>
                <th style={{ width: 12 }}></th>
                <th>Source</th>
                <th>Sensor Label</th>
                <th>From Bow (m)</th>
                <th>From Center (m)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((row) => {
                const key = row.sensor
                  ? `cfg-${row.$source}`
                  : `det-${row.$source}`
                const color =
                  row.sensor !== null
                    ? COLORS[row.index % COLORS.length]
                    : '#999'
                const isOffline = row.status === 'offline'
                const isUnconfigured = row.status === 'unconfigured'

                return (
                  <tr
                    key={key}
                    className={
                      isUnconfigured
                        ? 'table-warning'
                        : isOffline
                          ? 'text-muted'
                          : ''
                    }
                  >
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: color
                        }}
                      />
                    </td>
                    <td>
                      {(() => {
                        const parts = getDisplayParts(row.$source, sourcesData)
                        return (
                          <>
                            <div>{parts.primary}</div>
                            {parts.secondary && (
                              <small className="text-muted">
                                {parts.secondary}
                              </small>
                            )}
                          </>
                        )
                      })()}
                    </td>
                    <td>
                      {row.sensor ? (
                        <Form.Control
                          type="text"
                          size="sm"
                          value={row.sensor.sensorId}
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              row.$source,
                              'sensorId',
                              e.target.value
                            )
                          }
                          style={{ width: 100 }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.sensor ? (
                        <Form.Control
                          type="number"
                          size="sm"
                          step="0.1"
                          min={vesselDimensions.length !== null ? 0 : undefined}
                          max={vesselDimensions.length ?? undefined}
                          value={
                            drafts[draftKey(row.$source, 'fromBow')] ??
                            (row.sensor.fromBow !== null
                              ? row.sensor.fromBow
                              : '')
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              row.$source,
                              'fromBow',
                              e.target.value
                            )
                          }
                          onBlur={() => handleFieldBlur(row.$source, 'fromBow')}
                          style={{ width: 100 }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.sensor ? (
                        <Form.Control
                          type="number"
                          size="sm"
                          step="0.1"
                          min={
                            vesselDimensions.beam !== null
                              ? -vesselDimensions.beam / 2
                              : undefined
                          }
                          max={
                            vesselDimensions.beam !== null
                              ? vesselDimensions.beam / 2
                              : undefined
                          }
                          value={
                            drafts[draftKey(row.$source, 'fromCenter')] ??
                            (row.sensor.fromCenter !== null
                              ? row.sensor.fromCenter
                              : '')
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              row.$source,
                              'fromCenter',
                              e.target.value
                            )
                          }
                          onBlur={() =>
                            handleFieldBlur(row.$source, 'fromCenter')
                          }
                          style={{ width: 100 }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {isUnconfigured ? (
                        <Badge bg="warning" text="dark">
                          unconfigured
                        </Badge>
                      ) : isOffline ? (
                        <Badge bg="secondary">offline</Badge>
                      ) : (
                        <Badge bg="success">online</Badge>
                      )}
                    </td>
                    <td>
                      {isUnconfigured ? (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleConfigure(row.$source)}
                          title="Configure this GNSS source"
                        >
                          <FontAwesomeIcon icon={faPlus} /> Configure
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleRemove(row.index, row.$source)}
                          title="Remove this sensor configuration"
                          aria-label={`Remove sensor configuration for ${row.sensor?.sensorId || row.$source}`}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}

        {sensors.length > 0 &&
          vesselDimensions.length !== null &&
          vesselDimensions.beam !== null && (
            <BoatSchematicEditor
              sensors={sensors}
              vesselLength={vesselDimensions.length}
              vesselBeam={vesselDimensions.beam}
              colors={COLORS}
              onUpdateSensor={updateGnssSensor}
            />
          )}
      </Card.Body>
      <Card.Footer>
        <Button
          size="sm"
          variant="primary"
          disabled={!saveState.dirty || saveState.isSaving}
          onClick={handleSave}
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> Save
        </Button>
        {saveState.saveFailed && (
          <span className="text-danger ms-2">
            {gnssSensorsData.saveError ||
              'Saving GNSS sensor configuration failed!'}
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

export default GnssPositionSettings
