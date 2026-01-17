import React, { useState, useEffect, useCallback } from 'react'
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
  FormText
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'

import VesselConfiguration from './VesselConfiguration'
import Logging from './Logging'

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
}

const SettableInterfaces: Record<string, string> = {
  applicationData: 'Application Data Storage',
  logfiles: 'Data log files access',
  'nmea-tcp': 'NMEA 0183 over TCP (10110)',
  tcp: 'Signal K over TCP (8375)',
  wasm: 'WebAssembly Runtime'
}

const ServerSettings: React.FC = () => {
  const [settings, setSettings] = useState<ServerSettingsData>({
    hasData: false
  })

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
    })
      .then((response) => response.text())
      .then((response) => {
        alert(response)
      })
  }, [settings])

  const fieldColWidthMd = 10

  if (!settings.hasData) {
    return null
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <CardHeader>
          <FontAwesomeIcon icon={faAlignJustify} />{' '}
          <strong>Server Settings</strong>
        </CardHeader>
        <CardBody>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            {!settings.runFromSystemd && (
              <FormGroup row>
                <Col md="2">
                  <Label htmlFor="port">HTTP Port</Label>
                </Col>
                <Col xs="12" md={fieldColWidthMd}>
                  <Input
                    size={5}
                    style={{ width: 'auto' }}
                    type="text"
                    id="port"
                    name="port"
                    autoComplete="off"
                    onChange={handleChange}
                    value={settings.port || ''}
                  />
                  <FormText color="muted">
                    Saving a new value here will not have effect if overridden
                    by environment variable PORT
                  </FormText>
                </Col>
              </FormGroup>
            )}
            {settings.runFromSystemd && (
              <FormGroup row>
                <Col xs="12" md={fieldColWidthMd}>
                  <FormText>
                    The server was started by systemd, run signalk-server-setup
                    to change ports and ssl configuration.
                  </FormText>
                </Col>
              </FormGroup>
            )}
            {settings.options?.ssl && !settings.runFromSystemd && (
              <FormGroup row>
                <Col md="2">
                  <Label htmlFor="sslport">SSL Port</Label>
                </Col>
                <Col xs="12" md={fieldColWidthMd}>
                  <Input
                    size={5}
                    style={{ width: 'auto' }}
                    type="text"
                    id="sslport"
                    name="sslport"
                    autoComplete="off"
                    onChange={handleChange}
                    value={settings.sslport || ''}
                  />
                  <FormText color="muted">
                    Saving a new value here will not have effect if overridden
                    by environment variable SSLPORT
                  </FormText>
                </Col>
              </FormGroup>
            )}
            <FormGroup row>
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
                        <Label
                          style={{ marginRight: '15px', marginBottom: 0 }}
                          className="switch switch-text switch-primary"
                        >
                          <Input
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
                        </Label>
                        <span>{name}</span>
                      </div>
                    )
                  })}
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="2">
                <span className="col-form-label">Interfaces</span>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                {Object.keys(SettableInterfaces).map((name) => {
                  return (
                    <div key={name} className="d-flex align-items-center mb-2">
                      <Label
                        style={{ marginRight: '15px', marginBottom: 0 }}
                        className="switch switch-text switch-primary"
                      >
                        <Input
                          type="checkbox"
                          id={`interface-${name}`}
                          name={name}
                          className="switch-input"
                          onChange={handleInterfaceChange}
                          checked={settings.interfaces?.[name] || false}
                        />
                        <span
                          className="switch-label"
                          data-on="On"
                          data-off="Off"
                        />
                        <span className="switch-handle" />
                      </Label>
                      <span>{SettableInterfaces[name]}</span>
                    </div>
                  )
                })}
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
                  id="pruneContextsMinutes"
                  name="pruneContextsMinutes"
                  autoComplete="off"
                  onChange={handleChange}
                  value={settings.pruneContextsMinutes || ''}
                />
                <FormText color="muted">
                  Vessels that have not been updated after this many minutes
                  will be removed
                </FormText>
              </Col>
            </FormGroup>
            <FormGroup row>
              <Col md="2">
                <Label htmlFor="loggingDirectory">Data Logging Directory</Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <Input
                  type="text"
                  id="loggingDirectory"
                  name="loggingDirectory"
                  autoComplete="off"
                  onChange={handleChange}
                  value={settings.loggingDirectory || ''}
                />
                <FormText color="muted">
                  Connections that have logging enabled create hourly log files
                  in Multiplexed format in this directory
                </FormText>
              </Col>
            </FormGroup>
            <FormGroup row>
              <Col md="2">
                <Label htmlFor="keepMostRecentLogsOnly">
                  Keep only most recent data log files
                </Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <div className="d-flex align-items-center">
                  <Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <Input
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
                  </Label>
                  <div>
                    <Label htmlFor="logCountToKeep" className="visually-hidden">
                      Number of log files to keep
                    </Label>
                    <Input
                      type="text"
                      id="logCountToKeep"
                      name="logCountToKeep"
                      autoComplete="off"
                      onChange={handleChange}
                      value={settings.logCountToKeep || ''}
                      style={{ width: '80px' }}
                    />
                    <FormText color="muted">
                      How many hourly files to keep
                    </FormText>
                  </div>
                </div>
              </Col>
            </FormGroup>
            <FormGroup row>
              <Col md="2">
                <Label htmlFor="apiOnly">
                  API Only Mode
                  <br />
                  <i>(Course API)</i>
                </Label>
              </Col>
              <Col xs="12" md={fieldColWidthMd}>
                <div className="d-flex align-items-center mb-2">
                  <Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <Input
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
                  </Label>
                </div>
                <FormText color="muted">
                  Accept course operations only via HTTP requests. Destination
                  data from NMEA sources is not used.
                </FormText>
              </Col>
            </FormGroup>
          </Form>
        </CardBody>
        <CardFooter>
          <Button size="sm" color="primary" onClick={handleSaveSettings}>
            <FontAwesomeIcon icon={faFloppyDisk} /> Save
          </Button>{' '}
          <Badge color="danger" className="float-end">
            Restart Required
          </Badge>
        </CardFooter>
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
