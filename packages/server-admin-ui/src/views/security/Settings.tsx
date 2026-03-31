import { useState, useEffect, useCallback, ChangeEvent } from 'react'
import { useLoginStatus } from '../../store'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import Modal from 'react-bootstrap/Modal'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons/faShieldHalved'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import EnableSecurity from './EnableSecurity'
import OIDCSettings from './OIDCSettings'
import { disableSecurity } from '../../actions'

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
          <DisableSecurity />
        </div>
      )}
    </div>
  )
}

function DisableSecurity() {
  const [showModal, setShowModal] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDisabling, setIsDisabling] = useState(false)

  const handleClose = () => {
    setShowModal(false)
    setUsername('')
    setPassword('')
    setError(null)
  }

  const handleSubmit = async () => {
    setIsDisabling(true)
    setError(null)
    const result = await disableSecurity(username, password)
    setIsDisabling(false)
    if (result) {
      setError(result)
    } else {
      handleClose()
      alert(
        'Security disabled. Please restart the server for changes to take effect.'
      )
    }
  }

  return (
    <>
      <Card className="mt-3">
        <Card.Header>
          <FontAwesomeIcon icon={faShieldHalved} /> Disable Security
        </Card.Header>
        <Card.Body>
          <p className="text-muted">
            Disabling security removes all authentication requirements. Your
            security configuration (users, devices) will be backed up and can be
            restored when re-enabling security.
          </p>
          <Button size="sm" variant="danger" onClick={() => setShowModal(true)}>
            <FontAwesomeIcon icon={faShieldHalved} /> Disable Security
          </Button>
        </Card.Body>
      </Card>
      <Modal show={showModal} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Disable Security</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">
            Enter your admin credentials to confirm disabling security. The
            server will need to be restarted.
          </p>
          <InputGroup className="mb-3">
            <InputGroup.Text>
              <FontAwesomeIcon icon={faUser} />
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setUsername(e.target.value)
              }
              onKeyUp={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </InputGroup>
          <InputGroup className="mb-3">
            <InputGroup.Text>
              <FontAwesomeIcon icon={faLock} />
            </InputGroup.Text>
            <Form.Control
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
              onKeyUp={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </InputGroup>
          {error && <p className="text-danger">{error}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={isDisabling || !username || !password}
          >
            <FontAwesomeIcon
              icon={isDisabling ? faSpinner : faShieldHalved}
              spin={isDisabling}
            />{' '}
            Disable Security
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
