import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  length: number
  beam: number
}

const COLORS = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0']

const GpsPositionSettings: React.FC = () => {
  const gpsSensorsData = useGpsSensorsData()
  const positionSources = usePositionSources()
  const sourcesData = useSourcesData()
  const { getDisplayName } = useSourceAliases()

  const updateGpsSensor = useStore((s) => s.updateGpsSensor)
  const addGpsSensor = useStore((s) => s.addGpsSensor)
  const removeGpsSensor = useStore((s) => s.removeGpsSensor)
  const setGpsSaving = useStore((s) => s.setGpsSaving)
  const setGpsSaved = useStore((s) => s.setGpsSaved)
  const setGpsSaveFailed = useStore((s) => s.setGpsSaveFailed)
  const clearGpsSaveFailed = useStore((s) => s.clearGpsSaveFailed)

  const [vesselDimensions, setVesselDimensions] = useState<VesselDimensions>({
    length: 15,
    beam: 4
  })

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/vessel`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const length = Number(data.length)
        const beam = Number(data.beam)
        if (length > 0 && beam > 0) {
          setVesselDimensions({ length, beam })
        }
      })
      .catch(() => {})
  }, [])

  const { sensors, saveState } = gpsSensorsData

  const mergedRows = useMemo(() => {
    const configuredRefs = new Set(sensors.map((s) => s.sourceRef))
    const rows: {
      sensor: GpsSensorConfig | null
      sourceRef: string
      index: number
      status: 'configured' | 'unconfigured' | 'offline'
    }[] = []

    sensors.forEach((sensor, index) => {
      const isOnline =
        !sensor.sourceRef || positionSources.includes(sensor.sourceRef)
      rows.push({
        sensor,
        sourceRef: sensor.sourceRef,
        index,
        status: isOnline ? 'configured' : 'offline'
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
    (e: React.MouseEvent) => {
      e.preventDefault()
      setGpsSaving()
      fetch(`${window.serverRoutesPrefix}/gpsSensors`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensors)
      })
        .then((response) => {
          if (response.status === 200) {
            setGpsSaved()
          } else {
            throw new Error()
          }
        })
        .catch(() => {
          setGpsSaveFailed()
          setTimeout(() => clearGpsSaveFailed(), 5000)
        })
    },
    [sensors, setGpsSaving, setGpsSaved, setGpsSaveFailed, clearGpsSaveFailed]
  )

  const handleConfigure = useCallback(
    (sourceRef: string) => {
      addGpsSensor(sourceRef)
    },
    [addGpsSensor]
  )

  const handleRemove = useCallback(
    (index: number) => {
      removeGpsSensor(index)
    },
    [removeGpsSensor]
  )

  const handleFieldChange = useCallback(
    (index: number, field: keyof GpsSensorConfig, value: string) => {
      if (field === 'fromBow' || field === 'fromCenter') {
        const num = value === '' ? null : Number(value)
        updateGpsSensor(index, {
          [field]: num !== null && !isNaN(num) ? num : null
        })
      } else {
        updateGpsSensor(index, { [field]: value })
      }
    },
    [updateGpsSensor]
  )

  return (
    <Card className="mb-4">
      <Card.Header>
        <FontAwesomeIcon icon={faSatelliteDish} />{' '}
        <strong>GPS Antenna Positions</strong>
      </Card.Header>
      <Card.Body>
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
                  ? `cfg-${row.index}`
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
                      {getDisplayName(row.sourceRef, sourcesData) ||
                        row.sourceRef || <em>unlinked</em>}
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
                          value={
                            row.sensor.fromBow !== null
                              ? row.sensor.fromBow
                              : ''
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              'fromBow',
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
                          value={
                            row.sensor.fromCenter !== null
                              ? row.sensor.fromCenter
                              : ''
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              row.index,
                              'fromCenter',
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
                          onClick={() => handleRemove(row.index)}
                          title="Remove this sensor configuration"
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

        {sensors.length > 0 && (
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
            Saving GPS sensor configuration failed!
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

export default GpsPositionSettings
