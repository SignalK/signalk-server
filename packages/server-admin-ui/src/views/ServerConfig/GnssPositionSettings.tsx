import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons/faSatelliteDish'
import {
  useStore,
  useGnssSensorsData,
  usePositionSources,
  useUnconfiguredGnssSources,
  useSourcesData
} from '../../store'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import type { GnssCorrectionMode, GnssSensorConfig } from '../../store/types'
import {
  EMPTY_GNSS_CONFIG,
  GNSS_API_PATH
} from '../../store/slices/gnssPositionSlice'
import BoatSchematicEditor from './BoatSchematicEditor'

const CORRECTION_OPTIONS: {
  value: GnssCorrectionMode
  label: string
  help: string
}[] = [
  {
    value: 'off',
    label: 'No correction',
    help: 'Antenna positions are saved but navigation.position data is not modified.'
  },
  {
    value: 'replace',
    label: 'In place correction (replace original)',
    help: 'navigation.position from configured antennas is corrected to the vessel reference point (CCRP). The raw antenna value is replaced; use "Original & corrected" to keep both.'
  },
  {
    value: 'both',
    label: 'Correction as copy (keep original)',
    help: 'The original data is left untouched and the corrected position is additionally published under <sensor label>.ccrp, selectable via source priorities.'
  }
]

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
  const setGnssCorrection = useStore((s) => s.setGnssCorrection)
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
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { length?: unknown; beam?: unknown }
      })
      .then((data) => {
        const length = Number(data.length)
        const beam = Number(data.beam)
        setVesselDimensions({
          length: Number.isFinite(length) && length > 0 ? length : null,
          beam: Number.isFinite(beam) && beam > 0 ? beam : null
        })
      })
      .catch((err) => {
        // Dimensions only tighten input bounds and enable the schematic;
        // the page works without them, so a failure is non-blocking.
        console.warn('Failed to load vessel dimensions', err)
      })
  }, [])

  const { correction, sensors, saveState, status } = gnssSensorsData

  // Lever-arm correction ('replace'/'both') needs the vessel length to
  // locate the CCRP; without it the server cannot correct. Disable those
  // choices and point the user at where length is set.
  const lengthMissing = vesselDimensions.length === null
  const VESSEL_SETTINGS_HASH = '#/serverConfiguration/settings'
  // Save (PUT) and reset (DELETE) mutate the same GNSS config; disable both
  // while either is in flight so they cannot race on response order.
  const mutationBusy = saveState.isSaving || resetBusy

  const mergedRows = useMemo(() => {
    const activeSourceRefs = new Set(positionSources)
    const rows: {
      sensor: GnssSensorConfig | null
      $source: string
      index: number
      online: boolean
    }[] = []

    sensors.forEach((sensor, index) => {
      rows.push({
        sensor,
        $source: sensor.$source,
        index,
        online: activeSourceRefs.has(sensor.$source)
      })
    })

    unconfiguredSources.forEach((ref) => {
      // Unconfigured rows come from the live positionSources set, so
      // they are online by definition.
      rows.push({
        sensor: null,
        $source: ref,
        index: -1,
        online: true
      })
    })

    // Stable ordering by source ref: a row keeps its place when it
    // transitions between unconfigured and configured, so the input the
    // user just focused does not jump elsewhere in the table.
    return rows.sort((a, b) => a.$source.localeCompare(b.$source))
  }, [sensors, positionSources, unconfiguredSources])

  const handleSave = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      setGnssSaving()
      try {
        const response = await fetch(GNSS_API_PATH, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correction, sensors })
        })
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
      correction,
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
        'This removes every configured sensor row and turns lever-arm ' +
        'correction off. Detected sources will reappear as ' +
        '"unconfigured" rows.'
    )
    if (!confirmed) return
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await fetch(GNSS_API_PATH, {
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
      useStore.getState().setGnssSensors(EMPTY_GNSS_CONFIG, true)
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
      } else if (saveErrorTimerRef.current !== null) {
        // A successful edit invalidates a still-visible duplicate-label
        // error; clear it now instead of waiting for the 8s timer.
        clearTimeout(saveErrorTimerRef.current)
        saveErrorTimerRef.current = null
        clearGnssSaveFailed()
      }
    },
    [
      updateGnssSensor,
      draftKey,
      setGnssSaveFailed,
      scheduleSaveErrorClear,
      clearGnssSaveFailed
    ]
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
          disabled={mutationBusy}
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
          starboard (per Signal K specification). Configure a detected source by
          editing one of its fields.
        </Alert>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold">Lever-arm correction</Form.Label>
          {CORRECTION_OPTIONS.map((opt) => {
            // 'off' is always available; the correcting modes need length.
            const requiresLength = opt.value !== 'off'
            const disabled = requiresLength && lengthMissing
            return (
              <Form.Check
                key={opt.value}
                type="radio"
                id={`gnss-correction-${opt.value}`}
                name="gnss-correction"
                checked={correction === opt.value}
                disabled={disabled || mutationBusy}
                onChange={() => setGnssCorrection(opt.value)}
                label={
                  <>
                    {opt.label}{' '}
                    <small className="text-muted">— {opt.help}</small>
                  </>
                }
              />
            )
          })}
          {/* Show the length warning from either the mount-time /vessel
              snapshot or the live server status, so a length that goes
              missing while the page is open still surfaces. */}
          {(lengthMissing || status?.blocked === 'no-length') && (
            <Alert variant="info" className="mt-1 mb-0 py-1 px-2">
              <small className="d-block mt-1">
                Position correction requires the vessel length.{' '}
                <a href={VESSEL_SETTINGS_HASH}>
                  Set it in Vessel Configuration
                </a>
                .
              </small>
            </Alert>
          )}
          {status && status.blocked === 'no-heading' && (
            <Alert variant="warning" className="mt-1 mb-0 py-1 px-2">
            <small className="d-block mt-1">
              Correction is enabled but inactive: no true heading is available.
              It will resume automatically when heading data returns.
            </small>
            </Alert>
          )}
          {status && status.active && (
            <small className="d-block text-success mt-1">
              Correction is active.
            </small>
          )}
        </Form.Group>

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
                const color =
                  row.sensor !== null
                    ? COLORS[row.index % COLORS.length]
                    : '#999'
                const isUnconfigured = row.sensor === null
                // Focusing any input of an unconfigured row starts its
                // configuration: the row gets a sensor entry and the same
                // input keeps focus, so "click and type" just works.
                const configureOnFocus = isUnconfigured
                  ? () => handleConfigure(row.$source)
                  : undefined

                return (
                  <tr
                    key={row.$source}
                    className={
                      isUnconfigured
                        ? 'table-warning'
                        : !row.online
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
                      <Form.Control
                        type="text"
                        size="sm"
                        aria-label={`Sensor label for ${row.$source}`}
                        value={row.sensor ? row.sensor.sensorId : ''}
                        placeholder="label"
                        disabled={mutationBusy}
                        onFocus={configureOnFocus}
                        onChange={(e) =>
                          row.sensor &&
                          handleFieldChange(
                            row.index,
                            row.$source,
                            'sensorId',
                            e.target.value
                          )
                        }
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <Form.Control
                        type="number"
                        size="sm"
                        aria-label={`From bow in meters for ${row.$source}`}
                        step="0.1"
                        min={vesselDimensions.length !== null ? 0 : undefined}
                        max={vesselDimensions.length ?? undefined}
                        value={
                          drafts[draftKey(row.$source, 'fromBow')] ??
                          (row.sensor && row.sensor.fromBow !== null
                            ? row.sensor.fromBow
                            : '')
                        }
                        disabled={mutationBusy}
                        onFocus={configureOnFocus}
                        onChange={(e) =>
                          row.sensor &&
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
                    </td>
                    <td>
                      <Form.Control
                        type="number"
                        size="sm"
                        aria-label={`From center in meters for ${row.$source}`}
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
                          (row.sensor && row.sensor.fromCenter !== null
                            ? row.sensor.fromCenter
                            : '')
                        }
                        disabled={mutationBusy}
                        onFocus={configureOnFocus}
                        onChange={(e) =>
                          row.sensor &&
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
                    </td>
                    <td>
                      {row.online ? (
                        <Badge bg="success">online</Badge>
                      ) : (
                        <Badge bg="secondary">offline</Badge>
                      )}
                    </td>
                    <td>
                      {row.sensor && (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          disabled={mutationBusy}
                          onClick={() => handleRemove(row.index, row.$source)}
                          title="Clear this sensor's antenna configuration"
                          aria-label={`Clear antenna configuration for ${row.sensor.sensorId || row.$source}`}
                        >
                          Clear
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
          disabled={!saveState.dirty || mutationBusy}
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
