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
  Progress
} from 'reactstrap'

import { restart } from '../../actions'

const RESTORE_NONE = 0
const RESTORE_VALIDATING = 1
const RESTORE_CONFIRM = 2
const RESTORE_RUNNING = 3

class BackupRestore extends Component {
  constructor(props) {
    super(props)
    this.state = {
      restoreFile: null,
      restoreState: RESTORE_NONE,
      includePlugins: false
    }
    this.fileChanged = this.fileChanged.bind(this)
    this.handleRestoreFileChange = this.handleRestoreFileChange.bind(this)
    this.includePluginsChange = this.includePluginsChange.bind(this)
    this.backup = this.backup.bind(this)
    this.validate = this.validate.bind(this)
    this.restore = this.restore.bind(this)
    this.restart = this.restart.bind(this)
    this.cancelRestore = this.cancelRestore.bind(this)
  }

  cancelRestore() {
    this.setState({ restoreState: RESTORE_NONE })
  }

  fileChanged(event) {
    this.setState({ ...this.state, restoreFile: event.target.files[0] })
  }

  backup() {
    const url = `${window.serverRoutesPrefix}/backup?includePlugins=${this.state.includePlugins}`
    //const url = `/backup`
    window.location = url
  }

  restore() {
    fetch(`${window.serverRoutesPrefix}/restore`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state.restoreContents)
    })
      .then((response) => {
        if (!response.ok) {
          return response.text()
        }
      })
      .then((res) => {
        if (typeof res === 'string') {
          alert(res)
          this.setState({ restoreState: RESTORE_NONE, restoreFile: null })
        } else {
          this.setState({ restoreState: RESTORE_RUNNING })
        }
      })
      .catch((error) => {
        alert(error.message)
      })
  }

  restart() {
    this.props.restart()
    this.setState({ restoreState: RESTORE_NONE })
    window.location = '/admin/#/dashboard'
  }

  validate() {
    if (!this.state.restoreFile) {
      alert('Please choose a file')
      return
    }

    const data = new FormData()
    data.append('file', this.state.restoreFile)

    this.setState({ restoreState: RESTORE_VALIDATING })
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
          this.setState({ restoreState: RESTORE_NONE, restoreFile: null })
        } else {
          const restoreContents = {}
          res.forEach((filename) => {
            restoreContents[filename] = true
          })
          this.setState({ restoreState: RESTORE_CONFIRM, restoreContents })
        }
      })
      .catch((error) => {
        alert(error.message)
      })
  }

  handleRestoreFileChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.restoreContents[event.target.name] = value
    this.setState({ restoreContents: this.state.restoreContents })
  }

  includePluginsChange(event) {
    this.state.includePlugins = event.target.checked
    this.setState({ includePlugins: this.state.includePlugins })
  }

  render() {
    const fieldColWidthMd = 10
    return (
      <div>
        {this.state.restoreState === RESTORE_NONE &&
          !this.props.restoreStatus.state && (
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
                          onChange={(event) => this.includePluginsChange(event)}
                          checked={this.state.includePlugins}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </Label>
                      <FormText color="muted">
                        Selecting Yes will increase the size of the backup, but
                        will allow for offline restore.
                      </FormText>
                    </Col>
                  </FormGroup>
                </Form>
              </CardBody>
              <CardFooter>
                <Button size="sm" color="primary" onClick={this.backup}>
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
              {this.state.restoreState === RESTORE_NONE &&
                !this.props.restoreStatus.state && (
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
                          onChange={this.fileChanged}
                        />
                      </Col>
                    </FormGroup>
                  </div>
                )}
              {this.state.restoreState === RESTORE_CONFIRM && (
                <FormGroup check>
                  <Col xs="12" md={fieldColWidthMd}>
                    {Object.keys(this.state.restoreContents).map((name) => {
                      return (
                        <div key={name}>
                          <Label className="switch switch-text switch-primary">
                            <Input
                              type="checkbox"
                              id={name}
                              name={name}
                              className="switch-input"
                              onChange={this.handleRestoreFileChange}
                              checked={this.state.restoreContents[name]}
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
              {this.props.restoreStatus &&
                this.props.restoreStatus.state &&
                this.props.restoreStatus.state !== 'Complete' && (
                  <div>
                    <FormGroup row>
                      <Col xs="12" md={fieldColWidthMd}>
                        <FormText>
                          {this.props.restoreStatus.state} :{' '}
                          {this.props.restoreStatus.message}
                        </FormText>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col xs="12" md={fieldColWidthMd}>
                        <Progress
                          animated
                          color="success"
                          value={this.props.restoreStatus.percentComplete}
                        />
                      </Col>
                    </FormGroup>
                  </div>
                )}
              {this.props.restoreStatus.state &&
                this.props.restoreStatus.state === 'Complete' && (
                  <div>
                    <FormGroup row>
                      <Col xs="12" md={fieldColWidthMd}>
                        <FormText>Please Restart</FormText>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col xs="12" md={fieldColWidthMd}>
                        <Button size="sm" color="danger" onClick={this.restart}>
                          {this.props.restarting ? (
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
            {this.state.restoreState === RESTORE_NONE &&
              !this.props.restoreStatus.state && (
                <div>
                  <Button
                    size="sm"
                    color="danger"
                    onClick={this.validate}
                    disabled={this.state.restoreFile === null}
                  >
                    <i className="fa fa-dot-circle-o" /> Restore
                  </Button>{' '}
                </div>
              )}
            {this.state.restoreState === RESTORE_CONFIRM && (
              <div>
                <Button size="sm" color="primary" onClick={this.cancelRestore}>
                  <i className="fa fa-dot-circle-o" /> Cancel
                </Button>{' '}
                <Button size="sm" color="danger" onClick={this.restore}>
                  <i className="fa fa-dot-circle-o" /> Confirm
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    )
  }
}

export default connect(
  ({ restoreStatus, restarting }) => ({ restoreStatus, restarting }),
  { restart }
)(BackupRestore)
