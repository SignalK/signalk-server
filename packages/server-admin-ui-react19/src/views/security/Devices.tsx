import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import { useLoginStatus } from '../../store'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import EnableSecurity from './EnableSecurity'

type PermissionType = 'readonly' | 'readwrite' | 'admin'

interface Device {
  clientId: string
  description?: string
  permissions?: PermissionType
  requestedPermissions?: string
}

function convertPermissions(type: PermissionType | undefined): string {
  if (type === 'readonly') {
    return 'Read Only'
  } else if (type === 'readwrite') {
    return 'Read/Write'
  } else if (type === 'admin') {
    return 'Admin'
  }
  return ''
}

export default function Devices() {
  const loginStatus = useLoginStatus()
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const selectedDeviceRef = useRef<HTMLDivElement>(null)

  const loadDevices = useCallback(async (): Promise<Device[]> => {
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices`,
      {
        credentials: 'include'
      }
    )
    return response.json()
  }, [])

  const refreshDevices = useCallback(() => {
    loadDevices().then((data) => {
      setDevices(data)
    })
  }, [loadDevices])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      loadDevices().then((data) => {
        setDevices(data)
      })
    }
  }, [loginStatus.authenticationRequired, loadDevices])

  const handleDeviceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedDevice((prev) =>
      prev ? { ...prev, [event.target.name]: value } : null
    )
  }

  const handleApply = async (event: FormEvent) => {
    event.preventDefault()

    if (!selectedDevice) return

    const payload = {
      permissions: selectedDevice.permissions || 'readonly',
      description: selectedDevice.description
    }

    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices/${selectedDevice.clientId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
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
        headers: {
          'Content-Type': 'application/json'
        },
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
    setTimeout(() => {
      selectedDeviceRef.current?.scrollIntoView()
    }, 0)
  }

  const handleCancel = () => {
    setSelectedDevice(null)
  }

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {loginStatus.authenticationRequired && (
        <div>
          <Card>
            <Card.Header>
              <FontAwesomeIcon icon={faAlignJustify} /> Devices
            </Card.Header>
            <Card.Body>
              <Table hover responsive bordered striped size="sm">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Description</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {(devices || []).map((device) => {
                    return (
                      <tr
                        key={device.clientId}
                        onClick={() => deviceClicked(device)}
                      >
                        <td>{device.clientId}</td>
                        <td>{device.description}</td>
                        <td>{convertPermissions(device.permissions)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card.Body>
            <Card.Footer></Card.Footer>
          </Card>

          {selectedDevice && (
            <div ref={selectedDeviceRef}>
              <Card>
                <Card.Header>
                  <FontAwesomeIcon icon={faAlignJustify} /> Device
                </Card.Header>
                <Card.Body>
                  <Form.Group as={Row}>
                    <Col md="2">
                      <Form.Label>Client ID</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <span className="form-control-plaintext">
                        {selectedDevice.clientId}
                      </span>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
                    <Col md="2">
                      <Form.Label htmlFor="description">Description</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Form.Control
                        size={60}
                        style={{ width: 'auto' }}
                        type="text"
                        id="description"
                        name="description"
                        autoComplete="off"
                        onChange={handleDeviceChange}
                        value={selectedDevice.description || ''}
                      />
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
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
                      variant="danger"
                      className="ms-auto"
                      onClick={deleteDevice}
                    >
                      <FontAwesomeIcon icon={faBan} /> Delete
                    </Button>
                  </div>
                </Card.Footer>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
