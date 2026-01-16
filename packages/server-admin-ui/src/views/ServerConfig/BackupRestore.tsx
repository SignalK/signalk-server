import React, { useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
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
  Progress
} from 'reactstrap'

import { restart } from '../../actions'

const RESTORE_NONE = 0
const RESTORE_VALIDATING = 1
const RESTORE_CONFIRM = 2
const RESTORE_RUNNING = 3

interface RestoreStatus {
  state?: string
  message?: string
  percentComplete?: number
}

interface RootState {
  restoreStatus: RestoreStatus
  restarting: boolean
}

const BackupRestore: React.FC = () => {
  const dispatch = useDispatch()
  const restoreStatus = useSelector((state: RootState) => state.restoreStatus)
  const restarting = useSelector((state: RootState) => state.restarting)

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
    dispatch(restart())
    setRestoreState(RESTORE_NONE)
    window.location.href = '/admin/#/dashboard'
  }, [dispatch])

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
          <CardHeader>Backup Settings</CardHeader>
          <CardBody>
            <Form
              action=""
              method="post"
              encType="multipart/form-data"
              className="form-horizontal"
            >
              <FormText color="muted">
                This will backup your server and plugin settings.
              </FormText>
              <br />
              <FormGroup row>
                <Col xs="3" md="2">
                  <Label>Include Plugins</Label>
                </Col>
                <Col xs="2" md={fieldColWidthMd}>
                  <Label className="switch switch-text switch-primary">
                    <Input
                      type="checkbox"
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
                  </Label>
                  <FormText color="muted">
                    Selecting Yes will increase the size of the backup, but will
                    allow for offline restore.
                  </FormText>
                </Col>
              </FormGroup>
            </Form>
          </CardBody>
          <CardFooter>
            <Button size="sm" color="primary" onClick={backup}>
              <i className="fa fa-dot-circle-o" /> Backup
            </Button>{' '}
          </CardFooter>
        </Card>
      )}
      <Card>
        <CardHeader>Restore Settings</CardHeader>
        <CardBody>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            {restoreState === RESTORE_NONE && !restoreStatus.state && (
              <div>
                <FormText color="muted">
                  Please select the backup file from your device to use in
                  restoring the settings. Your existing settings will be
                  overwritten.
                </FormText>
                <br />
                <FormGroup row>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Input
                      type="file"
                      name="backupFile"
                      onChange={fileChanged}
                    />
                  </Col>
                </FormGroup>
              </div>
            )}
            {restoreState === RESTORE_CONFIRM && (
              <FormGroup check>
                <Col xs="12" md={fieldColWidthMd}>
                  {Object.keys(restoreContents).map((name) => {
                    return (
                      <div key={name}>
                        <Label className="switch switch-text switch-primary">
                          <Input
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
                        </Label>{' '}
                        {name}
                      </div>
                    )
                  })}
                </Col>
              </FormGroup>
            )}
            {restoreStatus &&
              restoreStatus.state &&
              restoreStatus.state !== 'Complete' && (
                <div>
                  <FormGroup row>
                    <Col xs="12" md={fieldColWidthMd}>
                      <FormText>
                        {restoreStatus.state} : {restoreStatus.message}
                      </FormText>
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col xs="12" md={fieldColWidthMd}>
                      <Progress
                        animated
                        color="success"
                        value={restoreStatus.percentComplete}
                      />
                    </Col>
                  </FormGroup>
                </div>
              )}
            {restoreStatus.state && restoreStatus.state === 'Complete' && (
              <div>
                <FormGroup row>
                  <Col xs="12" md={fieldColWidthMd}>
                    <FormText>Please Restart</FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col xs="12" md={fieldColWidthMd}>
                    <Button size="sm" color="danger" onClick={handleRestart}>
                      {restarting ? (
                        <i className="fa fa-circle-o-notch fa-spin" />
                      ) : (
                        <i className="fa fa-circle-o-notch" />
                      )}{' '}
                      Restart
                    </Button>
                  </Col>
                </FormGroup>
              </div>
            )}
          </Form>
        </CardBody>
        <CardFooter>
          {restoreState === RESTORE_NONE && !restoreStatus.state && (
            <div>
              <Button
                size="sm"
                color="danger"
                onClick={validate}
                disabled={restoreFile === null}
              >
                <i className="fa fa-dot-circle-o" /> Restore
              </Button>{' '}
            </div>
          )}
          {restoreState === RESTORE_CONFIRM && (
            <div>
              <Button size="sm" color="primary" onClick={cancelRestore}>
                <i className="fa fa-dot-circle-o" /> Cancel
              </Button>{' '}
              <Button size="sm" color="danger" onClick={restore}>
                <i className="fa fa-dot-circle-o" /> Confirm
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

export default BackupRestore
