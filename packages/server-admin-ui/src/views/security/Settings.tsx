import { useState, useEffect, useCallback, ChangeEvent } from 'react'
import { useAppSelector } from '../../store'
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
  FormText
} from 'reactstrap'
import EnableSecurity from './EnableSecurity'
import OIDCSettings from './OIDCSettings'

const adminUIOrigin = `${window.location.protocol}//${window.location.host}`

interface SecurityConfig {
  hasData: boolean
  allow_readonly: boolean
  expiration: string
  allowNewUserRegistration: boolean
  allowDeviceAccessRequests: boolean
  allowedCorsOrigins: string
}

export default function Settings() {
  const loginStatus = useAppSelector((state) => state.loginStatus)
  const [config, setConfig] = useState<SecurityConfig>({
    hasData: false,
    allow_readonly: false,
    expiration: '',
    allowNewUserRegistration: false,
    allowDeviceAccessRequests: false,
    allowedCorsOrigins: ''
  })

  const fetchSecurityConfig = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/security/config`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        setConfig({ ...data, hasData: true })
      })
  }, [])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      fetchSecurityConfig()
    }
  }, [loginStatus.authenticationRequired, fetchSecurityConfig])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setConfig((prev) => ({ ...prev, [event.target.name]: value }))
  }

  const handleSaveConfig = () => {
    const payload = {
      allow_readonly: config.allow_readonly,
      expiration: config.expiration,
      allowNewUserRegistration: config.allowNewUserRegistration,
      allowDeviceAccessRequests: config.allowDeviceAccessRequests,
      allowedCorsOrigins: config.allowedCorsOrigins,
      adminUIOrigin
    }
    fetch(`${window.serverRoutesPrefix}/security/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    })
      .then((response) => response.text())
      .then((response) => {
        fetchSecurityConfig()
        alert(response)
      })
  }

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {config.hasData && loginStatus.authenticationRequired && (
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
                            onChange={handleChange}
                            checked={config.allow_readonly}
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
                            onChange={handleChange}
                            checked={config.allowNewUserRegistration}
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
                            onChange={handleChange}
                            checked={config.allowDeviceAccessRequests}
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
                      onChange={handleChange}
                      value={config.expiration || ''}
                    />
                    <FormText color="muted">Examples: 60s, 1m, 1h, 1d</FormText>
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
                      With no configuration all CORS origins are accepted, but
                      client requests with credentials:include do not work. Add
                      a single * origin to allow all origins with credentials.
                      You can also restrict CORS requests to specific origins.
                      The origin that this UI was loaded from is automatically
                      added to the allowed origins so that requests from the UI
                      work. Changes to the Allowed CORS origins requires a
                      server restart.
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
                      onChange={handleChange}
                      value={config.allowedCorsOrigins || ''}
                    />
                    <FormText color="muted">
                      Use either * or a comma delimited list of origins,
                      example:
                      http://host1.name.com:3000,http://host2.name.com:3000
                    </FormText>
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Button size="sm" color="primary" onClick={handleSaveConfig}>
                <i className="fa fa-dot-circle-o" /> Save
              </Button>
            </CardFooter>
          </Card>
          <OIDCSettings />
        </div>
      )}
    </div>
  )
}
