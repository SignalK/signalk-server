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
  useGpsSensorsData,
  usePositionSources,
  useSourcesData
} from '../../store'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import type { GpsSensorConfig } from '../../store/types'
import BoatSchematicEditor from './BoatSchematicEditor'

interface VesselDimensions {
  length: number | null
  beam: number | null
}

const COLORS = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0']
const SAVE_ERROR_CLEAR_MS = 8000

const GpsPositionSettings: React.FC = () => {
  const gpsSensorsData = useGpsSensorsData()
  const positionSources = usePositionSources()
  const sourcesData = useSourcesData()
  const { getDisplayParts } = useSourceAliases()

  const updateGpsSensor = useStore((s) => s.updateGpsSensor)
  const addGpsSensor = useStore((s) => s.addGpsSensor)
  const removeGpsSensor = useStore((s) => s.removeGpsSensor)
  const setGpsSaving = useStore((s) => s.setGpsSaving)
  const setGpsSaved = useStore((s) => s.setGpsSaved)
  const setGpsSaveFailed = useStore((s) => s.setGpsSaveFailed)
  const clearGpsSaveFailed = useStore((s) => s.clearGpsSaveFailed)

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
      clearGpsSaveFailed()
    }, SAVE_ERROR_CLEAR_MS)
  }, [clearGpsSaveFailed])
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
  // Key drafts by the sensor's immutable sourceRef so an in-progress edit
  // stays attached to the right row across add / remove / reorder.
  const draftKey = useCallback(
    (sourceRef: string, field: 'fromBow' | 'fromCenter') =>
      `${sourceRef}.${field}`,
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

  const { sensors, saveState } = gpsSensorsData

  const mergedRows = useMemo(() => {
    const configuredRefs = new Set(sensors.map((s) => s.sourceRef))
    const activeSourceRefs = new Set(positionSources)
    const rows: {
      sensor: GpsSensorConfig | null
      sourceRef: string
      index: number
      status: 'configured' | 'unconfigured' | 'offline'
    }[] = []

    sensors.forEach((sensor, index) => {
      rows.push({
        sensor,
        sourceRef: sensor.sourceRef,
        index,
        status: activeSourceRefs.has(sensor.sourceRef)
          ? 'configured'
          : 'offline'
      })
    })

    positionSources.forEach((ref) => {
      if (!configuredRefs.has(ref)) {
        rows.push({
          sensor: null,
          sourceRef: ref,
          index: -1,
          status: 'unconfigured'
        })
      }
    })

    return rows
  }, [sensors, positionSources])

  const handleSave = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      setGpsSaving()
      try {
        const response = await fetch(
          `${window.serverRoutesPrefix}/gpsSensors`,
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
          setGpsSaved()
          return
        }
        // Backend validators (typebox shape, duplicate ids, physical bounds)
        // send the rejection reason as plain text — surface it so the user
        // can correct the specific sensor/value instead of guessing.
        const message =
          (await response.text().catch(() => '')) ||
          `Save failed (HTTP ${response.status})`
        setGpsSaveFailed(message)
        scheduleSaveErrorClear()
      } catch (err) {
        setGpsSaveFailed((err as Error).message || 'Save failed')
        scheduleSaveErrorClear()
      }
    },
    [
      sensors,
      setGpsSaving,
      setGpsSaved,
      setGpsSaveFailed,
      scheduleSaveErrorClear
    ]
  )

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset all GPS antenna positions?\n\n' +
        'This removes every configured sensor row. The server stops ' +
        'applying lever-arm correction to navigation.position and detected ' +
        'sources will reappear as "unconfigured" rows.'
    )
    if (!confirmed) return
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await fetch(`${window.serverRoutesPrefix}/gpsSensors`, {
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
      useStore.getState().setGpsSensors([])
      setDrafts({})
    } catch (e) {
      setResetError(`Reset failed: ${(e as Error).message}`)
    } finally {
      setResetBusy(false)
    }
  }, [])

  // Clear in-flight draft strings keyed by sourceRef. Drafts hold partial
  // user input like "-" or "-2." so the typed value survives null commits
  // mid-edit; without this clear, a stale draft would shadow the fresh
  // store value if the same sourceRef came back into the table.
  const clearDraftsForSource = useCallback(
    (sourceRef: string) => {
      setDrafts((d) => {
        const next = { ...d }
        delete next[draftKey(sourceRef, 'fromBow')]
        delete next[draftKey(sourceRef, 'fromCenter')]
        return next
      })
    },
    [draftKey]
  )

  const handleConfigure = useCallback(
    (sourceRef: string) => {
      clearDraftsForSource(sourceRef)
      addGpsSensor(sourceRef)
    },
    [addGpsSensor, clearDraftsForSource]
  )

  const handleRemove = useCallback(
    (index: number, sourceRef: string) => {
      clearDraftsForSource(sourceRef)
      removeGpsSensor(index)
    },
    [removeGpsSensor, clearDraftsForSource]
  )

  const handleFieldChange = useCallback(
    (
      index: number,
      sourceRef: string,
      field: keyof GpsSensorConfig,
      value: string
    ) => {
      if (field === 'fromBow' || field === 'fromCenter') {
        setDrafts((d) => ({ ...d, [draftKey(sourceRef, field)]: value }))
        if (value === '') {
          updateGpsSensor(index, { [field]: null })
          return
        }
        const num = Number(value)
        // Only commit fully-parsable finite numbers; partial inputs like
        // "-", "-2.", or "1e" leave the store value alone so the user can
        // keep typing without seeing it snap back to null.
        if (Number.isFinite(num)) {
          updateGpsSensor(index, { [field]: num })
        }
      } else {
        updateGpsSensor(index, { [field]: value })
      }
    },
    [updateGpsSensor, draftKey]
  )

  const handleFieldBlur = useCallback(
    (sourceRef: string, field: 'fromBow' | 'fromCenter') => {
      const key = draftKey(sourceRef, field)
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
          <strong>GPS Antenna Positions</strong>
        </span>
        <Button
          size="sm"
          variant="outline-danger"
          onClick={handleReset}
          disabled={resetBusy}
          title="Remove all GPS sensor rows; the server will stop applying lever-arm correction to navigation.position"
        >
          {resetBusy ? 'Resetting…' : 'Reset all GPS sensors'}
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
          Configure the physical location of each GPS antenna on your vessel.
          Accurate antenna positions improve position data by accounting for the
          offset between GPS receiver and vessel reference point. Positive
          &quot;From Center&quot; values indicate port, negative indicate
          starboard (per Signal K specification).
        </Alert>

        {mergedRows.length === 0 ? (
          <Alert variant="secondary">
            No GPS sources detected. GPS sources will appear here when they
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
                  ? `cfg-${row.sourceRef}`
                  : `det-${row.sourceRef}`
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
                        const parts = getDisplayParts(
                          row.sourceRef,
                          sourcesData
                        )
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
                              row.sourceRef,
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
                            drafts[draftKey(row.sourceRef, 'fromBow')] ??
                            (row.sensor.fromBow !== null
                              ? row.sensor.fromBow
                              : '')
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              row.sourceRef,
                              'fromBow',
                              e.target.value
                            )
                          }
                          onBlur={() =>
                            handleFieldBlur(row.sourceRef, 'fromBow')
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
                            drafts[draftKey(row.sourceRef, 'fromCenter')] ??
                            (row.sensor.fromCenter !== null
                              ? row.sensor.fromCenter
                              : '')
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              row.sourceRef,
                              'fromCenter',
                              e.target.value
                            )
                          }
                          onBlur={() =>
                            handleFieldBlur(row.sourceRef, 'fromCenter')
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
                          onClick={() => handleConfigure(row.sourceRef)}
                          title="Configure this GPS source"
                        >
                          <FontAwesomeIcon icon={faPlus} /> Configure
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleRemove(row.index, row.sourceRef)}
                          title="Remove this sensor configuration"
                          aria-label={`Remove sensor configuration for ${row.sensor?.sensorId || row.sourceRef}`}
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
              onUpdateSensor={updateGpsSensor}
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
            {gpsSensorsData.saveError ||
              'Saving GPS sensor configuration failed!'}
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

export default GpsPositionSettings
