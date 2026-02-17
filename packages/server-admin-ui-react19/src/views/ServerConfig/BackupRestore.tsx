import React, { useState, useCallback } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import ProgressBar from 'react-bootstrap/ProgressBar'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faCircleDot } from '@fortawesome/free-regular-svg-icons/faCircleDot'
import { useStore, useRestarting } from '../../store'
import { restartAction } from '../../actions'

const RESTORE_NONE = 0
const RESTORE_VALIDATING = 1
const RESTORE_CONFIRM = 2
const RESTORE_RUNNING = 3

interface RestoreStatus {
  state?: string
  message?: string
  percentComplete?: number
}

const BackupRestore: React.FC = () => {
  const restoreStatus = useStore(
    (state) => state.restoreStatus
  ) as RestoreStatus
  const restarting = useRestarting()

  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreState, setRestoreState] = useState(RESTORE_NONE)
  const [includePlugins, setIncludePlugins] = useState(false)
  const [restoreContents, setRestoreContents] = useState<
    Record<string, boolean>
  >({})

  const cancelRestore = useCallback(() => {
    setRestoreState(RESTORE_NONE)
  }, [])

  const fileChanged = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRestoreFile(event.target.files?.[0] || null)
    },
    []
  )

  const backup = useCallback(() => {
    const url = `${window.serverRoutesPrefix}/backup?includePlugins=${includePlugins}`
    window.location.href = url
  }, [includePlugins])

  const restore = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/restore`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(restoreContents)
    })
      .then((response) => {
        if (!response.ok) {
          return response.text()
        }
        return null
      })
      .then((res) => {
        if (typeof res === 'string') {
          alert(res)
          setRestoreState(RESTORE_NONE)
          setRestoreFile(null)
        } else {
          setRestoreState(RESTORE_RUNNING)
        }
      })
      .catch((error) => {
        alert(error.message)
      })
  }, [restoreContents])

  const handleRestart = useCallback(() => {
    restartAction()
    setRestoreState(RESTORE_NONE)
    window.location.href = '/admin/#/dashboard'
  }, [])

  const validate = useCallback(() => {
    if (!restoreFile) {
      alert('Please choose a file')
      return
    }

    const data = new FormData()
    data.append('file', restoreFile)

    setRestoreState(RESTORE_VALIDATING)
    fetch(`${window.serverRoutesPrefix}/validateBackup`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        Accept: 'application/json'
      },
      body: data
    })
      .then((response) => {
        if (response.ok) {
          return response.json()
        } else {
          return response.text()
        }
      })
      .then((res) => {
        if (typeof res === 'string') {
          alert(res)
          setRestoreState(RESTORE_NONE)
          setRestoreFile(null)
        } else {
          const contents: Record<string, boolean> = {}
          ;(res as string[]).forEach((filename) => {
            contents[filename] = true
          })
          setRestoreState(RESTORE_CONFIRM)
          setRestoreContents(contents)
        }
      })
      .catch((error) => {
        alert(error.message)
      })
  }, [restoreFile])

  const handleRestoreFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setRestoreContents((prev) => ({
        ...prev,
        [event.target.name]: value as boolean
      }))
    },
    []
  )

  const includePluginsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setIncludePlugins(event.target.checked)
    },
    []
  )

  const fieldColWidthMd = 10

  return (
    <div>
      {restoreState === RESTORE_NONE && !restoreStatus.state && (
        <Card>
          <Card.Header>Backup Settings</Card.Header>
          <Card.Body>
            <Form
              action=""
              method="post"
              encType="multipart/form-data"
              className="form-horizontal"
            >
              <Form.Text className="text-muted">
                This will backup your server and plugin settings.
              </Form.Text>
              <br />
              <Form.Group as={Row}>
                <Col xs="3" md="2">
                  <Form.Label htmlFor="backup-includePlugins">
                    Include Plugins
                  </Form.Label>
                </Col>
                <Col xs="2" md={fieldColWidthMd}>
                  <Form.Label className="switch switch-text switch-primary">
                    <Form.Control
                      type="checkbox"
                      id="backup-includePlugins"
                      name="enabled"
                      className="switch-input"
                      onChange={includePluginsChange}
                      checked={includePlugins}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Form.Label>
                  <Form.Text className="text-muted">
                    Selecting Yes will increase the size of the backup, but will
                    allow for offline restore.
                  </Form.Text>
                </Col>
              </Form.Group>
            </Form>
          </Card.Body>
          <Card.Footer>
            <Button size="sm" variant="primary" onClick={backup}>
              <FontAwesomeIcon icon={faCircleDot} /> Backup
            </Button>{' '}
          </Card.Footer>
        </Card>
      )}
      <Card>
        <Card.Header>Restore Settings</Card.Header>
        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            {restoreState === RESTORE_NONE && !restoreStatus.state && (
              <div>
                <Form.Text className="text-muted">
                  Please select the backup file from your device to use in
                  restoring the settings. Your existing settings will be
                  overwritten.
                </Form.Text>
                <br />
                <Form.Group as={Row}>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Form.Control
                      type="file"
                      name="backupFile"
                      onChange={fileChanged}
                    />
                  </Col>
                </Form.Group>
              </div>
            )}
            {restoreState === RESTORE_CONFIRM && (
              <Form.Group>
                <Col xs="12" md={fieldColWidthMd}>
                  {Object.keys(restoreContents).map((name) => {
                    return (
                      <div key={name}>
                        <Form.Label className="switch switch-text switch-primary">
                          <Form.Control
                            type="checkbox"
                            id={name}
                            name={name}
                            className="switch-input"
                            onChange={handleRestoreFileChange}
                            checked={restoreContents[name]}
                          />
                          <span
                            className="switch-label"
                            data-on="Yes"
                            data-off="No"
                          />
                          <span className="switch-handle" />
                        </Form.Label>{' '}
                        {name}
                      </div>
                    )
                  })}
                </Col>
              </Form.Group>
            )}
            {restoreStatus &&
              restoreStatus.state &&
              restoreStatus.state !== 'Complete' && (
                <div>
                  <Form.Group as={Row}>
                    <Col xs="12" md={fieldColWidthMd}>
                      <Form.Text>
                        {restoreStatus.state} : {restoreStatus.message}
                      </Form.Text>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
                    <Col xs="12" md={fieldColWidthMd}>
                      <ProgressBar
                        animated
                        variant="success"
                        now={restoreStatus.percentComplete}
                      />
                    </Col>
                  </Form.Group>
                </div>
              )}
            {restoreStatus.state && restoreStatus.state === 'Complete' && (
              <div>
                <Form.Group as={Row}>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Form.Text>Please Restart</Form.Text>
                  </Col>
                </Form.Group>
                <Form.Group as={Row}>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Button size="sm" variant="danger" onClick={handleRestart}>
                      <FontAwesomeIcon icon={faCircleNotch} spin={restarting} />{' '}
                      Restart
                    </Button>
                  </Col>
                </Form.Group>
              </div>
            )}
          </Form>
        </Card.Body>
        <Card.Footer>
          {restoreState === RESTORE_NONE && !restoreStatus.state && (
            <div>
              <Button
                size="sm"
                variant="danger"
                onClick={validate}
                disabled={restoreFile === null}
              >
                <FontAwesomeIcon icon={faCircleDot} /> Restore
              </Button>{' '}
            </div>
          )}
          {restoreState === RESTORE_CONFIRM && (
            <div>
              <Button size="sm" variant="primary" onClick={cancelRestore}>
                <FontAwesomeIcon icon={faCircleDot} /> Cancel
              </Button>{' '}
              <Button size="sm" variant="danger" onClick={restore}>
                <FontAwesomeIcon icon={faCircleDot} /> Confirm
              </Button>
            </div>
          )}
        </Card.Footer>
      </Card>
    </div>
  )
}

export default BackupRestore
