import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faWater } from '@fortawesome/free-solid-svg-icons/faWater'
import {
  useStore,
  useDepthSensorsData,
  useDepthSources,
  useGnssSensorsData,
  useUnconfiguredDepthSources,
  useSourcesData
} from '../../store'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import type { DepthSensorConfig } from '../../store/types'
import {
  DEPTH_API_PATH,
  EMPTY_DEPTH_CONFIG
} from '../../store/slices/depthSensorsSlice'
import {
  type CenterlineSide,
  fromCenterFor,
  sideOfFromCenter
} from '../../utils/fromCenterSide'
import BoatSchematicEditor from './BoatSchematicEditor'
import BoatSideViewEditor from './BoatSideViewEditor'

type NumericField = 'fromBow' | 'fromCenter' | 'fromWaterline'

interface VesselDimensions {
  length: number | null
  beam: number | null
  draft: number | null
}

const COLORS = ['#6f42c1', '#fd7e14', '#20c997', '#d63384', '#6610f2']
const SAVE_ERROR_CLEAR_MS = 8000
const DEFAULT_SIDE: CenterlineSide = 'starboard'

const positiveOrNull = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const DepthSensorSettings: React.FC = () => {
  const { sensors, saveState, saveError } = useDepthSensorsData()
  const depthSources = useDepthSources()
  const unconfiguredSources = useUnconfiguredDepthSources()
  const gnssSensors = useGnssSensorsData().sensors
  const sourcesData = useSourcesData()
  const { getDisplayParts } = useSourceAliases()

  const updateDepthSensor = useStore((s) => s.updateDepthSensor)
  const addDepthSensor = useStore((s) => s.addDepthSensor)
  const removeDepthSensor = useStore((s) => s.removeDepthSensor)
  const setDepthSaving = useStore((s) => s.setDepthSaving)
  const setDepthSaved = useStore((s) => s.setDepthSaved)
  const setDepthSaveFailed = useStore((s) => s.setDepthSaveFailed)
  const clearDepthSaveFailed = useStore((s) => s.clearDepthSaveFailed)

  const [vessel, setVessel] = useState<VesselDimensions>({
    length: null,
    beam: null,
    draft: null
  })
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSaveError = useCallback(
    (message: string) => {
      setDepthSaveFailed(message)
      if (saveErrorTimerRef.current !== null) {
        clearTimeout(saveErrorTimerRef.current)
      }
      saveErrorTimerRef.current = setTimeout(() => {
        saveErrorTimerRef.current = null
        clearDepthSaveFailed()
      }, SAVE_ERROR_CLEAR_MS)
    },
    [setDepthSaveFailed, clearDepthSaveFailed]
  )
  useEffect(
    () => () => {
      if (saveErrorTimerRef.current !== null) {
        clearTimeout(saveErrorTimerRef.current)
      }
    },
    []
  )
  // Draft strings per input, keyed by $source, so partial input such as
  // "0." survives until it parses; the store only ever holds numbers.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const draftKey = ($source: string, field: NumericField) =>
    `${$source}.${field}`
  // The side picked while a transducer is on the centerline or not yet
  // placed, where fromCenter carries no sign to read it from.
  const [sideChoices, setSideChoices] = useState<
    Record<string, CenterlineSide>
  >({})

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/vessel`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as Record<string, unknown>
      })
      .then((data) =>
        setVessel({
          length: positiveOrNull(data.length),
          beam: positiveOrNull(data.beam),
          draft: positiveOrNull(data.draft)
        })
      )
      .catch((err) => {
        // Dimensions only bound the inputs and enable the schematic.
        console.warn('Failed to load vessel dimensions', err)
      })
  }, [])

  const mutationBusy = saveState.isSaving || resetBusy

  // The inputs are disabled while a save or reset runs; a drag on either
  // view must be ignored then too, or a position the save never sent would
  // be marked clean when it completes.
  const placeSensor = useCallback(
    (index: number, updates: Partial<DepthSensorConfig>) => {
      if (!mutationBusy) updateDepthSensor(index, updates)
    },
    [mutationBusy, updateDepthSensor]
  )

  const rows = useMemo(() => {
    const online = new Set(depthSources)
    return [
      ...sensors.map((sensor, index) => ({
        sensor,
        $source: sensor.$source,
        index,
        online: online.has(sensor.$source)
      })),
      ...unconfiguredSources.map(($source) => ({
        sensor: null,
        $source,
        index: -1,
        online: true
      }))
    ].sort((a, b) => a.$source.localeCompare(b.$source))
  }, [sensors, depthSources, unconfiguredSources])

  const clearEditState = useCallback(($source: string) => {
    setDrafts((d) =>
      Object.fromEntries(
        Object.entries(d).filter(([key]) => !key.startsWith(`${$source}.`))
      )
    )
    setSideChoices((c) => {
      if (c[$source] === undefined) return c
      const next = { ...c }
      delete next[$source]
      return next
    })
  }, [])

  const handleConfigure = ($source: string) => {
    clearEditState($source)
    addDepthSensor($source)
  }

  const handleSave = useCallback(async () => {
    setDepthSaving()
    try {
      const response = await fetch(DEPTH_API_PATH, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensors })
      })
      if (response.ok) {
        setDepthSaved()
        return
      }
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
      }
      showSaveError(body.message || `Save failed (HTTP ${response.status})`)
    } catch (err) {
      showSaveError((err as Error).message || 'Save failed')
    }
  }, [sensors, setDepthSaving, setDepthSaved, showSaveError])

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset all depth transducer positions?')) return
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await fetch(DEPTH_API_PATH, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      useStore.getState().setDepthSensors(EMPTY_DEPTH_CONFIG, true)
      setDrafts({})
      setSideChoices({})
    } catch (e) {
      setResetError(`Reset failed: ${(e as Error).message}`)
    } finally {
      setResetBusy(false)
    }
  }, [])

  const handleLabelChange = useCallback(
    (index: number, value: string) => {
      if (!updateDepthSensor(index, { sensorId: value })) {
        showSaveError(`Sensor label "${value}" is already in use`)
      }
    },
    [updateDepthSensor, showSaveError]
  )

  // Commit a distance that parses; keep anything else as a draft until
  // blur snaps the input back to the stored value. All three inputs take
  // unsigned distances: the side selector carries fromCenter's sign.
  const handleDistanceChange = useCallback(
    (
      index: number,
      $source: string,
      field: NumericField,
      value: string,
      side: CenterlineSide
    ) => {
      setDrafts((d) => ({ ...d, [draftKey($source, field)]: value }))
      if (field === 'fromCenter') {
        setSideChoices((c) =>
          c[$source] === side ? c : { ...c, [$source]: side }
        )
      }
      if (value === '') {
        updateDepthSensor(index, { [field]: null })
        return
      }
      const distance = Number(value)
      if (!Number.isFinite(distance) || distance < 0) return
      updateDepthSensor(index, {
        [field]:
          field === 'fromCenter' ? fromCenterFor(distance, side) : distance
      })
    },
    [updateDepthSensor]
  )

  const handleSideChange = useCallback(
    (
      index: number,
      $source: string,
      fromCenter: number | null,
      side: CenterlineSide
    ) => {
      setSideChoices((c) => ({ ...c, [$source]: side }))
      if (fromCenter !== null && fromCenter !== 0) {
        updateDepthSensor(index, {
          fromCenter: fromCenterFor(Math.abs(fromCenter), side)
        })
      }
    },
    [updateDepthSensor]
  )

  const handleBlur = useCallback(($source: string, field: NumericField) => {
    const key = draftKey($source, field)
    setDrafts((d) => {
      if (d[key] === undefined) return d
      const next = { ...d }
      delete next[key]
      return next
    })
  }, [])

  const distanceInput = (
    row: (typeof rows)[number],
    field: NumericField,
    label: string,
    max: number | null,
    side: CenterlineSide
  ) => {
    const stored = row.sensor ? row.sensor[field] : null
    const draft = drafts[draftKey(row.$source, field)]
    const invalid = draft !== undefined && Number(draft) < 0
    return (
      <Form.Control
        type="number"
        aria-label={`${label} in meters for ${row.$source}`}
        step="0.1"
        min={0}
        max={max ?? undefined}
        value={draft ?? (stored !== null ? Math.abs(stored) : '')}
        isInvalid={invalid}
        disabled={mutationBusy}
        onFocus={
          row.sensor === null ? () => handleConfigure(row.$source) : undefined
        }
        onChange={(e) =>
          row.sensor &&
          handleDistanceChange(
            row.index,
            row.$source,
            field,
            e.target.value,
            side
          )
        }
        onBlur={() => handleBlur(row.$source, field)}
        style={{ width: 80 }}
      />
    )
  }

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span>
          <FontAwesomeIcon icon={faWater} />{' '}
          <strong>Depth Transducer Positions</strong>
        </span>
        <Button
          size="sm"
          variant="outline-danger"
          onClick={handleReset}
          disabled={mutationBusy}
        >
          {resetBusy ? 'Resetting…' : 'Reset all depth transducers'}
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
          Configure where each depth transducer sits on your vessel. Every
          source reporting a depth gets a row, whether it is an NMEA 2000 or
          NMEA 0183 sounder or a plugin. &quot;Below Waterline&quot; is how deep
          the transducer sits under the surface. Configure a detected source by
          editing one of its fields.
        </Alert>

        {rows.length === 0 ? (
          <Alert variant="secondary">
            No depth sources detected. Depth sources will appear here when they
            start providing depth data.
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
                <th>Below Waterline (m)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const color =
                  row.sensor !== null
                    ? COLORS[row.index % COLORS.length]
                    : '#999'
                const fromCenter = row.sensor ? row.sensor.fromCenter : null
                const side = sideOfFromCenter(
                  fromCenter,
                  sideChoices[row.$source] ?? DEFAULT_SIDE
                )
                const parts = getDisplayParts(row.$source, sourcesData)
                return (
                  <tr
                    key={row.$source}
                    className={
                      row.sensor === null
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
                          backgroundColor: color
                        }}
                      />
                    </td>
                    <td>
                      <div>{parts.primary}</div>
                      {parts.secondary && (
                        <small className="text-muted">{parts.secondary}</small>
                      )}
                    </td>
                    <td>
                      <Form.Control
                        type="text"
                        size="sm"
                        aria-label={`Sensor label for ${row.$source}`}
                        value={row.sensor ? row.sensor.sensorId : ''}
                        placeholder="label"
                        disabled={mutationBusy}
                        onFocus={
                          row.sensor === null
                            ? () => handleConfigure(row.$source)
                            : undefined
                        }
                        onChange={(e) =>
                          row.sensor &&
                          handleLabelChange(row.index, e.target.value)
                        }
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <InputGroup size="sm">
                        {distanceInput(
                          row,
                          'fromBow',
                          'From bow',
                          vessel.length,
                          side
                        )}
                      </InputGroup>
                    </td>
                    <td>
                      <InputGroup size="sm" className="flex-nowrap">
                        {distanceInput(
                          row,
                          'fromCenter',
                          'From center',
                          vessel.beam !== null ? vessel.beam / 2 : null,
                          side
                        )}
                        <Form.Select
                          aria-label={`Side of the centerline for ${row.$source}`}
                          value={side}
                          disabled={mutationBusy}
                          onFocus={
                            row.sensor === null
                              ? () => handleConfigure(row.$source)
                              : undefined
                          }
                          onChange={(e) =>
                            row.sensor &&
                            handleSideChange(
                              row.index,
                              row.$source,
                              fromCenter,
                              e.target.value === 'port' ? 'port' : 'starboard'
                            )
                          }
                          style={{ width: 'auto' }}
                        >
                          <option value="port">Port</option>
                          <option value="starboard">Starboard</option>
                        </Form.Select>
                      </InputGroup>
                    </td>
                    <td>
                      <InputGroup size="sm">
                        {distanceInput(
                          row,
                          'fromWaterline',
                          'Below waterline',
                          vessel.draft,
                          side
                        )}
                      </InputGroup>
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
                          onClick={() => {
                            clearEditState(row.$source)
                            removeDepthSensor(row.index)
                          }}
                          aria-label={`Clear transducer configuration for ${row.sensor.sensorId || row.$source}`}
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

        {sensors.length > 0 && vessel.length !== null && (
          <div className="d-flex flex-wrap justify-content-center align-items-start column-gap-4">
            {vessel.beam !== null && (
              <div>
                <BoatSchematicEditor
                  sensors={sensors}
                  vesselLength={vessel.length}
                  vesselBeam={vessel.beam}
                  colors={COLORS}
                  onUpdateSensor={placeSensor}
                  square
                  referenceSensors={gnssSensors}
                />
                {gnssSensors.length > 0 && (
                  <small className="d-block text-center text-muted">
                    Hollow circles are the GNSS antennas.
                  </small>
                )}
              </div>
            )}
            <div className="mt-3">
              {vessel.draft !== null ? (
                <>
                  <BoatSideViewEditor
                    sensors={sensors}
                    vesselLength={vessel.length}
                    draft={vessel.draft}
                    colors={COLORS}
                    onUpdateSensor={placeSensor}
                  />
                  <small className="d-block text-center text-muted">
                    Drag a transducer up or down to set its depth.
                  </small>
                </>
              ) : (
                <small className="text-muted">
                  Set the draft in{' '}
                  <a href="#/serverConfiguration/settings">
                    Vessel Configuration
                  </a>{' '}
                  to place transducers in the side view.
                </small>
              )}
            </div>
          </div>
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
            {saveError || 'Saving depth transducer positions failed!'}
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

export default DepthSensorSettings
