import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'

import VesselConfiguration from './VesselConfiguration'
import Logging from './Logging'
import { useStore, useLoginStatus } from '../../store'

interface ServerSettingsData {
  hasData?: boolean
  port?: string
  sslport?: string
  runFromSystemd?: boolean
  options?: Record<string, boolean>
  interfaces?: Record<string, boolean>
  pruneContextsMinutes?: string
  loggingDirectory?: string
  keepMostRecentLogsOnly?: boolean
  logCountToKeep?: string
  courseApi?: {
    apiOnly?: boolean
  }
  notifications?: {
    manageNotifications?: boolean
  }
}

interface SecurityConfig {
  allow_readonly: boolean
}

// Opacity applied to the interface row when its toggle is disabled.
const DISABLED_ROW_OPACITY = 0.5
const ENABLED_ROW_OPACITY = 1

const SettableInterfaces: Record<string, string> = {
  applicationData: 'Application Data Storage',
  logfiles: 'Data log files access',
  'nmea-tcp': 'NMEA 0183 over TCP (10110)',
  tcp: 'Signal K over TCP (8375)',
  wasm: 'WebAssembly Runtime'
}

const ServerSettings: React.FC = () => {
  const loginStatus = useLoginStatus()
  const [settings, setSettings] = useState<ServerSettingsData>({
    hasData: false
  })
  // The Signal K over TCP interface only starts when anonymous readonly
  // access is allowed (see src/interfaces/tcp.ts). Track that so the toggle
  // can reflect when the port would not actually be available. null = unknown
  // (not yet fetched, fetch failed, or security disabled).
  const [allowReadonly, setAllowReadonly] = useState<boolean | null>(null)

  const fetchSettings = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/settings`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data: ServerSettingsData) => {
        setSettings({ ...data, hasData: true })
      })
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      fetch(`${window.serverRoutesPrefix}/security/config`, {
        credentials: 'include'
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Unable to load security config')
          }
          return response.json() as Promise<SecurityConfig>
        })
        .then((data) => setAllowReadonly(data.allow_readonly))
        .catch(() => setAllowReadonly(null))
    } else {
      setAllowReadonly(null)
    }
  }, [loginStatus.authenticationRequired])

  // When security is enabled but anonymous readonly access is off, the Signal K
  // over TCP port is not opened by the server even if its toggle is on. Only
  // warn when we know readonly is off (allowReadonly === false), not when the
  // security config is still unknown.
  const tcpUnavailable =
    loginStatus.authenticationRequired === true && allowReadonly === false

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setSettings((prev) => ({ ...prev, [event.target.name]: value }))
    },
    []
  )

  const handleCourseApiChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setSettings((prev) => ({
        ...prev,
        courseApi: {
          ...prev.courseApi,
          [event.target.name]: value
        }
      }))
    },
    []
  )

  const handleNotificationsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [event.target.name]: value
        }
      }))
    },
    []
  )

  const handleOptionChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setSettings((prev) => ({
        ...prev,
        options: {
          ...prev.options,
          [event.target.name]: value as boolean
        }
      }))
    },
    []
  )

  const handleInterfaceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setSettings((prev) => ({
        ...prev,
        interfaces: {
          ...prev.interfaces,
          [event.target.name]: value as boolean
        }
      }))
    },
    []
  )

  const handleSaveSettings = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings),
      credentials: 'include'
    }).then((response) => {
      if (response.ok) {
        useStore.getState().setRestartRequired(true)
      }
    })
  }, [settings])

  const fieldColWidthMd = 10

  if (!settings.hasData) {
    return null
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Header>
          <FontAwesomeIcon icon={faAlignJustify} />{' '}
          <strong>Server Settings</strong>
        </Card.Header>
        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            {!settings.runFromSystemd && (
              <Form.Group as={Row}>
                <Col md="2">
                  <Form.Label htmlFor="port">HTTP Port</Form.Label>
                </Col>
                <Col xs="12" md={fieldColWidthMd}>
                  <Form.Control
                    size={5}
                    style={{ width: 'auto' }}
                    type="text"
                    id="port"
                    name="port"
                    autoComplete="off"
                    onChange={handleChange}
                    value={settings.port || ''}
                  />
                  <Form.Text muted>
                    Saving a new value here will not have effect if overridden
                    by environment variable PORT
                  </Form.Text>
                </Col>
              </Form.Group>
            )}
            {settings.runFromSystemd && (
              <Form.Group as={Row}>
                <Col xs="12" md={fieldColWidthMd}>
                  <Form.Text>
                    The server was started by systemd, run signalk-server-setup
                    to change ports and ssl configuration.
                  </Form.Text>
                </Col>
              </Form.Group>
            )}
            {settings.options?.ssl && !settings.runFromSystemd && (
              <Form.Group as={Row}>
                <Col md="2">
                  <Form.Label htmlFor="sslport">SSL Port</Form.Label>
                </Col>
                <Col xs="12" md={fieldColWidthMd}>
                  <Form.Control
                    size={5}
                    style={{ width: 'auto' }}
                    type="text"
                    id="sslport"
                    name="sslport"
                    autoComplete="off"
                    onChange={handleChange}
                    value={settings.sslport || ''}
                  />
                  <Form.Text muted>
                    Saving a new value here will not have effect if overridden
                    by environment variable SSLPORT
                  </Form.Text>
                </Col>
              </Form.Group>
            )}
            <Form.Group as={Row}>
              <Col md="2">
                <span className="col-form-label">Options</span>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                {settings.options &&
                  Object.keys(settings.options).map((name) => {
                    return (
                      <div
                        key={name}
                        className="d-flex align-items-center mb-2"
                      >
                        <Form.Label
                          style={{ marginRight: '15px', marginBottom: 0 }}
                          className="switch switch-text switch-primary"
                        >
                          <input
                            type="checkbox"
                            id={`option-${name}`}
                            name={name}
                            className="switch-input"
                            onChange={handleOptionChange}
                            checked={settings.options?.[name] || false}
                          />
                          <span
                            className="switch-label"
                            data-on="On"
                            data-off="Off"
                          />
                          <span className="switch-handle" />
                        </Form.Label>
                        <span>{name}</span>
                      </div>
                    )
                  })}
              </Col>
            </Form.Group>

            <Form.Group as={Row}>
              <Col md="2">
                <span className="col-form-label">Interfaces</span>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                {Object.keys(SettableInterfaces).map((name) => {
                  const disabled = name === 'tcp' && tcpUnavailable
                  return (
                    <div key={name} className="mb-2">
                      <div
                        className="d-flex align-items-center"
                        style={{
                          opacity: disabled
                            ? DISABLED_ROW_OPACITY
                            : ENABLED_ROW_OPACITY
                        }}
                      >
                        <Form.Label
                          style={{ marginRight: '15px', marginBottom: 0 }}
                          className="switch switch-text switch-primary"
                        >
                          <input
                            type="checkbox"
                            id={`interface-${name}`}
                            name={name}
                            className="switch-input"
                            onChange={handleInterfaceChange}
                            checked={
                              disabled
                                ? false
                                : settings.interfaces?.[name] || false
                            }
                            disabled={disabled}
                          />
                          <span
                            className="switch-label"
                            data-on="On"
                            data-off="Off"
                          />
                          <span className="switch-handle" />
                        </Form.Label>
                        <span>{SettableInterfaces[name]}</span>
                      </div>
                      {disabled && (
                        <Alert
                          variant="warning"
                          className="mt-1 mb-0 py-1 px-2"
                        >
                          <small>
                            Enable{' '}
                            <Link to="/security/settings">
                              Allow Readonly Access
                            </Link>{' '}
                            under Security → Settings to make this port
                            available.
                          </small>
                        </Alert>
                      )}
                    </div>
                  )
                })}
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="pruneContextsMinutes">
                  Maximum age of inactive vessels&apos; data
                </Form.Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <Form.Control
                  type="text"
                  id="pruneContextsMinutes"
                  name="pruneContextsMinutes"
                  autoComplete="off"
                  onChange={handleChange}
                  value={settings.pruneContextsMinutes || ''}
                />
                <Form.Text muted>
                  Vessels that have not been updated after this many minutes
                  will be removed
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="loggingDirectory">
                  Data Logging Directory
                </Form.Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <Form.Control
                  type="text"
                  id="loggingDirectory"
                  name="loggingDirectory"
                  autoComplete="off"
                  onChange={handleChange}
                  value={settings.loggingDirectory || ''}
                />
                <Form.Text muted>
                  Connections and plugins that have logging enabled create
                  hourly log files in Multiplexed format in this directory. This
                  can consume significant disk space — enable the option below
                  to limit retention.
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="keepMostRecentLogsOnly">
                  Keep only most recent data log files
                </Form.Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <div className="d-flex align-items-center">
                  <Form.Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <input
                      type="checkbox"
                      name="keepMostRecentLogsOnly"
                      id="keepMostRecentLogsOnly"
                      className="switch-input"
                      onChange={handleChange}
                      checked={settings.keepMostRecentLogsOnly || false}
                    />
                    <span
                      className="switch-label"
                      data-on="On"
                      data-off="Off"
                    />
                    <span className="switch-handle" />
                  </Form.Label>
                  <div>
                    <Form.Label
                      htmlFor="logCountToKeep"
                      className="visually-hidden"
                    >
                      Number of log files to keep
                    </Form.Label>
                    <Form.Control
                      type="text"
                      id="logCountToKeep"
                      name="logCountToKeep"
                      autoComplete="off"
                      onChange={handleChange}
                      value={settings.logCountToKeep || ''}
                      style={{ width: '80px' }}
                    />
                    <Form.Text muted>How many hourly files to keep</Form.Text>
                  </div>
                </div>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="apiOnly">
                  API Only Mode
                  <br />
                  <i>(Course API)</i>
                </Form.Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <div className="d-flex align-items-center mb-2">
                  <Form.Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <input
                      type="checkbox"
                      name="apiOnly"
                      id="apiOnly"
                      className="switch-input"
                      onChange={handleCourseApiChange}
                      checked={settings.courseApi?.apiOnly || false}
                    />
                    <span
                      className="switch-label"
                      data-on="On"
                      data-off="Off"
                    />
                    <span className="switch-handle" />
                  </Form.Label>
                </div>
                <Form.Text muted>
                  Accept course operations only via HTTP requests. Destination
                  data from NMEA sources is not used.
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="manageNotifications">
                  Manage Notifications
                  <br />
                  <i>(restart required)</i>
                </Form.Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <div className="d-flex align-items-center mb-2">
                  <Form.Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <input
                      type="checkbox"
                      name="manageNotifications"
                      id="manageNotifications"
                      className="switch-input"
                      onChange={handleNotificationsChange}
                      checked={
                        settings.notifications?.manageNotifications ?? true
                      }
                    />
                    <span
                      className="switch-label"
                      data-on="On"
                      data-off="Off"
                    />
                    <span className="switch-handle" />
                  </Form.Label>
                </div>
                <Form.Text muted>
                  Run the built-in notification manager. Turn off to let an
                  external notification handler own notification lifecycle and
                  avoid conflicts. Disabling stops core silence/acknowledge
                  handling; those operations return 501.
                </Form.Text>
              </Col>
            </Form.Group>
          </Form>
        </Card.Body>
        <Card.Footer>
          <Button size="sm" variant="primary" onClick={handleSaveSettings}>
            <FontAwesomeIcon icon={faFloppyDisk} /> Save
          </Button>
        </Card.Footer>
      </Card>
    </div>
  )
}

const Settings: React.FC = () => {
  return (
    <div>
      <VesselConfiguration />
      <ServerSettings />
      <Logging />
    </div>
  )
}

export default Settings
