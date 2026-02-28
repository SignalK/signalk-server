import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Spinner from 'react-bootstrap/Spinner'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSort } from '@fortawesome/free-solid-svg-icons/faSort'
import { faSortUp } from '@fortawesome/free-solid-svg-icons/faSortUp'
import { faSortDown } from '@fortawesome/free-solid-svg-icons/faSortDown'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import { faEyeSlash } from '@fortawesome/free-solid-svg-icons/faEyeSlash'
import { faEye } from '@fortawesome/free-solid-svg-icons/faEye'
import {
  type SourcesData,
  type N2kDeviceEntry,
  type InstanceConflict,
  extractN2kDevices,
  detectInstanceConflicts,
  conflictKey
} from '../../utils/sourceLabels'
import { useSourcesData, useStore } from '../../store'
import SourceLabel from './SourceLabel'

interface Nmea0183Connection {
  name: string
  type: string
  [key: string]: unknown
}

function extractNmea0183(sourcesData: SourcesData): Nmea0183Connection[] {
  const connections: Nmea0183Connection[] = []
  for (const [name, connData] of Object.entries(sourcesData)) {
    if (!connData || typeof connData !== 'object') continue
    if ((connData as Record<string, unknown>).type !== 'NMEA0183') continue
    connections.push({ name, type: 'NMEA0183', ...connData })
  }
  return connections
}

type SortKey =
  | 'sourceRef'
  | 'manufacturerCode'
  | 'modelId'
  | 'modelSerialCode'
  | 'softwareVersionCode'
  | 'deviceClass'
  | 'deviceInstance'
  | 'deviceInstanceLower'
  | 'installationDescription1'
  | 'src'

type SortDirection = 'asc' | 'desc'

interface SortState {
  key: SortKey
  direction: SortDirection
}

const SourceDiscovery: React.FC = () => {
  const sourcesData = useSourcesData()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(
    () => new Set()
  )
  const [sort, setSort] = useState<SortState | null>(null)
  const [conflictFilter, setConflictFilter] = useState<Set<string> | null>(null)
  const [ignoredConflicts, setIgnoredConflicts] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/ignoredInstanceConflicts`, {
      credentials: 'include'
    })
      .then((res) => res.json())
      .then((data) => setIgnoredConflicts(data || {}))
      .catch(() => {})
  }, [])

  const loadSources = useCallback(async () => {
    const response = await fetch('/signalk/v1/api/sources', {
      credentials: 'include'
    })
    const data = await response.json()
    useStore.getState().setSourcesData(data)
  }, [])

  useEffect(() => {
    if (sourcesData) return
    let cancelled = false
    fetch('/signalk/v1/api/sources', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) useStore.getState().setSourcesData(data)
      })
    return () => {
      cancelled = true
    }
  }, [sourcesData])

  const devices = useMemo(
    () => (sourcesData ? extractN2kDevices(sourcesData) : []),
    [sourcesData]
  )

  const sortedDevices = useMemo(() => {
    const base = conflictFilter
      ? devices.filter((d) => conflictFilter.has(d.sourceRef))
      : devices
    if (!sort) return base
    const { key, direction } = sort
    const sorted = [...base].sort((a, b) => {
      const aVal = a[key] ?? ''
      const bVal = b[key] ?? ''
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return cmp
    })
    return direction === 'desc' ? sorted.reverse() : sorted
  }, [devices, sort, conflictFilter])

  const conflicts = useMemo(() => detectInstanceConflicts(devices), [devices])

  const activeConflicts = useMemo(
    () =>
      conflicts.filter(
        (c) =>
          !ignoredConflicts[
            conflictKey(c.deviceA.sourceRef, c.deviceB.sourceRef)
          ]
      ),
    [conflicts, ignoredConflicts]
  )

  const ignoredConflictList = useMemo(
    () =>
      conflicts.filter(
        (c) =>
          !!ignoredConflicts[
            conflictKey(c.deviceA.sourceRef, c.deviceB.sourceRef)
          ]
      ),
    [conflicts, ignoredConflicts]
  )

  const saveIgnored = useCallback((updated: Record<string, string>) => {
    setIgnoredConflicts(updated)
    fetch(`${window.serverRoutesPrefix}/ignoredInstanceConflicts`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(() => {})
  }, [])

  const handleIgnoreConflict = useCallback(
    (c: InstanceConflict) => {
      const key = conflictKey(c.deviceA.sourceRef, c.deviceB.sourceRef)
      saveIgnored({ ...ignoredConflicts, [key]: new Date().toISOString() })
    },
    [ignoredConflicts, saveIgnored]
  )

  const handleRestoreConflict = useCallback(
    (c: InstanceConflict) => {
      const key = conflictKey(c.deviceA.sourceRef, c.deviceB.sourceRef)
      const updated = { ...ignoredConflicts }
      delete updated[key]
      saveIgnored(updated)
    },
    [ignoredConflicts, saveIgnored]
  )

  const conflictSourceRefs = useMemo(() => {
    const refs = new Set<string>()
    for (const c of conflicts) {
      refs.add(c.deviceA.sourceRef)
      refs.add(c.deviceB.sourceRef)
    }
    return refs
  }, [conflicts])

  const conflictPGNsByDevice = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const c of conflicts) {
      for (const ref of [c.deviceA.sourceRef, c.deviceB.sourceRef]) {
        const existing = map.get(ref)
        if (existing) {
          for (const pgn of c.sharedPGNs) existing.add(pgn)
        } else {
          map.set(ref, new Set(c.sharedPGNs))
        }
      }
    }
    return map
  }, [conflicts])

  const nmea0183 = useMemo(
    () => (sourcesData ? extractNmea0183(sourcesData) : []),
    [sourcesData]
  )

  const handleDiscover = useCallback(() => {
    setIsDiscovering(true)
    fetch(`${window.serverRoutesPrefix}/n2kDiscoverDevices`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        const match = (body.message || '').match(/(\d+) devices/)
        const deviceCount = match ? parseInt(match[1], 10) : 0
        return deviceCount > 0 ? deviceCount * 1000 + 2000 : 5000
      })
      .catch(() => 5000)
      .then((delayMs) => {
        setTimeout(() => {
          loadSources().finally(() => setIsDiscovering(false))
        }, delayMs)
      })
  }, [loadSources])

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null
      }
      return { key, direction: 'asc' }
    })
  }, [])

  const toggleDevice = (sourceRef: string) => {
    setExpandedDevices((prev) => {
      const next = new Set(prev)
      if (next.has(sourceRef)) {
        next.delete(sourceRef)
      } else {
        next.add(sourceRef)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedDevices(new Set(devices.map((d) => d.sourceRef)))
  }

  const collapseAll = () => {
    setExpandedDevices(new Set())
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <span style={{ fontWeight: 500 }}>N2K Devices</span>
          <Badge bg="secondary">{devices.length}</Badge>
          <Button
            size="sm"
            variant="primary"
            onClick={handleDiscover}
            disabled={isDiscovering}
          >
            {isDiscovering ? (
              <>
                <Spinner size="sm" animation="border" /> Discovering...
              </>
            ) : (
              'Discover Devices'
            )}
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={loadSources}>
            Refresh
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={expandAll}>
            Expand All
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={collapseAll}>
            Collapse All
          </Button>
        </Card.Header>
        {activeConflicts.length > 0 && (
          <Alert
            variant="warning"
            style={{ margin: '8px 12px 0', fontSize: '0.9rem' }}
          >
            <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
            <strong>
              {activeConflicts.length} instance conflict
              {activeConflicts.length > 1 ? 's' : ''} detected.
            </strong>{' '}
            Devices sharing the same instance and PGNs may confuse instruments.
            {conflictFilter && (
              <Button
                size="sm"
                variant="outline-warning"
                onClick={() => setConflictFilter(null)}
                style={{ marginLeft: '8px', fontSize: '0.85em' }}
              >
                Show all devices
              </Button>
            )}
            {activeConflicts.map((c) => (
              <ConflictDetail
                key={`${c.deviceA.sourceRef}-${c.deviceB.sourceRef}`}
                conflict={c}
                onFilter={setConflictFilter}
                onIgnore={handleIgnoreConflict}
                isActive={
                  conflictFilter !== null &&
                  conflictFilter.has(c.deviceA.sourceRef) &&
                  conflictFilter.has(c.deviceB.sourceRef)
                }
              />
            ))}
          </Alert>
        )}
        <Card.Body style={{ padding: 0 }}>
          {devices.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              No N2K devices found. Click &quot;Discover Devices&quot; after the
              N2K bus has connected.
            </div>
          ) : (
            <Table
              responsive
              bordered
              striped
              size="sm"
              style={{ marginBottom: 0 }}
            >
              <thead>
                <tr>
                  <th></th>
                  <SortableTh
                    label="Name"
                    sortKey="sourceRef"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Manufacturer"
                    sortKey="manufacturerCode"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Model"
                    sortKey="modelId"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Serial"
                    sortKey="modelSerialCode"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Software"
                    sortKey="softwareVersionCode"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Class"
                    sortKey="deviceClass"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Dev Instance"
                    sortKey="deviceInstance"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Data Instance"
                    sortKey="deviceInstanceLower"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Installation"
                    sortKey="installationDescription1"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Address"
                    sortKey="src"
                    currentSort={sort}
                    onToggle={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDevices.map((device) => {
                  const isExpanded = expandedDevices.has(device.sourceRef)
                  return (
                    <DeviceRows
                      key={device.sourceRef}
                      device={device}
                      isExpanded={isExpanded}
                      onToggle={toggleDevice}
                      sourcesData={sourcesData}
                      hasConflict={conflictSourceRefs.has(device.sourceRef)}
                      conflictPGNs={conflictPGNsByDevice.get(device.sourceRef)}
                    />
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {ignoredConflictList.length > 0 && (
        <Card style={{ marginTop: '8px' }}>
          <Card.Header style={{ padding: '8px 12px' }}>
            <FontAwesomeIcon icon={faEyeSlash} />{' '}
            <span style={{ fontWeight: 500 }}>
              {ignoredConflictList.length} Ignored Conflict
              {ignoredConflictList.length > 1 ? 's' : ''}
            </span>
          </Card.Header>
          <Card.Body style={{ padding: '8px 12px', fontSize: '0.9rem' }}>
            {ignoredConflictList.map((c) => (
              <div
                key={`${c.deviceA.sourceRef}-${c.deviceB.sourceRef}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0'
                }}
              >
                <span style={{ flex: 1, color: 'var(--bs-secondary-color)' }}>
                  {c.deviceA.manufacturerCode || c.deviceA.sourceRef} (addr{' '}
                  {c.deviceA.src}){' vs '}
                  {c.deviceB.manufacturerCode || c.deviceB.sourceRef} (addr{' '}
                  {c.deviceB.src}){' \u2014 instance '}
                  {c.deviceInstance}, {c.sharedPGNs.length} shared PGN
                  {c.sharedPGNs.length > 1 ? 's' : ''}
                </span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => handleRestoreConflict(c)}
                  title="Restore this conflict warning"
                >
                  <FontAwesomeIcon icon={faEye} /> Restore
                </Button>
              </div>
            ))}
          </Card.Body>
        </Card>
      )}

      {nmea0183.length > 0 && (
        <Card>
          <Card.Header>
            <span style={{ fontWeight: 500 }}>NMEA 0183 Connections</span>{' '}
            <Badge bg="secondary">{nmea0183.length}</Badge>
          </Card.Header>
          <Card.Body style={{ padding: 0 }}>
            <Table
              responsive
              bordered
              striped
              size="sm"
              style={{ marginBottom: 0 }}
            >
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {nmea0183.map((conn) => (
                  <tr key={conn.name}>
                    <td>{conn.name}</td>
                    <td>{conn.type}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
    </div>
  )
}

const SortableTh: React.FC<{
  label: string
  sortKey: SortKey
  currentSort: SortState | null
  onToggle: (key: SortKey) => void
}> = ({ label, sortKey, currentSort, onToggle }) => {
  const isActive = currentSort?.key === sortKey
  const icon = isActive
    ? currentSort.direction === 'asc'
      ? faSortUp
      : faSortDown
    : faSort
  return (
    <th
      onClick={() => onToggle(sortKey)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{' '}
      <FontAwesomeIcon
        icon={icon}
        style={{ opacity: isActive ? 1 : 0.3, fontSize: '0.85em' }}
      />
    </th>
  )
}

interface DeviceRowsProps {
  device: N2kDeviceEntry
  isExpanded: boolean
  onToggle: (sourceRef: string) => void
  sourcesData: SourcesData | null
  hasConflict: boolean
  conflictPGNs?: Set<string>
}

const DeviceRows: React.FC<DeviceRowsProps> = ({
  device,
  isExpanded,
  onToggle,
  sourcesData,
  hasConflict,
  conflictPGNs
}) => {
  const allPgnKeys = device.pgns
    ? Object.keys(device.pgns).sort((a, b) => Number(a) - Number(b))
    : device.unknownPGNs
      ? Object.keys(device.unknownPGNs).sort((a, b) => Number(a) - Number(b))
      : []

  const hasBatteryPGN = device.pgns ? '127508' in device.pgns : false
  const hasDcPGN = device.pgns ? '127506' in device.pgns : false
  const hasDataInstancePGN = device.pgns
    ? '130312' in device.pgns ||
      '130313' in device.pgns ||
      '130316' in device.pgns ||
      '130823' in device.pgns
    : false

  return (
    <>
      <tr
        onClick={() => onToggle(device.sourceRef)}
        style={{ cursor: 'pointer' }}
      >
        <td style={{ width: '24px', textAlign: 'center' }}>
          {isExpanded ? '\u25BC' : '\u25B6'}
        </td>
        <td>
          <SourceLabel sourceRef={device.sourceRef} sourcesData={sourcesData} />
        </td>
        <td>{device.manufacturerCode || ''}</td>
        <td>{device.modelId || ''}</td>
        <td>{device.modelSerialCode || ''}</td>
        <td>{device.softwareVersionCode || ''}</td>
        <td>{device.deviceClass || ''}</td>
        <InlineInstanceCell
          device={device}
          field="deviceInstance"
          max={253}
          hasConflict={hasConflict}
        />
        <InlineInstanceCell
          device={device}
          field="deviceInstanceLower"
          max={7}
          hasConflict={false}
        />
        <td>{device.installationDescription1 || ''}</td>
        <td>{device.src || ''}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={11} style={{ backgroundColor: '#f8f9fa' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 24px',
                padding: '8px 12px',
                fontSize: '0.85rem'
              }}
            >
              <DetailField label="Connection" value={device.connection} />
              <DetailField label="CAN Name" value={device.canName} />
              <DetailField label="Model Version" value={device.modelVersion} />
              <DetailField
                label="NMEA 2000 Version"
                value={device.nmea2000Version}
              />
              <DetailField
                label="Certification Level"
                value={device.certificationLevel}
              />
              <DetailField label="Unique Number" value={device.uniqueNumber} />
              <DetailField label="Product Code" value={device.productCode} />
              <DetailField
                label="Load Equivalency"
                value={device.loadEquivalency}
              />
              <DetailField
                label="Device Function"
                value={device.deviceFunction}
              />
              <DetailField
                label="System Instance"
                value={device.systemInstance}
              />
              <DetailField
                label="Manufacturer Info"
                value={device.manufacturerInformation}
              />
              <InlineTextField
                device={device}
                field="installationDescription1"
                label="Installation Desc. 1"
              />
              <InlineTextField
                device={device}
                field="installationDescription2"
                label="Installation Desc. 2"
              />
              {hasBatteryPGN && (
                <PgnInstanceField
                  device={device}
                  field="batteryInstance"
                  label="Battery Instance (PGN 127508)"
                  max={252}
                  signalkPaths={['electrical/batteries']}
                />
              )}
              {hasDcPGN && (
                <PgnInstanceField
                  device={device}
                  field="dcInstance"
                  label="DC Instance (PGN 127506)"
                  max={252}
                  signalkPaths={['electrical/dc']}
                />
              )}
              {hasDataInstancePGN && isExpanded && (
                <DataInstanceSection device={device} />
              )}
              {allPgnKeys.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--bs-secondary-color, #6c757d)'
                    }}
                  >
                    Supported PGNs ({allPgnKeys.length}):
                  </span>{' '}
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {allPgnKeys.map((pgn, i) => (
                      <React.Fragment key={pgn}>
                        {i > 0 && ', '}
                        {conflictPGNs?.has(pgn) ? (
                          <span
                            style={{
                              color: 'var(--bs-warning, #f0ad4e)',
                              fontWeight: 600
                            }}
                            title="Instance conflict: another device with the same instance also sends this PGN"
                          >
                            <FontAwesomeIcon
                              icon={faTriangleExclamation}
                              style={{ fontSize: '0.85em', marginRight: '1px' }}
                            />
                            {pgn}
                          </span>
                        ) : (
                          pgn
                        )}
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const VERIFY_INTERVAL_MS = 1000
const VERIFY_TIMEOUT_MS = 8000

const InlineInstanceCell: React.FC<{
  device: N2kDeviceEntry
  field: 'deviceInstance' | 'deviceInstanceLower'
  max: number
  hasConflict: boolean
}> = ({ device, field, max, hasConflict }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'fail' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (saveResult === null) return
    const t = setTimeout(() => setSaveResult(null), 3000)
    return () => clearTimeout(t)
  }, [saveResult])

  const currentValue = device[field]

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(String(currentValue ?? ''))
    setIsEditing(true)
    setSaveResult(null)
  }

  const canSave =
    editValue !== '' &&
    !isNaN(Number(editValue)) &&
    Number(editValue) >= 0 &&
    Number(editValue) <= max &&
    Number(editValue) !== currentValue

  const handleSave = () => {
    if (!canSave) return
    const num = Number(editValue)
    setIsSaving(true)
    fetch(`${window.serverRoutesPrefix}/n2kConfigDevice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dst: Number(device.src),
        field,
        value: num
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error()
        // Poll sources API to verify the device accepted the change
        const deadline = Date.now() + VERIFY_TIMEOUT_MS
        const poll = () => {
          fetch('/signalk/v1/api/sources', { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
              useStore.getState().setSourcesData(data)
              const updated = extractN2kDevices(data).find(
                (d) => d.sourceRef === device.sourceRef
              )
              if (updated && updated[field] === num) {
                setSaveResult('ok')
                setIsSaving(false)
                setIsEditing(false)
              } else if (Date.now() < deadline) {
                setTimeout(poll, VERIFY_INTERVAL_MS)
              } else {
                setSaveResult('fail')
                setIsSaving(false)
                setIsEditing(false)
              }
            })
            .catch(() => {
              setSaveResult('fail')
              setIsSaving(false)
              setIsEditing(false)
            })
        }
        setTimeout(poll, VERIFY_INTERVAL_MS)
      })
      .catch(() => {
        setSaveResult('fail')
        setIsSaving(false)
        setIsEditing(false)
      })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') setIsEditing(false)
  }

  if (isEditing) {
    return (
      <td onClick={(e) => e.stopPropagation()}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={max}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            style={{
              width: '60px',
              fontSize: 'inherit',
              padding: '1px 4px',
              border: '1px solid var(--bs-primary, #20a8d8)',
              borderRadius: '3px',
              outline: 'none'
            }}
          />
          {canSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                fontSize: 'inherit',
                padding: '1px 6px',
                border: '1px solid var(--bs-primary, #20a8d8)',
                borderRadius: '3px',
                backgroundColor: 'var(--bs-primary, #20a8d8)',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              {isSaving ? 'Verifying...' : 'Save'}
            </button>
          )}
          {!isSaving && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              style={{
                fontSize: 'inherit',
                padding: '1px 6px',
                border: '1px solid var(--bs-border-color, #dee2e6)',
                borderRadius: '3px',
                backgroundColor: 'transparent',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          )}
        </span>
      </td>
    )
  }

  return (
    <td
      onClick={handleStartEdit}
      title={`Click to edit (0-${max})`}
      style={{ cursor: 'pointer' }}
    >
      {currentValue ?? ''}
      {saveResult === 'ok' && (
        <span
          style={{ color: 'var(--bs-success, #4dbd74)', marginLeft: '4px' }}
          title="Device confirmed the change"
        >
          ✓
        </span>
      )}
      {saveResult === 'fail' && (
        <span
          style={{ color: 'var(--bs-danger, #f86c6b)', marginLeft: '4px' }}
          title="Device did not confirm the change within timeout"
        >
          ✗
        </span>
      )}
      {hasConflict && (
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          style={{
            color: 'var(--bs-warning, #f0ad4e)',
            marginLeft: '4px'
          }}
          title="Instance conflict: another device has the same instance and sends overlapping PGNs"
        />
      )}
    </td>
  )
}

/**
 * Inline editor for a single instance value. Shows "Current: X" with
 * an input to set a new value and a Save button.
 */
const InstanceRow: React.FC<{
  device: N2kDeviceEntry
  field: 'batteryInstance' | 'dcInstance'
  max: number
  currentValue: number | null
  signalkPaths: string[]
  onInstancesChanged: () => void
}> = ({
  device,
  field,
  max,
  currentValue,
  signalkPaths,
  onInstancesChanged
}) => {
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'fail' | null>(null)

  useEffect(() => {
    if (saveResult === null) return
    const t = setTimeout(() => setSaveResult(null), 3000)
    return () => clearTimeout(t)
  }, [saveResult])

  const handleSave = () => {
    if (editValue === '') return
    const num = Number(editValue)
    if (isNaN(num) || num < 0 || num > max) return
    setIsSaving(true)
    setSaveResult(null)
    const body: Record<string, unknown> = {
      dst: Number(device.src),
      field,
      value: num
    }
    if (currentValue !== null) {
      body.currentValue = currentValue
    }
    fetch(`${window.serverRoutesPrefix}/n2kConfigDevice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((res) => {
        if (!res.ok) throw new Error()
        // Poll SignalK data to verify the instance changed
        const sourceRef = device.sourceRef
        const deadline = Date.now() + VERIFY_TIMEOUT_MS
        const poll = () => {
          Promise.all(
            signalkPaths.map((p) =>
              fetch(`/signalk/v1/api/vessels/self/${p}`, {
                credentials: 'include'
              })
                .then((r) => (r.ok ? r.json() : {}))
                .catch(() => ({}))
            )
          ).then((results) => {
            // Check if the new instance exists for this device
            const allInstances = new Set<number>()
            for (const data of results) {
              for (const [instKey, instData] of Object.entries(data)) {
                const inst = Number(instKey)
                if (isNaN(inst)) continue
                // Check if this instance has data from our device
                const values = (instData as Record<string, unknown>) || {}
                for (const pathData of Object.values(values)) {
                  const pd = pathData as Record<string, unknown>
                  if (pd?.['$source'] === sourceRef) {
                    allInstances.add(inst)
                  }
                  const nested = pd?.values as Record<string, unknown>
                  if (nested?.[sourceRef]) {
                    allInstances.add(inst)
                  }
                }
              }
            }
            if (allInstances.has(num)) {
              setSaveResult('ok')
              setIsSaving(false)
              setEditValue('')
              onInstancesChanged()
            } else if (Date.now() < deadline) {
              setTimeout(poll, VERIFY_INTERVAL_MS)
            } else {
              setSaveResult('fail')
              setIsSaving(false)
            }
          })
        }
        setTimeout(poll, VERIFY_INTERVAL_MS)
      })
      .catch(() => {
        setSaveResult('fail')
        setIsSaving(false)
      })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
  }

  const inputStyle = {
    width: '70px',
    fontSize: 'inherit',
    padding: '1px 4px',
    border: '1px solid var(--bs-border-color, #dee2e6)',
    borderRadius: '3px',
    outline: 'none'
  }

  const btnStyle = {
    fontSize: 'inherit',
    padding: '1px 8px',
    border: '1px solid var(--bs-primary, #20a8d8)',
    borderRadius: '3px',
    backgroundColor: 'var(--bs-primary, #20a8d8)',
    color: '#fff',
    cursor: 'pointer'
  }

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      {currentValue !== null && (
        <span style={{ fontFamily: 'monospace' }}>
          {currentValue} {'\u2192'}
        </span>
      )}
      <input
        type="number"
        min={0}
        max={max}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder={`0\u2013${max}`}
        style={inputStyle}
      />
      {editValue !== '' && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={btnStyle}
        >
          {isSaving ? 'Verifying...' : 'Save'}
        </button>
      )}
      {saveResult === 'ok' && (
        <span
          style={{ color: 'var(--bs-success, #4dbd74)' }}
          title="Device confirmed the change"
        >
          ✓
        </span>
      )}
      {saveResult === 'fail' && (
        <span
          style={{ color: 'var(--bs-danger, #f86c6b)' }}
          title="Device did not confirm the change within timeout"
        >
          ✗
        </span>
      )}
    </span>
  )
}

/**
 * Shows current battery/DC instance values for a device and allows editing.
 * Fetches from SignalK data model to find which instances this device reports.
 * Each instance gets its own edit row with "current → new" controls.
 */
const PgnInstanceField: React.FC<{
  device: N2kDeviceEntry
  field: 'batteryInstance' | 'dcInstance'
  label: string
  max: number
  signalkPaths: string[]
}> = ({ device, field, label, max, signalkPaths }) => {
  const [currentInstances, setCurrentInstances] = useState<number[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const fetchInstances = useCallback(() => {
    const sourceRef = device.sourceRef
    const matchesSource = (obj: unknown): boolean => {
      if (!obj || typeof obj !== 'object') return false
      const entries = Object.entries(obj as Record<string, unknown>)
      for (const [, v] of entries) {
        if (!v || typeof v !== 'object') continue
        const rec = v as Record<string, unknown>
        if (rec.$source === sourceRef) return true
        for (const sv of Object.values(rec)) {
          if (
            sv &&
            typeof sv === 'object' &&
            (sv as Record<string, unknown>).$source === sourceRef
          )
            return true
        }
      }
      return false
    }
    return Promise.all(
      signalkPaths.map((p) =>
        fetch(`/signalk/v1/api/vessels/self/${p}`, {
          credentials: 'include'
        }).then((res) => (res.ok ? res.json() : null))
      )
    ).then((results) => {
      const instanceSet = new Set<number>()
      for (const data of results) {
        if (!data) continue
        for (const [instKey, instData] of Object.entries(data)) {
          if (matchesSource(instData)) {
            instanceSet.add(Number(instKey))
          }
        }
      }
      return Array.from(instanceSet).sort((a, b) => a - b)
    })
  }, [device.sourceRef, signalkPaths])

  useEffect(() => {
    let cancelled = false
    fetchInstances()
      .then((instances) => {
        if (!cancelled) {
          setCurrentInstances(instances)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentInstances([])
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [fetchInstances, reloadKey])

  const labelStyle = {
    fontWeight: 500 as const,
    color: 'var(--bs-secondary-color, #6c757d)'
  }

  if (!loaded) {
    return (
      <div>
        <span style={labelStyle}>{label}:</span> ...
      </div>
    )
  }

  if (currentInstances.length === 0) {
    return (
      <div>
        <span style={labelStyle}>{label}:</span>{' '}
        <InstanceRow
          device={device}
          field={field}
          max={max}
          currentValue={null}
          signalkPaths={signalkPaths}
          onInstancesChanged={() => setReloadKey((k) => k + 1)}
        />
      </div>
    )
  }

  return (
    <div>
      <span style={labelStyle}>{label}:</span>
      {currentInstances.map((inst) => (
        <div key={inst} style={{ marginLeft: '8px', marginTop: '2px' }}>
          <InstanceRow
            device={device}
            field={field}
            max={max}
            currentValue={inst}
            signalkPaths={signalkPaths}
            onInstancesChanged={() => setReloadKey((k) => k + 1)}
          />
        </div>
      ))}
    </div>
  )
}

// NMEA 2000 TEMPERATURE_SOURCE enum labels (matches canboat)
const TEMPERATURE_SOURCE_LABELS: Record<number, string> = {
  0: 'Sea Temperature',
  1: 'Outside Temperature',
  2: 'Inside Temperature',
  3: 'Engine Room Temperature',
  4: 'Main Cabin Temperature',
  5: 'Live Well Temperature',
  6: 'Bait Well Temperature',
  7: 'Refrigeration Temperature',
  8: 'Heating System Temperature',
  9: 'Dew Point Temperature',
  10: 'Apparent Wind Chill Temperature',
  11: 'Theoretical Wind Chill Temperature',
  12: 'Heat Index Temperature',
  13: 'Freezer Temperature',
  14: 'Exhaust Gas Temperature',
  15: 'Shaft Seal Temperature'
}

const HUMIDITY_SOURCE_LABELS: Record<number, string> = {
  0: 'Inside',
  1: 'Outside'
}

interface DataInstance {
  pgn: number
  instance: number
  sourceLabel: string
  sourceEnum?: number
  label?: string
  hardwareChannelId?: number
}

interface ChannelLabel {
  hardwareChannelId: number
  pgn?: number
  instance?: number
  label: string
}

interface DiscoverResult {
  instances: DataInstance[]
  channelLabels: ChannelLabel[]
}

const PGN_LABELS: Record<number, string> = {
  130312: 'Temperature',
  130316: 'Temperature (Ext)',
  130823: 'Temperature (Maretron)',
  130313: 'Humidity'
}

function fieldForPgn(pgn: number): string {
  if (pgn === 130313) return 'humidityInstance'
  return 'temperatureInstance'
}

/**
 * Discovers and displays per-channel data instances for a device.
 * Calls GET /skServer/n2kDiscoverInstances?src=X which listens to
 * the N2K bus for ~6 seconds and returns all instance/source tuples
 * seen from that device.
 */
const DataInstanceSection: React.FC<{
  device: N2kDeviceEntry
}> = ({ device }) => {
  const [instances, setInstances] = useState<DataInstance[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInstances = useCallback(() => {
    return fetch(
      `${window.serverRoutesPrefix}/n2kDiscoverInstances?src=${device.src}&sourceRef=${encodeURIComponent(device.sourceRef)}`,
      { credentials: 'include' }
    ).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<DiscoverResult>
    })
  }, [device.src, device.sourceRef])

  const discover = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchInstances()
      .then((data) => {
        setInstances(data.instances)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [fetchInstances])

  // Auto-discover on mount
  useEffect(() => {
    let cancelled = false
    fetchInstances()
      .then((data) => {
        if (!cancelled) {
          setInstances(data.instances)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [fetchInstances])

  const labelStyle = {
    fontWeight: 500 as const,
    color: 'var(--bs-secondary-color, #6c757d)'
  }

  if (loading) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={labelStyle}>Data Instances:</span>{' '}
        <Spinner size="sm" animation="border" />{' '}
        <span style={{ fontSize: '0.85em', color: '#888' }}>
          Listening to N2K bus (~6s)...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={labelStyle}>Data Instances:</span>{' '}
        <span style={{ color: 'var(--bs-danger, #f86c6b)' }}>{error}</span>{' '}
        <button
          type="button"
          onClick={discover}
          style={{
            fontSize: 'inherit',
            padding: '1px 6px',
            border: '1px solid var(--bs-border-color, #dee2e6)',
            borderRadius: '3px',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const hasInstances = instances && instances.length > 0

  if (!hasInstances) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={labelStyle}>Data Instances:</span>{' '}
        <span style={{ color: '#888' }}>
          {instances ? 'No data instances detected' : '...'}
        </span>{' '}
        <button
          type="button"
          onClick={discover}
          style={{
            fontSize: 'inherit',
            padding: '1px 6px',
            border: '1px solid var(--bs-border-color, #dee2e6)',
            borderRadius: '3px',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Discover
        </button>
      </div>
    )
  }

  // Group data instances by PGN
  const byPgn = new Map<number, DataInstance[]>()
  if (instances) {
    for (const inst of instances) {
      const arr = byPgn.get(inst.pgn)
      if (arr) {
        arr.push(inst)
      } else {
        byPgn.set(inst.pgn, [inst])
      }
    }
  }

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px'
        }}
      >
        <span style={labelStyle}>Data Instances:</span>
        <button
          type="button"
          onClick={discover}
          style={{
            fontSize: '0.8em',
            padding: '1px 6px',
            border: '1px solid var(--bs-border-color, #dee2e6)',
            borderRadius: '3px',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}
        >
          Re-scan
        </button>
      </div>
      {Array.from(byPgn.entries()).map(([pgn, insts]) => (
        <div key={pgn} style={{ marginLeft: '8px', marginBottom: '6px' }}>
          <span style={{ fontWeight: 500, fontSize: '0.85em' }}>
            {PGN_LABELS[pgn] || `PGN ${pgn}`} (PGN {pgn}):
          </span>
          {insts.map((inst) => (
            <DataInstanceRow
              key={`${inst.pgn}-${inst.instance}`}
              device={device}
              inst={inst}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Single data instance row with inline edit controls for instance number,
 * source type, and a user-defined label.
 */
const DataInstanceRow: React.FC<{
  device: N2kDeviceEntry
  inst: DataInstance
}> = ({ device, inst }) => {
  const [editInstance, setEditInstance] = useState('')
  const initialSource =
    inst.sourceEnum !== undefined ? String(inst.sourceEnum) : ''
  const [editSource, setEditSource] = useState(initialSource)
  const [savedSource, setSavedSource] = useState(initialSource)
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'fail' | null>(null)
  const sourceChanged = editSource !== savedSource

  useEffect(() => {
    if (saveResult === null) return
    const t = setTimeout(() => setSaveResult(null), 3000)
    return () => clearTimeout(t)
  }, [saveResult])

  const isTemperaturePGN =
    inst.pgn === 130312 || inst.pgn === 130316 || inst.pgn === 130823
  const isHumidityPGN = inst.pgn === 130313
  const hasSourceDropdown = isTemperaturePGN || isHumidityPGN
  const sourceLabels = isTemperaturePGN
    ? TEMPERATURE_SOURCE_LABELS
    : HUMIDITY_SOURCE_LABELS

  const handleSaveInstance = () => {
    const num = Number(editInstance)
    if (isNaN(num) || num < 0 || num > 252) return
    setIsSaving(true)
    setSaveResult(null)
    fetch(`${window.serverRoutesPrefix}/n2kConfigDevice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dst: Number(device.src),
        field: fieldForPgn(inst.pgn),
        value: num,
        currentValue: inst.instance,
        targetPgn: inst.pgn
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error()
        setSaveResult('ok')
        setIsSaving(false)
        setEditInstance('')
      })
      .catch(() => {
        setSaveResult('fail')
        setIsSaving(false)
      })
  }

  const handleSaveSource = () => {
    if (!sourceChanged) return
    const num = Number(editSource)
    const maxSource = isHumidityPGN ? 1 : 15
    if (isNaN(num) || num < 0 || num > maxSource) return
    setIsSaving(true)
    setSaveResult(null)
    fetch(`${window.serverRoutesPrefix}/n2kConfigDevice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dst: Number(device.src),
        field: isHumidityPGN ? 'humiditySource' : 'temperatureSource',
        value: num,
        currentValue: inst.instance,
        targetPgn: inst.pgn
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error()
        setSaveResult('ok')
        setIsSaving(false)
        setSavedSource(editSource)
      })
      .catch(() => {
        setSaveResult('fail')
        setIsSaving(false)
      })
  }

  const handleInstanceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveInstance()
  }

  const inputStyle = {
    width: '60px',
    fontSize: 'inherit',
    padding: '1px 4px',
    border: '1px solid var(--bs-border-color, #dee2e6)',
    borderRadius: '3px',
    outline: 'none'
  }

  const btnStyle = {
    fontSize: 'inherit',
    padding: '1px 6px',
    border: '1px solid var(--bs-primary, #20a8d8)',
    borderRadius: '3px',
    backgroundColor: 'var(--bs-primary, #20a8d8)',
    color: '#fff',
    cursor: 'pointer'
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginLeft: '12px',
        marginTop: '2px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap'
      }}
    >
      <span style={{ fontFamily: 'monospace', minWidth: '30px' }}>
        {inst.instance}
      </span>
      <span style={{ color: '#555' }}>{inst.sourceLabel}</span>

      {/* Instance edit */}
      <span style={{ marginLeft: '8px', color: '#999' }}>{'\u2192'}</span>
      <input
        type="number"
        min={0}
        max={252}
        value={editInstance}
        onChange={(e) => setEditInstance(e.target.value)}
        onKeyDown={handleInstanceKeyDown}
        disabled={isSaving}
        placeholder="new"
        style={inputStyle}
      />
      {editInstance !== '' && (
        <button
          type="button"
          onClick={handleSaveInstance}
          disabled={isSaving}
          style={btnStyle}
        >
          {isSaving ? '...' : 'Set'}
        </button>
      )}

      {/* Source type edit */}
      {hasSourceDropdown && (
        <>
          <select
            value={editSource}
            onChange={(e) => setEditSource(e.target.value)}
            disabled={isSaving}
            style={{
              fontSize: 'inherit',
              padding: '1px 4px',
              border: '1px solid var(--bs-border-color, #dee2e6)',
              borderRadius: '3px',
              outline: 'none',
              marginLeft: '4px'
            }}
          >
            {initialSource === '' && (
              <option value="">({inst.sourceLabel || 'unknown'})</option>
            )}
            {Object.entries(sourceLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {sourceChanged && (
            <button
              type="button"
              onClick={handleSaveSource}
              disabled={isSaving}
              style={btnStyle}
            >
              {isSaving ? '...' : 'Set'}
            </button>
          )}
        </>
      )}

      {/* Label (read-only, from device PGN 130060) */}
      {inst.label && (
        <span
          style={{
            marginLeft: '8px',
            color: '#333',
            fontStyle: 'italic'
          }}
        >
          {inst.label}
        </span>
      )}

      {saveResult === 'ok' && (
        <span
          style={{ color: 'var(--bs-success, #4dbd74)' }}
          title="Command sent"
        >
          ✓
        </span>
      )}
      {saveResult === 'fail' && (
        <span
          style={{ color: 'var(--bs-danger, #f86c6b)' }}
          title="Failed to send command"
        >
          ✗
        </span>
      )}
    </div>
  )
}

const InlineTextField: React.FC<{
  device: N2kDeviceEntry
  field: 'installationDescription1' | 'installationDescription2'
  label: string
}> = ({ device, field, label }) => {
  const currentValue = device[field] || ''
  const [editState, setEditState] = useState({
    value: currentValue,
    syncedFrom: currentValue
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'fail' | null>(null)

  // Sync editValue from props during render (no effect needed).
  // When not saving and the prop changed, reset to the new prop value.
  let editValue = editState.value
  if (!isSaving && editState.syncedFrom !== currentValue) {
    editValue = currentValue
    setEditState({ value: currentValue, syncedFrom: currentValue })
  }
  const setEditValue = (v: string) =>
    setEditState({ value: v, syncedFrom: currentValue })

  useEffect(() => {
    if (saveResult === null) return
    const t = setTimeout(() => setSaveResult(null), 3000)
    return () => clearTimeout(t)
  }, [saveResult])

  const isDirty = editValue !== currentValue

  const refreshSources = useCallback(() => {
    fetch('/signalk/v1/api/sources', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => useStore.getState().setSourcesData(data))
      .catch(() => {})
  }, [])

  const handleSave = () => {
    if (!isDirty) return
    setIsSaving(true)
    setSaveResult(null)
    const savedValue = editValue
    fetch(`${window.serverRoutesPrefix}/n2kConfigDevice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dst: Number(device.src),
        field,
        value: savedValue
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error()
        // Poll sources API to verify the device accepted the change
        const deadline = Date.now() + VERIFY_TIMEOUT_MS
        const poll = () => {
          fetch('/signalk/v1/api/sources', { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
              useStore.getState().setSourcesData(data)
              const updated = extractN2kDevices(data).find(
                (d) => d.sourceRef === device.sourceRef
              )
              if (updated && (updated[field] || '') === savedValue) {
                setSaveResult('ok')
                setIsSaving(false)
                setEditValue(updated[field] || '')
                // Schedule extra refreshes to catch sibling field changes
                // (e.g. device updates desc2 in response to desc1 write)
                setTimeout(refreshSources, 2000)
                setTimeout(refreshSources, 4000)
              } else if (Date.now() < deadline) {
                setTimeout(poll, VERIFY_INTERVAL_MS)
              } else {
                setSaveResult('fail')
                setIsSaving(false)
              }
            })
            .catch(() => {
              setSaveResult('fail')
              setIsSaving(false)
            })
        }
        setTimeout(poll, VERIFY_INTERVAL_MS)
      })
      .catch(() => {
        setSaveResult('fail')
        setIsSaving(false)
      })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
  }

  const labelStyle = {
    fontWeight: 500 as const,
    color: 'var(--bs-secondary-color, #6c757d)'
  }

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <span style={labelStyle}>{label}:</span>{' '}
      <span
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      >
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          style={{
            width: '320px',
            fontSize: 'inherit',
            padding: '1px 4px',
            border: '1px solid var(--bs-border-color, #dee2e6)',
            borderRadius: '3px',
            outline: 'none'
          }}
        />
        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              fontSize: 'inherit',
              padding: '1px 8px',
              border: '1px solid var(--bs-primary, #20a8d8)',
              borderRadius: '3px',
              backgroundColor: 'var(--bs-primary, #20a8d8)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {isSaving ? 'Verifying...' : 'Save'}
          </button>
        )}
        {saveResult === 'ok' && (
          <span
            style={{ color: 'var(--bs-success, #4dbd74)' }}
            title="Device confirmed the change"
          >
            ✓
          </span>
        )}
        {saveResult === 'fail' && (
          <span
            style={{ color: 'var(--bs-danger, #f86c6b)' }}
            title="Device did not confirm the change within timeout"
          >
            ✗
          </span>
        )}
      </span>
    </div>
  )
}

const ConflictDetail: React.FC<{
  conflict: InstanceConflict
  onFilter: (refs: Set<string>) => void
  onIgnore: (c: InstanceConflict) => void
  isActive: boolean
}> = ({ conflict: c, onFilter, onIgnore, isActive }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      marginTop: '4px',
      paddingLeft: '16px'
    }}
  >
    <span
      onClick={() =>
        onFilter(new Set([c.deviceA.sourceRef, c.deviceB.sourceRef]))
      }
      style={{
        flex: 1,
        cursor: 'pointer',
        fontWeight: isActive ? 600 : undefined,
        textDecoration: 'underline',
        textDecorationStyle: 'dotted' as const,
        textUnderlineOffset: '3px'
      }}
      title="Click to filter table to these two devices"
    >
      {c.deviceA.manufacturerCode || c.deviceA.sourceRef} (addr {c.deviceA.src})
      {' vs '}
      {c.deviceB.manufacturerCode || c.deviceB.sourceRef} (addr {c.deviceB.src})
      {' \u2014 instance '}
      {c.deviceInstance}, {c.sharedPGNs.length} shared PGN
      {c.sharedPGNs.length > 1 ? 's' : ''}
    </span>
    <span
      onClick={(e) => {
        e.stopPropagation()
        onIgnore(c)
      }}
      style={{
        cursor: 'pointer',
        marginLeft: '8px',
        opacity: 0.6,
        fontSize: '0.85em'
      }}
      title="Ignore this conflict"
    >
      <FontAwesomeIcon icon={faEyeSlash} />
    </span>
  </div>
)

const DetailField: React.FC<{
  label: string
  value: string | number | undefined | null
}> = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null
  return (
    <div>
      <span
        style={{
          fontWeight: 500,
          color: 'var(--bs-secondary-color, #6c757d)'
        }}
      >
        {label}:
      </span>{' '}
      {String(value)}
    </div>
  )
}

export default SourceDiscovery
