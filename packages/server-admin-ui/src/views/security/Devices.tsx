import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import { useAppSelector } from '../../store'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Col,
  Label,
  FormGroup,
  Table
} from 'reactstrap'
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
  const loginStatus = useAppSelector((state) => state.loginStatus)
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const selectedDeviceRef = useRef<HTMLDivElement>(null)

  const fetchSecurityDevices = useCallback(async () => {
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/devices`,
      {
        credentials: 'include'
      }
    )
    const data = await response.json()
    setDevices(data)
  }, [])

  // Fetch devices when authentication requirements change - standard data fetching pattern.
  // See: https://react.dev/reference/react/useEffect#fetching-data-with-effects
  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
      fetchSecurityDevices()
    }
  }, [loginStatus.authenticationRequired, fetchSecurityDevices])

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
    fetchSecurityDevices()
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
    fetchSecurityDevices()
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
            <CardHeader>
              <FontAwesomeIcon icon={faAlignJustify} /> Devices
            </CardHeader>
            <CardBody>
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
            </CardBody>
            <CardFooter></CardFooter>
          </Card>

          {selectedDevice && (
            <div ref={selectedDeviceRef}>
              <Card>
                <CardHeader>
                  <FontAwesomeIcon icon={faAlignJustify} /> Device
                </CardHeader>
                <CardBody>
                  <FormGroup row>
                    <Col md="2">
                      <Label>Client ID</Label>
                    </Col>
                    <Col xs="12" md="9">
                      <span className="form-control-plaintext">
                        {selectedDevice.clientId}
                      </span>
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="description">Description</Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Input
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
                  </FormGroup>
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="permissions">Permissions</Label>
                    </Col>
                    <Col xs="12" md="2">
                      {!selectedDevice.requestedPermissions && (
                        <Input
                          type="select"
                          id="permissions"
                          name="permissions"
                          value={selectedDevice.permissions || 'readonly'}
                          onChange={handleDeviceChange}
                        >
                          <option value="readonly">Read Only</option>
                          <option value="readwrite">Read/Write</option>
                          <option value="admin">Admin</option>
                        </Input>
                      )}
                      {selectedDevice.requestedPermissions && (
                        <span className="form-control-plaintext">
                          {convertPermissions(selectedDevice.permissions)}
                        </span>
                      )}
                    </Col>
                  </FormGroup>
                </CardBody>
                <CardFooter>
                  <div className="d-flex flex-wrap gap-2">
                    <Button size="sm" color="primary" onClick={handleApply}>
                      <FontAwesomeIcon icon={faFloppyDisk} /> Apply
                    </Button>
                    <Button size="sm" color="secondary" onClick={handleCancel}>
                      <FontAwesomeIcon icon={faBan} /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      color="danger"
                      className="ms-auto"
                      onClick={deleteDevice}
                    >
                      <FontAwesomeIcon icon={faBan} /> Delete
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
