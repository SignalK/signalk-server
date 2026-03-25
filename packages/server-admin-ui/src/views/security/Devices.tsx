import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import { useLoginStatus } from '../../store'
import { useServerEvent } from '../../hooks/useWebSocket'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import EnableSecurity from './EnableSecurity'

type PermissionType = 'readonly' | 'readwrite' | 'admin'

interface DeviceDashboard {
  mode: 'redirect' | 'metadata'
  url?: string
  metadata?: Record<string, unknown>
}

interface Device {
  clientId: string
  description?: string
  displayName?: string
  permissions?: PermissionType
  requestedPermissions?: string
  tokenExpiry?: number
  createdAt?: string
  registrationInfo?: {
    sourceIp?: string
    deviceId?: string
    firmwareVersion?: string
    userAgent?: string
  }
  dashboard?: DeviceDashboard
  isConnected?: boolean
  lastSeen?: string
  lastIp?: string
  pluginData?: Record<string, Record<string, unknown>>
}

interface NewDeviceForm {
  displayName: string
  permissions: PermissionType
  dashboardUrl: string
}

function convertPermissions(type: PermissionType | undefined): string {
  if (type === 'readonly') return 'Read Only'
  if (type === 'readwrite') return 'Read/Write'
  if (type === 'admin') return 'Admin'
  return ''
}

function isExpired(device: Device): boolean {
  return !!device.tokenExpiry && device.tokenExpiry * 1000 < Date.now()
}

function formatExpiry(device: Device): string {
  if (!device.tokenExpiry) return 'NEVER'
  const expiryMs = device.tokenExpiry * 1000
  const nowMs = Date.now()
  if (expiryMs < nowMs) return 'Expired'
  const diffMs = expiryMs - nowMs
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h remaining`
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

function formatLastSeen(lastSeen?: string): string {
  if (!lastSeen) return ''
  const diff = Date.now() - new Date(lastSeen).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function getDeviceName(device: Device): string {
  return device.displayName || device.description || device.clientId
}

function getDeviceCategory(device: Device): 'display' | 'sensor' | 'server' {
  if (device.description?.toLowerCase().includes('server')) return 'server'
  if (device.dashboard) return 'display'
  return 'sensor'
}

function ConnectionDot({ connected }: { connected?: boolean }) {
  return (
    <FontAwesomeIcon
      icon={faCircle}
      style={{
        color: connected ? '#28a745' : '#999',
        fontSize: '0.6em',
        marginRight: '0.5em'
      }}
    />
  )
}

function DeviceTable({
  devices,
  onDeviceClick
}: {
  devices: Device[]
  onDeviceClick: (device: Device) => void
}) {
  if (devices.length === 0) return null
  return (
    <Table hover responsive bordered striped size="sm">
      <thead>
        <tr>
          <th style={{ width: '2em' }}></th>
          <th>Name</th>
          <th>Permissions</th>
          <th>Last Seen</th>
          <th>IP</th>
          <th>Token Expiry</th>
        </tr>
      </thead>
      <tbody>
        {devices.map((device) => (
          <tr
            key={device.clientId}
            onClick={() => onDeviceClick(device)}
            style={{ cursor: 'pointer' }}
          >
            <td style={{ textAlign: 'center' }}>
              <ConnectionDot connected={device.isConnected} />
            </td>
            <td>{getDeviceName(device)}</td>
            <td>{convertPermissions(device.permissions)}</td>
            <td>
              {device.isConnected ? (
                <Badge bg="success">Online</Badge>
              ) : (
                formatLastSeen(device.lastSeen)
              )}
            </td>
            <td>
              <small>{device.lastIp || ''}</small>
            </td>
            <td>
              {isExpired(device) ? (
                <Badge bg="danger">Expired</Badge>
              ) : (
                formatExpiry(device)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

export default function Devices() {
  const loginStatus = useLoginStatus()
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDevice, setNewDevice] = useState<NewDeviceForm>({
    displayName: '',
    permissions: 'readonly',
    dashboardUrl: ''
  })
  const [createdToken, setCreatedToken] = useState<{
    clientId: string
    token: string
  } | null>(null)
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const selectedDeviceRef = useRef<HTMLDivElement>(null)

  const loadDevices = useCallback(async (): Promise<Device[]> => {
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices`,
      { credentials: 'include' }
    )
    return response.json()
  }, [])

  const refreshDevices = useCallback(() => {
    loadDevices().then(setDevices)
  }, [loadDevices])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      loadDevices().then(setDevices)
    }
  }, [loginStatus.authenticationRequired, loadDevices])

  useServerEvent('DEVICE_STATUS_CHANGE', refreshDevices)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDeviceChange = (event: any) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedDevice((prev) =>
      prev ? { ...prev, [event.target.name]: value } : null
    )
  }

  const handleDashboardUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedDevice((prev) => {
      if (!prev) return null
      const url = event.target.value
      if (!url) {
        const { dashboard: _, ...rest } = prev
        return rest as Device
      }
      return {
        ...prev,
        dashboard: { mode: 'redirect' as const, url }
      }
    })
  }

  const handleApply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedDevice) return

    const payload: Record<string, unknown> = {
      permissions: selectedDevice.permissions || 'readonly',
      description: selectedDevice.description,
      displayName: selectedDevice.displayName
    }
    if (selectedDevice.dashboard) {
      payload.dashboard = selectedDevice.dashboard
    }

    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices/${selectedDevice.clientId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      }
    )
    const text = await response.text()
    setSelectedDevice(null)
    alert(text)
    refreshDevices()
  }

  const deleteDevice = async () => {
    if (!selectedDevice) return
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices/${selectedDevice.clientId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      }
    )
    const text = await response.text()
    setSelectedDevice(null)
    alert(text)
    refreshDevices()
  }

  const deviceClicked = (device: Device) => {
    setSelectedDevice(structuredClone(device))
    setDeviceToken(null)
    setTimeout(() => {
      selectedDeviceRef.current?.scrollIntoView()
    }, 0)
  }

  const handleCancel = () => {
    setSelectedDevice(null)
    setDeviceToken(null)
  }

  const handleShowToken = async () => {
    if (!selectedDevice) return
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices/${selectedDevice.clientId}/token`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    if (response.ok) {
      const result = await response.json()
      setDeviceToken(result.token)
    } else {
      alert('Failed to retrieve token')
    }
  }

  const handleCreateDevice = async () => {
    const payload: Record<string, unknown> = {
      displayName: newDevice.displayName,
      permissions: newDevice.permissions
    }
    if (newDevice.dashboardUrl) {
      payload.dashboard = { mode: 'redirect', url: newDevice.dashboardUrl }
    }
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      }
    )
    if (response.ok) {
      const result = await response.json()
      setCreatedToken(result)
      setShowAddModal(false)
      setNewDevice({
        displayName: '',
        permissions: 'readonly',
        dashboardUrl: ''
      })
      refreshDevices()
    } else {
      const text = await response.text()
      alert('Failed to create device: ' + text)
    }
  }

  const getTokenUrl = (token: string) => {
    return `${window.location.origin}/?token=${token}`
  }

  const displays = devices.filter((d) => getDeviceCategory(d) === 'display')
  const sensors = devices.filter((d) => getDeviceCategory(d) === 'sensor')
  const servers = devices.filter((d) => getDeviceCategory(d) === 'server')

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {loginStatus.authenticationRequired && (
        <div>
          {/* Created Token Result */}
          {createdToken && (
            <Card className="mb-3 border-success">
              <Card.Header className="bg-success text-white">
                Device Created
              </Card.Header>
              <Card.Body>
                <p>
                  <strong>Client ID:</strong> {createdToken.clientId}
                </p>
                <Form.Group as={Row} className="mb-2">
                  <Col md="2">
                    <Form.Label>Token URL</Form.Label>
                  </Col>
                  <Col xs="12" md="10">
                    <Form.Control
                      type="text"
                      readOnly
                      value={getTokenUrl(createdToken.token)}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </Col>
                </Form.Group>
                <p className="text-muted small mb-0">
                  Copy this URL and use it to access the server from the device.
                  This token will not be shown again.
                </p>
              </Card.Body>
              <Card.Footer>
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(getTokenUrl(createdToken.token))
                      .catch(() => alert('Failed to copy to clipboard'))
                  }}
                >
                  Copy URL
                </Button>{' '}
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => setCreatedToken(null)}
                >
                  Dismiss
                </Button>
              </Card.Footer>
            </Card>
          )}

          {/* Displays & Apps */}
          <Card className="mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>
                <FontAwesomeIcon icon={faAlignJustify} /> Displays & Apps
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setShowAddModal(true)}
              >
                <FontAwesomeIcon icon={faPlus} /> Add Device
              </Button>
            </Card.Header>
            <Card.Body>
              {displays.length === 0 ? (
                <p className="text-muted mb-0">
                  No display devices. Click "Add Device" to create one.
                </p>
              ) : (
                <DeviceTable devices={displays} onDeviceClick={deviceClicked} />
              )}
            </Card.Body>
          </Card>

          {/* Sensors & Bridges */}
          {sensors.length > 0 && (
            <Card className="mb-3">
              <Card.Header>
                <FontAwesomeIcon icon={faAlignJustify} /> Sensors & Bridges
              </Card.Header>
              <Card.Body>
                <DeviceTable devices={sensors} onDeviceClick={deviceClicked} />
              </Card.Body>
            </Card>
          )}

          {/* Remote Servers */}
          {servers.length > 0 && (
            <Card className="mb-3">
              <Card.Header>
                <FontAwesomeIcon icon={faAlignJustify} /> Remote Servers
              </Card.Header>
              <Card.Body>
                <DeviceTable devices={servers} onDeviceClick={deviceClicked} />
              </Card.Body>
            </Card>
          )}

          {/* Device Detail Panel */}
          {selectedDevice && (
            <div ref={selectedDeviceRef}>
              <Card>
                <Card.Header>
                  <FontAwesomeIcon icon={faAlignJustify} />{' '}
                  {getDeviceName(selectedDevice)}
                </Card.Header>
                <Card.Body>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label>Client ID</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <span className="form-control-plaintext">
                        <code>{selectedDevice.clientId}</code>
                      </span>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label htmlFor="displayName">
                        Display Name
                      </Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Form.Control
                        type="text"
                        id="displayName"
                        name="displayName"
                        autoComplete="off"
                        style={{ width: 'auto' }}
                        onChange={handleDeviceChange}
                        value={selectedDevice.displayName || ''}
                      />
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label htmlFor="description">Description</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Form.Control
                        type="text"
                        id="description"
                        name="description"
                        autoComplete="off"
                        style={{ width: 'auto' }}
                        onChange={handleDeviceChange}
                        value={selectedDevice.description || ''}
                      />
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label htmlFor="permissions">Permissions</Form.Label>
                    </Col>
                    <Col xs="12" md="2">
                      {!selectedDevice.requestedPermissions && (
                        <Form.Select
                          id="permissions"
                          name="permissions"
                          value={selectedDevice.permissions || 'readonly'}
                          onChange={handleDeviceChange}
                        >
                          <option value="readonly">Read Only</option>
                          <option value="readwrite">Read/Write</option>
                          <option value="admin">Admin</option>
                        </Form.Select>
                      )}
                      {selectedDevice.requestedPermissions && (
                        <span className="form-control-plaintext">
                          {convertPermissions(selectedDevice.permissions)}
                        </span>
                      )}
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label htmlFor="dashboardUrl">
                        Dashboard URL
                      </Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Form.Control
                        type="text"
                        id="dashboardUrl"
                        name="dashboardUrl"
                        autoComplete="off"
                        style={{ width: 'auto' }}
                        placeholder="e.g. /@signalk/freeboard-sk/"
                        onChange={handleDashboardUrlChange}
                        value={selectedDevice.dashboard?.url || ''}
                      />
                      <Form.Text className="text-muted">
                        Optional. Assign a webapp for this device to display.
                      </Form.Text>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label>Token Expiry</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <span className="form-control-plaintext">
                        {isExpired(selectedDevice) ? (
                          <Badge bg="danger">Expired</Badge>
                        ) : (
                          formatExpiry(selectedDevice)
                        )}
                      </span>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} className="mb-2">
                    <Col md="2">
                      <Form.Label>Status</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <span className="form-control-plaintext">
                        <ConnectionDot connected={selectedDevice.isConnected} />
                        {selectedDevice.isConnected ? 'Online' : 'Offline'}
                        {selectedDevice.lastIp && (
                          <small className="ms-2 text-muted">
                            ({selectedDevice.lastIp})
                          </small>
                        )}
                        {selectedDevice.lastSeen && (
                          <small className="ms-2 text-muted">
                            Last seen: {formatLastSeen(selectedDevice.lastSeen)}
                          </small>
                        )}
                      </span>
                    </Col>
                  </Form.Group>
                  {selectedDevice.createdAt && (
                    <Form.Group as={Row} className="mb-2">
                      <Col md="2">
                        <Form.Label>Created</Form.Label>
                      </Col>
                      <Col xs="12" md="9">
                        <span className="form-control-plaintext">
                          {new Date(selectedDevice.createdAt).toLocaleString()}
                        </span>
                      </Col>
                    </Form.Group>
                  )}
                  {selectedDevice.registrationInfo && (
                    <Form.Group as={Row} className="mb-2">
                      <Col md="2">
                        <Form.Label>Registration</Form.Label>
                      </Col>
                      <Col xs="12" md="9">
                        <span className="form-control-plaintext">
                          <small className="text-muted">
                            {selectedDevice.registrationInfo.sourceIp &&
                              `IP: ${selectedDevice.registrationInfo.sourceIp}`}
                            {selectedDevice.registrationInfo.firmwareVersion &&
                              ` | FW: ${selectedDevice.registrationInfo.firmwareVersion}`}
                          </small>
                        </span>
                      </Col>
                    </Form.Group>
                  )}
                </Card.Body>
                <Card.Footer>
                  <div className="d-flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={handleApply}>
                      <FontAwesomeIcon icon={faFloppyDisk} /> Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCancel}
                    >
                      <FontAwesomeIcon icon={faBan} /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-info"
                      onClick={handleShowToken}
                    >
                      Show Token URL
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="ms-auto"
                      onClick={deleteDevice}
                    >
                      <FontAwesomeIcon icon={faBan} /> Delete
                    </Button>
                  </div>
                  {deviceToken && (
                    <div className="mt-2">
                      <Form.Control
                        type="text"
                        readOnly
                        value={getTokenUrl(deviceToken)}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <div className="mt-1">
                        <Button
                          size="sm"
                          variant="outline-success"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(getTokenUrl(deviceToken))
                              .catch(() => alert('Failed to copy to clipboard'))
                          }}
                        >
                          Copy URL
                        </Button>
                      </div>
                    </div>
                  )}
                </Card.Footer>
              </Card>
            </div>
          )}

          {/* Add Device Modal */}
          <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>Add Device</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Device Name</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g. iPad Helm, SenseESP Engine"
                  value={newDevice.displayName}
                  onChange={(e) =>
                    setNewDevice((prev) => ({
                      ...prev,
                      displayName: e.target.value
                    }))
                  }
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Permissions</Form.Label>
                <Form.Select
                  value={newDevice.permissions}
                  onChange={(e) =>
                    setNewDevice((prev) => ({
                      ...prev,
                      permissions: e.target.value as PermissionType
                    }))
                  }
                >
                  <option value="readonly">Read Only</option>
                  <option value="readwrite">Read/Write</option>
                  <option value="admin">Admin</option>
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Dashboard URL (optional)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g. /@signalk/freeboard-sk/"
                  value={newDevice.dashboardUrl}
                  onChange={(e) =>
                    setNewDevice((prev) => ({
                      ...prev,
                      dashboardUrl: e.target.value
                    }))
                  }
                />
                <Form.Text className="text-muted">
                  If set, the device will be categorized as a Display.
                </Form.Text>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateDevice}
                disabled={!newDevice.displayName.trim()}
              >
                Create Device
              </Button>
            </Modal.Footer>
          </Modal>
        </div>
      )}
    </div>
  )
}
