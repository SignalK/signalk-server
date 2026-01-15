import React, { Component } from 'react'
import { connect } from 'react-redux'
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

export function fetchSecurityDevices() {
  fetch(`${window.serverRoutesPrefix}/security/devices`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((data) => {
      this.setState({ devices: data })
    })
}

class Devices extends Component {
  constructor(props) {
    super(props)
    this.state = {
      devices: []
    }
    this.selectedDeviceRef = React.createRef()

    this.fetchSecurityDevices = fetchSecurityDevices.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleApply = this.handleApply.bind(this)
    this.handleDeviceChange = this.handleDeviceChange.bind(this)
    this.deleteDevice = this.deleteDevice.bind(this)
  }

  componentDidMount() {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchSecurityDevices()
    }
  }

  handleDeviceChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.selectedDevice[event.target.name] = value
    this.setState({
      selectedDevice: this.state.selectedDevice
    })
  }

  handleApply(event) {
    event.preventDefault()

    var payload = {
      permissions: this.state.selectedDevice.permissions || 'readonly',
      description: this.state.selectedDevice.description
    }

    fetch(
      `${window.serverRoutesPrefix}/security/devices/${this.state.selectedDevice.clientId}`,
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
        this.setState({
          selectedDevice: null,
          selectedIndex: -1
        })
        alert(response)
        this.fetchSecurityDevices()
      })
  }

  deleteDevice() {
    fetch(
      `${window.serverRoutesPrefix}/security/devices/${this.state.selectedDevice.clientId}`,
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
        this.setState({
          selectedDevice: null,
          selectedIndex: -1
        })
        alert(response)
        this.fetchSecurityDevices()
      })
  }

  deviceClicked(device, index) {
    this.setState(
      {
        selectedDevice: JSON.parse(JSON.stringify(device)),
        selectedIndex: index
      },
      () => {
        this.selectedDeviceRef.current?.scrollIntoView()
      }
    )
  }

  handleCancel() {
    this.setState({ selectedDevice: null })
  }
  render() {
    return (
      <div className="animated fadeIn">
        {this.props.loginStatus.authenticationRequired === false && (
          <EnableSecurity />
        )}
        {this.props.loginStatus.authenticationRequired && (
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
                    {(this.state.devices || []).map((device, index) => {
                      return (
                        <tr
                          key={device.clientId}
                          onClick={this.deviceClicked.bind(this, device, index)}
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

            {this.state.selectedDevice && (
              <div ref={this.selectedDeviceRef}>
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
                        <Label>{this.state.selectedDevice.clientId}</Label>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="2">
                        <Label htmlFor="description">Description</Label>
                      </Col>
                      <Col xs="12" md="9">
                        <Input
                          size="60"
                          style={{ width: 'auto' }}
                          type="text"
                          name="description"
                          onChange={this.handleDeviceChange}
                          value={this.state.selectedDevice.description}
                        />
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="2">
                        <Label htmlFor="select">Permissions</Label>
                      </Col>
                      <Col xs="12" md="2">
                        {!this.state.selectedDevice.requestedPermissions && (
                          <Input
                            type="select"
                            name="permissions"
                            value={this.state.selectedDevice.permissions}
                            onChange={this.handleDeviceChange}
                          >
                            <option value="readonly">Read Only</option>
                            <option value="readwrite">Read/Write</option>
                            <option value="admin">Admin</option>
                          </Input>
                        )}
                        {this.state.selectedDevice.requestedPermissions && (
                          <Label>
                            {convertPermissions(
                              this.state.selectedDevice.permissions
                            )}
                          </Label>
                        )}
                      </Col>
                    </FormGroup>
                  </CardBody>
                  <CardFooter>
                    <Row>
                      <Col xs="4" md="1">
                        <Button
                          size="sm"
                          color="primary"
                          onClick={this.handleApply}
                        >
                          <i className="fa fa-dot-circle-o" /> Apply
                        </Button>
                      </Col>
                      <Col xs="4" md="1">
                        <Button
                          size="sm"
                          color="secondary"
                          onClick={this.handleCancel}
                        >
                          <i className="fa fa-ban" /> Cancel
                        </Button>
                      </Col>
                      <Col xs="4" md="10" className="text-end">
                        <Button
                          size="sm"
                          color="danger"
                          onClick={this.deleteDevice}
                        >
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
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(Devices)

function convertPermissions(type) {
  if (type === 'readonly') {
    return 'Read Only'
  } else if (type === 'readwrite') {
    return 'Read/Write'
  } else if (type === 'admin') {
    return 'Admin'
  }
}
