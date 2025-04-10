import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
} from 'reactstrap'

import VesselConfiguration from './VesselConfiguration.js'
import LogFiles from './Logging.js'

function fetchSettings() {
  fetch(`${window.serverRoutesPrefix}/settings`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then((data) => {
      this.setState({ ...data, hasData: true })
    })
}

class ServerSettings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
    }
    this.fetchSettings = fetchSettings.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleCourseApiChange = this.handleCourseApiChange.bind(this)
    this.handleOptionChange = this.handleOptionChange.bind(this)
    this.handleInterfaceChange = this.handleInterfaceChange.bind(this)
    this.handleSaveSettings = this.handleSaveSettings.bind(this)
  }

  componentDidMount() {
    this.fetchSettings()
  }

  handleChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleCourseApiChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.courseApi[event.target.name] = value
    this.setState({ courseApi: this.state.courseApi })
  }

  handleOptionChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.options[event.target.name] = value
    this.setState({ options: this.state.options })
  }

  handleInterfaceChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.interfaces[event.target.name] = value
    this.setState({ interfaces: this.state.interfaces })
  }

  handleSaveSettings() {
    fetch(`${window.serverRoutesPrefix}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.state),
      credentials: 'include',
    })
      .then((response) => response.text())
      .then((response) => {
        alert(response)
      })
  }

  render() {
    const fieldColWidthMd = 10
    return (
      this.state.hasData && (
        <div className="animated fadeIn">
          <Card>
            <CardHeader>
              <i className="fa fa-align-justify" />
              <strong>Server Settings</strong>
            </CardHeader>
            <CardBody>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
              >
                {!this.state.runFromSystemd && (
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="port">HTTP Port</Label>
                    </Col>
                    <Col xs="12" md={fieldColWidthMd}>
                      <Input
                        size="5"
                        style={{ width: 'auto' }}
                        type="text"
                        name="port"
                        onChange={this.handleChange}
                        value={this.state.port}
                      />
                      <FormText color="muted">
                        Saving a new value here will not have effect if
                        overridden by environment variable PORT
                      </FormText>
                    </Col>
                  </FormGroup>
                )}
                {this.state.runFromSystemd && (
                  <FormGroup row>
                    <Col xs="12" md={fieldColWidthMd}>
                      <FormText>
                        The server was started by systemd, run
                        signalk-server-setup to change ports and ssl
                        configuration.
                      </FormText>
                    </Col>
                  </FormGroup>
                )}
                {this.state.options.ssl && !this.state.runFromSystemd && (
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="sslport">SSL Port</Label>
                    </Col>
                    <Col xs="12" md={fieldColWidthMd}>
                      <Input
                        size="5"
                        style={{ width: 'auto' }}
                        type="text"
                        name="sslport"
                        onChange={this.handleChange}
                        value={this.state.sslport}
                      />
                      <FormText color="muted">
                        Saving a new value here will not have effect if
                        overridden by environment variable SSLPORT
                      </FormText>
                    </Col>
                  </FormGroup>
                )}
                <FormGroup row>
                  <Col md="2">
                    <Label>Options</Label>
                  </Col>
                  <Col md={fieldColWidthMd}>
                    <FormGroup check>
                      {Object.keys(this.state.options).map((name) => {
                        return (
                          <div key={name}>
                            <Label
                              style={{ marginRight: '15px' }}
                              className="switch switch-text switch-primary"
                            >
                              <Input
                                type="checkbox"
                                id={name}
                                name={name}
                                className="switch-input"
                                onChange={this.handleOptionChange}
                                checked={this.state.options[name]}
                              />
                              <span
                                className="switch-label"
                                data-on="On"
                                data-off="Off"
                              />
                              <span className="switch-handle" />
                            </Label>
                            <span style={{ lineHeight: '23px' }}>{name}</span>
                          </div>
                        )
                      })}
                    </FormGroup>
                  </Col>
                </FormGroup>

                <FormGroup row>
                  <Col md="2">
                    <Label>Interfaces</Label>
                  </Col>
                  <Col md={fieldColWidthMd}>
                    <FormGroup check>
                      {Object.keys(SettableInterfaces).map((name) => {
                        return (
                          <div key={name}>
                            <Label
                              style={{ marginRight: '15px' }}
                              className="switch switch-text switch-primary"
                            >
                              <Input
                                type="checkbox"
                                id={name}
                                name={name}
                                className="switch-input"
                                onChange={this.handleInterfaceChange}
                                checked={this.state.interfaces[name]}
                              />
                              <span
                                className="switch-label"
                                data-on="On"
                                data-off="Off"
                              />
                              <span className="switch-handle" />
                            </Label>
                            <span style={{ lineHeight: '24px' }}>
                              {SettableInterfaces[name]}
                            </span>
                          </div>
                        )
                      })}
                    </FormGroup>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="pruneContextsMinutes">
                      Maximum age of inactive vessels&apos; data
                    </Label>
                  </Col>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Input
                      type="text"
                      name="pruneContextsMinutes"
                      onChange={this.handleChange}
                      value={this.state.pruneContextsMinutes}
                    />
                    <FormText color="muted">
                      Vessels that have not been updated after this many minutes
                      will be removed
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="loggingDirectory">
                      Data Logging Directory
                    </Label>
                  </Col>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Input
                      type="text"
                      name="loggingDirectory"
                      onChange={this.handleChange}
                      value={this.state.loggingDirectory}
                    />
                    <FormText color="muted">
                      Connections that have logging enabled create hourly log
                      files in Multiplexed format in this directory
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label>Keep only most recent data log files</Label>
                  </Col>
                  <Col>
                    <FormGroup check>
                      <Label className="switch switch-text switch-primary">
                        <Input
                          type="checkbox"
                          name="keepMostRecentLogsOnly"
                          id="keepMostRecentLogsOnly"
                          className="switch-input"
                          onChange={this.handleChange}
                          checked={this.state.keepMostRecentLogsOnly}
                        />
                        <span
                          className="switch-label"
                          data-on="On"
                          data-off="Off"
                        />
                        <span className="switch-handle" />
                      </Label>
                    </FormGroup>
                  </Col>
                  <Col>
                    <Input
                      type="text"
                      name="logCountToKeep"
                      onChange={this.handleChange}
                      value={this.state.logCountToKeep}
                    />
                    <FormText color="muted">
                      How many hourly files to keep
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label>
                      API Only Mode
                      <br />
                      <i>(Course API)</i>
                    </Label>
                  </Col>
                  <Col>
                    <FormGroup check>
                      <Label className="switch switch-text switch-primary">
                        <Input
                          type="checkbox"
                          name="apiOnly"
                          id="apiOnly"
                          className="switch-input"
                          onChange={this.handleCourseApiChange}
                          checked={this.state.courseApi.apiOnly}
                        />
                        <span
                          className="switch-label"
                          data-on="On"
                          data-off="Off"
                        />
                        <span className="switch-handle" />
                      </Label>
                      <FormText color="muted">
                        Accept course operations only via HTTP requests.
                        Destination data from NMEA sources is not used.
                      </FormText>
                    </FormGroup>
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Button
                size="sm"
                color="primary"
                onClick={this.handleSaveSettings}
              >
                <i className="fa fa-dot-circle-o" /> Save
              </Button>{' '}
              <Badge color="danger" className="float-right">
                Restart Required
              </Badge>
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

const SettableInterfaces = {
  applicationData: 'Application Data Storage',
  logfiles: 'Data log files access',
  'nmea-tcp': 'NMEA 0183 over TCP (10110)',
  tcp: 'Signal K over TCP (8375)',
}

const ReduxedSettings = connect()(ServerSettings)

class Settings extends Component {
  render() {
    return (
      <div>
        <VesselConfiguration />
        <ReduxedSettings />
        <LogFiles />
      </div>
    )
  }
}

export default Settings
