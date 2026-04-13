import React, { useState, useEffect, useCallback, useRef } from 'react'
import Badge from 'react-bootstrap/Badge'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBluetooth } from '@fortawesome/free-brands-svg-icons/faBluetooth'
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle'
import { faTowerBroadcast } from '@fortawesome/free-solid-svg-icons/faTowerBroadcast'
import { faLink } from '@fortawesome/free-solid-svg-icons/faLink'
import { faPlug } from '@fortawesome/free-solid-svg-icons/faPlug'
import { faMicrochip } from '@fortawesome/free-solid-svg-icons/faMicrochip'

const BLE_API = '/signalk/v2/api/vessels/self/ble'
const GATEWAY_API = '/signalk/v2/api/ble'

interface SeenByEntry {
  providerId: string
  rssi: number
  lastSeen: number
}

interface BLEDeviceInfo {
  mac: string
  name?: string
  rssi: number
  lastSeen: number
  connectable: boolean
  seenBy: SeenByEntry[]
  gattClaimedBy?: string | null
}

interface ConsumerInfo {
  pluginId: string
  advertisementSubscriber: boolean
  gattClaims: string[]
}

interface BLESettings {
  localBluetoothManaged: boolean
  localAdapters: string[]
  localMaxGATTSlots: number
  localBLESupported: boolean
  activeAdapters: string[]
  adapterErrors: Record<string, string>
}

interface GatewayInfo {
  gatewayId: string
  ipAddress?: string
  firmware?: string
  online: boolean
  connectedAt: number | null
  disconnectedAt?: number
  uptime?: number
  freeHeap?: number
  gattSlots: { total: number; available: number }
  deviceCount: number
}

function formatAge(lastSeen: number): string {
  const seconds = Math.round((Date.now() - lastSeen) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

function rssiColor(rssi: number): string {
  if (rssi >= -50) return 'success'
  if (rssi >= -70) return 'primary'
  if (rssi >= -85) return 'warning'
  return 'danger'
}

export default function BLEManager() {
  const [devices, setDevices] = useState<BLEDeviceInfo[]>([])
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([])
  const [gateways, setGateways] = useState<GatewayInfo[]>([])
  const [bleSettings, setBleSettings] = useState<BLESettings | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [advCount, setAdvCount] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const advCountRef = useRef(0)

  const fetchDevices = useCallback(async () => {
    try {
      const response = await fetch(`${BLE_API}/devices`, {
        credentials: 'include'
      })
      if (response.ok) {
        setDevices(await response.json())
      }
    } catch (_e) {
      // ignore — poll retries every 5s
    }
  }, [])

  const fetchConsumers = useCallback(async () => {
    try {
      const response = await fetch(`${BLE_API}/consumers`, {
        credentials: 'include'
      })
      if (response.ok) {
        setConsumers(await response.json())
      }
    } catch (_e) {
      // ignore
    }
  }, [])

  const fetchGateways = useCallback(async () => {
    try {
      const response = await fetch(`${GATEWAY_API}/gateways`, {
        credentials: 'include'
      })
      if (response.ok) {
        setGateways(await response.json())
      }
    } catch (_e) {
      // ignore
    }
  }, [])

  const fetchBleSettings = useCallback(async () => {
    try {
      const response = await fetch(`${BLE_API}/settings`, {
        credentials: 'include'
      })
      if (response.ok) {
        setBleSettings(await response.json())
      }
    } catch (_e) {
      // ignore
    }
  }, [])

  useEffect(() => {
    const poll = () => {
      fetchDevices()
      fetchConsumers()
      fetchGateways()
      fetchBleSettings()
    }
    const interval = setInterval(poll, 5000)
    poll()
    return () => clearInterval(interval)
  }, [fetchDevices, fetchConsumers, fetchGateways, fetchBleSettings])

  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${wsProto}://${window.location.host}${BLE_API}/advertisements`
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        if (!disposed) reconnectTimer = setTimeout(connect, 5000)
      }
      ws.onerror = () => ws?.close()
      ws.onmessage = () => {
        advCountRef.current += 1
      }
    }
    connect()

    const countInterval = setInterval(() => {
      setAdvCount(advCountRef.current)
    }, 1000)

    return () => {
      disposed = true
      clearInterval(countInterval)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  const hasGateways = gateways.length > 0
  const hasConsumers = consumers.length > 0
  const localManaged = bleSettings?.localBluetoothManaged ?? false
  const localBLESupported = bleSettings?.localBLESupported ?? true
  const activeAdapters = bleSettings?.activeAdapters ?? []
  const adapterErrors = bleSettings?.adapterErrors ?? {}

  return (
    <div className="animated fadeIn">
      {/* Status overview */}
      <Row className="mb-3">
        <Col sm="3">
          <Card className="text-center">
            <Card.Body className="py-3">
              <div className="h5 mb-0">
                {gateways.filter((g) => g.online).length}
              </div>
              <small className="text-body-secondary text-uppercase fw-bold">
                Gateways
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col sm="3">
          <Card className="text-center">
            <Card.Body className="py-3">
              <div className="h5 mb-0">{consumers.length}</div>
              <small className="text-body-secondary text-uppercase fw-bold">
                Consumers
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col sm="3">
          <Card className="text-center">
            <Card.Body className="py-3">
              <div className="h5 mb-0">{devices.length}</div>
              <small className="text-body-secondary text-uppercase fw-bold">
                Devices
              </small>
            </Card.Body>
          </Card>
        </Col>
        <Col sm="3">
          <Card className="text-center">
            <Card.Body className="py-3">
              <div className="h5 mb-0">
                <FontAwesomeIcon
                  icon={faCircle}
                  className={wsConnected ? 'text-success' : 'text-danger'}
                  style={{ fontSize: '0.6em', verticalAlign: 'middle' }}
                />{' '}
                {advCount}
              </div>
              <small className="text-body-secondary text-uppercase fw-bold">
                Advertisements
              </small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Gateways */}
      <Card className="mb-3">
        <Card.Header>
          <FontAwesomeIcon icon={faTowerBroadcast} />{' '}
          <strong>BLE Gateways</strong>
          {hasGateways && (
            <Badge bg="primary" className="ms-2">
              {gateways.filter((g) => g.online).length}/{gateways.length}
            </Badge>
          )}
        </Card.Header>
        <Card.Body>
          {!hasGateways ? (
            <p className="text-body-secondary mb-0">
              No gateways connected. Flash an ESP32 gateway with the BLE gateway
              firmware and power it on to get started.
            </p>
          ) : (
            <Table hover responsive striped size="sm">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>Firmware</th>
                  <th>Uptime</th>
                  <th>Free Heap</th>
                  <th>GATT</th>
                  <th>Devices</th>
                  <th>Connected</th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((gw) => (
                  <tr key={gw.gatewayId}>
                    <td>
                      <strong>{gw.gatewayId}</strong>
                    </td>
                    <td>
                      <code>{gw.ipAddress || '-'}</code>
                    </td>
                    <td>
                      <Badge bg={gw.online ? 'success' : 'danger'}>
                        {gw.online ? 'Online' : 'Offline'}
                      </Badge>
                    </td>
                    <td>{gw.firmware || '-'}</td>
                    <td>{gw.uptime ? formatDuration(gw.uptime) : '-'}</td>
                    <td>{gw.freeHeap ? formatBytes(gw.freeHeap) : '-'}</td>
                    <td>
                      {gw.gattSlots.total > 0
                        ? `${gw.gattSlots.total - gw.gattSlots.available}/${gw.gattSlots.total}`
                        : '-'}
                    </td>
                    <td>{gw.deviceCount}</td>
                    <td>
                      {gw.online
                        ? gw.connectedAt
                          ? formatDuration(
                              Math.round((Date.now() - gw.connectedAt) / 1000)
                            )
                          : '-'
                        : gw.disconnectedAt
                          ? formatAge(gw.disconnectedAt)
                          : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Local Adapters */}
      <Card className="mb-3">
        <Card.Header>
          <FontAwesomeIcon icon={faMicrochip} />{' '}
          <strong>Local Bluetooth Adapters</strong>
          {localManaged && activeAdapters.length > 0 && (
            <Badge bg="success" className="ms-2">
              {activeAdapters.length} active
            </Badge>
          )}
        </Card.Header>
        <Card.Body>
          {!localBLESupported ? (
            <p className="text-body-secondary mb-0">
              Local Bluetooth adapter management is only supported on Linux.
              ESP32 gateways work on all platforms.
            </p>
          ) : !localManaged ? (
            <p className="text-body-secondary mb-0">
              Local Bluetooth is disabled. Enable it in{' '}
              <strong>Server Settings → Bluetooth</strong>.
            </p>
          ) : activeAdapters.length === 0 &&
            Object.keys(adapterErrors).length === 0 ? (
            <p className="text-body-secondary mb-0">
              No local adapters running yet…
            </p>
          ) : (
            <Table hover responsive striped size="sm">
              <thead>
                <tr>
                  <th>Adapter</th>
                  <th>Status</th>
                  <th>GATT Slots</th>
                </tr>
              </thead>
              <tbody>
                {activeAdapters.map((providerId) => {
                  const adapterName = providerId.replace('_localBLE:', '')
                  return (
                    <tr key={providerId}>
                      <td>
                        <code>{adapterName}</code>
                      </td>
                      <td>
                        <Badge bg="success">Active</Badge>
                      </td>
                      <td>{bleSettings?.localMaxGATTSlots ?? '-'}</td>
                    </tr>
                  )
                })}
                {Object.entries(adapterErrors).map(([adapterName, error]) => (
                  <tr key={adapterName}>
                    <td>
                      <code>{adapterName}</code>
                    </td>
                    <td>
                      <Badge bg="secondary">Not available</Badge>{' '}
                      <small className="text-body-secondary">{error}</small>
                    </td>
                    <td>-</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Consumer Plugins */}
      <Card className="mb-3">
        <Card.Header>
          <FontAwesomeIcon icon={faPlug} /> <strong>Consumer Plugins</strong>
          {hasConsumers && (
            <Badge bg="primary" className="ms-2">
              {consumers.length}
            </Badge>
          )}
        </Card.Header>
        <Card.Body>
          {!hasConsumers ? (
            <p className="text-body-secondary mb-0">
              No consumer plugins registered. Install a BLE consumer plugin such
              as bt-sensors-plugin-sk.
            </p>
          ) : (
            <Table hover responsive striped size="sm">
              <thead>
                <tr>
                  <th>Plugin ID</th>
                  <th>Advertisements</th>
                  <th>GATT Claims</th>
                </tr>
              </thead>
              <tbody>
                {consumers.map((c) => (
                  <tr key={c.pluginId}>
                    <td>
                      <code>{c.pluginId}</code>
                    </td>
                    <td>
                      {c.advertisementSubscriber ? (
                        <Badge bg="success">Yes</Badge>
                      ) : (
                        <Badge bg="secondary">No</Badge>
                      )}
                    </td>
                    <td>
                      {c.gattClaims.length === 0
                        ? '-'
                        : c.gattClaims.map((mac) => (
                            <Badge
                              key={mac}
                              bg="warning"
                              text="dark"
                              className="me-1"
                            >
                              <FontAwesomeIcon icon={faLink} /> {mac}
                            </Badge>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Devices */}
      <Card>
        <Card.Header>
          <FontAwesomeIcon icon={faBluetooth} /> <strong>BLE Devices</strong>
          {devices.length > 0 && (
            <Badge bg="primary" className="ms-2">
              {devices.length}
            </Badge>
          )}
        </Card.Header>
        <Card.Body>
          {devices.length === 0 ? (
            <p className="text-body-secondary mb-0">
              {hasGateways
                ? 'No BLE devices detected yet. Waiting for advertisements...'
                : 'No BLE devices detected. Enable local Bluetooth in settings or connect a gateway to start scanning.'}
            </p>
          ) : (
            <Table hover responsive striped size="sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>MAC Address</th>
                  <th>RSSI</th>
                  <th>Last Seen</th>
                  <th>Connectable</th>
                  <th>Seen By</th>
                  <th>GATT</th>
                </tr>
              </thead>
              <tbody>
                {devices
                  .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))
                  .map((device) => (
                    <tr key={device.mac}>
                      <td>{device.name || <em>Unknown</em>}</td>
                      <td>
                        <code>{device.mac}</code>
                      </td>
                      <td>
                        <Badge bg={rssiColor(device.rssi)}>
                          {device.rssi} dBm
                        </Badge>
                      </td>
                      <td>{formatAge(device.lastSeen)}</td>
                      <td>
                        {device.connectable ? (
                          <Badge bg="info">Yes</Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {device.seenBy.map((s) => (
                          <Badge
                            key={s.providerId}
                            bg="secondary"
                            className="me-1"
                          >
                            {s.providerId} ({s.rssi})
                          </Badge>
                        ))}
                      </td>
                      <td>
                        {device.gattClaimedBy ? (
                          <Badge bg="warning" text="dark">
                            <FontAwesomeIcon icon={faLink} />{' '}
                            {device.gattClaimedBy}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
