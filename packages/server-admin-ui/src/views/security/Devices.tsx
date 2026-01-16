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
  Table,
  Row
} from 'reactstrap'
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

  const fetchSecurityDevices = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/security/devices`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        setDevices(data)
      })
  }, [])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
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

  const handleApply = (event: FormEvent) => {
    event.preventDefault()

    if (!selectedDevice) return

    const payload = {
      permissions: selectedDevice.permissions || 'readonly',
      description: selectedDevice.description
    }

    fetch(
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
      .then((response) => response.text())
      .then((response) => {
        setSelectedDevice(null)
        alert(response)
        fetchSecurityDevices()
      })
  }

  const deleteDevice = () => {
    if (!selectedDevice) return

    fetch(
      `${window.serverRoutesPrefix}/security/devices/${selectedDevice.clientId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
      .then((response) => response.text())
      .then((response) => {
        setSelectedDevice(null)
        alert(response)
        fetchSecurityDevices()
      })
  }

  const deviceClicked = (device: Device) => {
    setSelectedDevice(JSON.parse(JSON.stringify(device)))
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
              <i className="fa fa-align-justify" />
              Devices
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
                  <i className="fa fa-align-justify" />
                  Device
                </CardHeader>
                <CardBody>
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="clientId">Client ID</Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Label>{selectedDevice.clientId}</Label>
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
                        name="description"
                        onChange={handleDeviceChange}
                        value={selectedDevice.description || ''}
                      />
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="select">Permissions</Label>
                    </Col>
                    <Col xs="12" md="2">
                      {!selectedDevice.requestedPermissions && (
                        <Input
                          type="select"
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
                        <Label>
                          {convertPermissions(selectedDevice.permissions)}
                        </Label>
                      )}
                    </Col>
                  </FormGroup>
                </CardBody>
                <CardFooter>
                  <Row>
                    <Col xs="4" md="1">
                      <Button size="sm" color="primary" onClick={handleApply}>
                        <i className="fa fa-dot-circle-o" /> Apply
                      </Button>
                    </Col>
                    <Col xs="4" md="1">
                      <Button
                        size="sm"
                        color="secondary"
                        onClick={handleCancel}
                      >
                        <i className="fa fa-ban" /> Cancel
                      </Button>
                    </Col>
                    <Col xs="4" md="10" className="text-end">
                      <Button size="sm" color="danger" onClick={deleteDevice}>
                        <i className="fa fa-ban" /> Delete
                      </Button>
                    </Col>
                  </Row>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
