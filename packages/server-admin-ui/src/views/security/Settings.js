import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
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
import EnableSecurity from './EnableSecurity'

export function fetchSecurityConfig() {
  fetch(`${window.serverRoutesPrefix}/security/config`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then((data) => {
      this.setState({ ...data, hasData: true })
    })
}

const adminUIOrigin = `${window.location.protocol}//${window.location.host}`

class Settings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
    }

    this.handleChange = this.handleChange.bind(this)
    this.handleSaveConfig = this.handleSaveConfig.bind(this)
    this.fetchSecurityConfig = fetchSecurityConfig.bind(this)
  }

  componentDidMount() {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchSecurityConfig()
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.loginStatus.authenticationRequired !=
      prevProps.loginStatus.authenticationRequired
    ) {
      this.fetchSecurityConfig()
    }
  }

  handleChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleSaveConfig() {
    var payload = {
      allow_readonly: this.state.allow_readonly,
      expiration: this.state.expiration,
      allowNewUserRegistration: this.state.allowNewUserRegistration,
      allowDeviceAccessRequests: this.state.allowDeviceAccessRequests,
      allowedCorsOrigins: this.state.allowedCorsOrigins,
      adminUIOrigin,
    }
    fetch(`${window.serverRoutesPrefix}/security/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    })
      .then((response) => response.text())
      .then((response) => {
        this.fetchSecurityConfig()
        alert(response)
      })
  }

  render() {
    return (
      <div className="animated fadeIn">
        {this.props.loginStatus.authenticationRequired === false && (
          <EnableSecurity />
        )}
        {this.state.hasData &&
          this.props.loginStatus.authenticationRequired && (
            <div>
              <Card>
                <CardHeader>
                  <i className="fa fa-align-justify" />
                  Settings
                </CardHeader>
                <CardBody>
                  <Form
                    action=""
                    method="post"
                    encType="multipart/form-data"
                    className="form-horizontal"
                  >
                    <FormGroup row>
                      <Col xs="0" md="3">
                        <Label>Allow Readonly Access</Label>
                      </Col>
                      <Col md="9">
                        <FormGroup check>
                          <div>
                            <Label className="switch switch-text switch-primary">
                              <Input
                                type="checkbox"
                                name="allow_readonly"
                                className="switch-input"
                                onChange={this.handleChange}
                                checked={this.state.allow_readonly}
                              />
                              <span
                                className="switch-label"
                                data-on="Yes"
                                data-off="No"
                              />
                              <span className="switch-handle" />
                            </Label>
                          </div>
                        </FormGroup>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col xs="0" md="3">
                        <Label>Allow New User Registration</Label>
                      </Col>
                      <Col md="9">
                        <FormGroup check>
                          <div>
                            <Label className="switch switch-text switch-primary">
                              <Input
                                type="checkbox"
                                name="allowNewUserRegistration"
                                className="switch-input"
                                onChange={this.handleChange}
                                checked={this.state.allowNewUserRegistration}
                              />
                              <span
                                className="switch-label"
                                data-on="Yes"
                                data-off="No"
                              ></span>
                              <span className="switch-handle"></span>
                            </Label>
                          </div>
                        </FormGroup>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col xs="0" md="3">
                        <Label>Allow New Device Registration</Label>
                      </Col>
                      <Col md="9">
                        <FormGroup check>
                          <div>
                            <Label className="switch switch-text switch-primary">
                              <Input
                                type="checkbox"
                                name="allowDeviceAccessRequests"
                                className="switch-input"
                                onChange={this.handleChange}
                                checked={this.state.allowDeviceAccessRequests}
                              />
                              <span
                                className="switch-label"
                                data-on="Yes"
                                data-off="No"
                              ></span>
                              <span className="switch-handle"></span>
                            </Label>
                          </div>
                        </FormGroup>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="3">
                        <Label htmlFor="text-input">Remember Me timeout</Label>
                      </Col>
                      <Col xs="12" md="3">
                        <Input
                          type="text"
                          name="expiration"
                          onChange={this.handleChange}
                          value={this.state.expiration}
                        />
                        <FormText color="muted">
                          Examples: 60s, 1m, 1h, 1d
                        </FormText>
                      </Col>
                      <Col md="6">
                        <FormText color="muted">
                          How long server keeps you logged when Remember Me is
                          checked in login.
                        </FormText>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="12">
                        <Label>
                          Simple CORS requests are allowed from all hosts by
                          default. You can restrict CORS requests to named hosts
                          by configuring allowed CORS origins below. The host
                          where this page is loaded from is automatically
                          included in the allowed CORS origins so that the Admin
                          UI continues to work.
                        </Label>
                      </Col>
                    </FormGroup>{' '}
                    <FormGroup row>
                      <Col md="3">
                        <Label htmlFor="text-input">Allowed CORS origins</Label>
                      </Col>
                      <Col xs="12" md="9">
                        <Input
                          type="text"
                          name="allowedCorsOrigins"
                          onChange={this.handleChange}
                          value={this.state.allowedCorsOrigins}
                        />
                        <FormText color="muted">
                          Use comma delimited list, example:
                          http://host1.name.com:3000,http://host2.name.com:3000
                        </FormText>
                      </Col>
                    </FormGroup>
                  </Form>
                </CardBody>
                <CardFooter>
                  <Button
                    size="sm"
                    color="primary"
                    onClick={this.handleSaveConfig}
                  >
                    <i className="fa fa-dot-circle-o" /> Save
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}
      </div>
    )
  }
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(Settings)
