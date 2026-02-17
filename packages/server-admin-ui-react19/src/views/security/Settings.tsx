import { useState, useEffect, useCallback, ChangeEvent } from 'react'
import { useLoginStatus } from '../../store'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
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
  const loginStatus = useLoginStatus()
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
            <Card.Header>
              <FontAwesomeIcon icon={faAlignJustify} /> Settings
            </Card.Header>
            <Card.Body>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
              >
                <Form.Group as={Row}>
                  <Col xs="0" md="3">
                    <span className="col-form-label">
                      Allow Readonly Access
                    </span>
                  </Col>
                  <Col md="9">
                    <div className="d-flex align-items-center">
                      <label
                        style={{ marginRight: '15px', marginBottom: 0 }}
                        className="switch switch-text switch-primary"
                      >
                        <input
                          type="checkbox"
                          id="security-allow_readonly"
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
                      </label>
                    </div>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col xs="0" md="3">
                    <span className="col-form-label">
                      Allow New User Registration
                    </span>
                  </Col>
                  <Col md="9">
                    <div className="d-flex align-items-center">
                      <label
                        style={{ marginRight: '15px', marginBottom: 0 }}
                        className="switch switch-text switch-primary"
                      >
                        <input
                          type="checkbox"
                          id="security-allowNewUserRegistration"
                          name="allowNewUserRegistration"
                          className="switch-input"
                          onChange={handleChange}
                          checked={config.allowNewUserRegistration}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </label>
                    </div>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col xs="0" md="3">
                    <span className="col-form-label">
                      Allow New Device Registration
                    </span>
                  </Col>
                  <Col md="9">
                    <div className="d-flex align-items-center">
                      <label
                        style={{ marginRight: '15px', marginBottom: 0 }}
                        className="switch switch-text switch-primary"
                      >
                        <input
                          type="checkbox"
                          id="security-allowDeviceAccessRequests"
                          name="allowDeviceAccessRequests"
                          className="switch-input"
                          onChange={handleChange}
                          checked={config.allowDeviceAccessRequests}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </label>
                    </div>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col md="3">
                    <Form.Label htmlFor="expiration">
                      Remember Me timeout
                    </Form.Label>
                  </Col>
                  <Col xs="12" md="3">
                    <Form.Control
                      type="text"
                      id="expiration"
                      name="expiration"
                      autoComplete="off"
                      onChange={handleChange}
                      value={config.expiration || ''}
                    />
                    <Form.Text muted>Examples: 60s, 1m, 1h, 1d</Form.Text>
                  </Col>
                  <Col md="6">
                    <Form.Text muted>
                      How long server keeps you logged when Remember Me is
                      checked in login.
                    </Form.Text>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col md="12">
                    <Form.Text muted>
                      With no configuration all CORS origins are accepted, but
                      client requests with credentials:include do not work. Add
                      a single * origin to allow all origins with credentials.
                      You can also restrict CORS requests to specific origins.
                      The origin that this UI was loaded from is automatically
                      added to the allowed origins so that requests from the UI
                      work. Changes to the Allowed CORS origins requires a
                      server restart.
                    </Form.Text>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col md="3">
                    <Form.Label htmlFor="allowedCorsOrigins">
                      Allowed CORS origins
                    </Form.Label>
                  </Col>
                  <Col xs="12" md="9">
                    <Form.Control
                      type="text"
                      id="allowedCorsOrigins"
                      name="allowedCorsOrigins"
                      autoComplete="off"
                      onChange={handleChange}
                      value={config.allowedCorsOrigins || ''}
                    />
                    <Form.Text muted>
                      Use either * or a comma delimited list of origins,
                      example:
                      http://host1.name.com:3000,http://host2.name.com:3000
                    </Form.Text>
                  </Col>
                </Form.Group>
              </Form>
            </Card.Body>
            <Card.Footer>
              <Button size="sm" variant="primary" onClick={handleSaveConfig}>
                <FontAwesomeIcon icon={faFloppyDisk} /> Save
              </Button>
            </Card.Footer>
          </Card>
          <OIDCSettings />
        </div>
      )}
    </div>
  )
}
