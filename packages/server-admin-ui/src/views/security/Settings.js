import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  InputGroup,
  InputGroupAddon,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Table,
  Row,
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
        {this.state.hasData && this.props.loginStatus.authenticationRequired && (
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
                    <Col xs="0" md="2">
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
                    <Col md="2">
                      <Label htmlFor="text-input">Login Session Timeout</Label>
                    </Col>
                    <Col xs="12" md="9">
                      <Input
                        type="text"
                        name="expiration"
                        onChange={this.handleChange}
                        value={this.state.expiration}
                      />
                      <FormText color="muted">
                        Exmaples: 60s, 1m, 1h, 1d
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
