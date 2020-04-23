import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
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
  Progress
} from 'reactstrap'
import escape from 'escape-html'

const RESTORE_NONE = 0
const RESTORE_VALIDATING = 1
const RESTORE_CONFIRM = 2
const RESTORE_RUNNING = 3

function fetchSettings () {
  fetch(`/settings`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState({ ...data, hasData: true })
    })
}

class Settings extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false,
      restoreFile: null,
      restoreState: RESTORE_NONE
    }

    this.fetchSettings = fetchSettings.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.fileChanged = this.fileChanged.bind(this)
    this.handleOptionChange = this.handleOptionChange.bind(this)
    this.handleInterfaceChange = this.handleInterfaceChange.bind(this)
    this.handleSaveSettings = this.handleSaveSettings.bind(this)
    this.handleRestoreFileChange = this.handleRestoreFileChange.bind(this)
    this.backup = this.backup.bind(this)
    this.validate = this.validate.bind(this)
    this.restore = this.restore.bind(this)
  }

  componentDidMount () {
    this.fetchSettings()
  }

  fileChanged (event) {
    this.setState({ ...this.state,
      restoreFile: event.target.files[0]
    })
  }

  backup() {
    window.location = '/backup'
  }

  restore() {
    console.log(this.state.restoreContents)
    fetch(`/restore`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state.restoreContents)
    })
      .then(response => {
        if (!response.ok) {
          return response.text()
        }
      })
      .then(res => {
        if ( typeof res === 'string' ) {
          alert(res)
          this.setState({restoreState: RESTORE_NONE, restoreFile:null})

        } else {
          this.setState({restoreState: RESTORE_RUNNING})
        }
      })
      .catch(error => {
        alert(error.message)
      })
  }

  validate() {
    if ( !this.state.restoreFile ) {
      alert('Please choose a file')
      return
    }

    const data = new FormData() 
    data.append('file', this.state.restoreFile)
    
    this.setState({restoreState: RESTORE_VALIDATING})
    fetch(`/validateBackup`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      },
      body: data
    })
      .then(response => {
        if (response.ok) {
          return response.json()
        } else {
          return response.text()
        }
      })
      .then(res => {
        if ( typeof res === 'string' ) {
          alert(res)
          this.setState({restoreState: RESTORE_NONE, restoreFile:null})

        } else {
          const restoreContents = {}
          res.forEach(filename => {
            restoreContents[filename] = true
          })
          this.setState({restoreState: RESTORE_CONFIRM, restoreContents})
        }
      })
      .catch(error => {
        alert(error.message)
      })
  }

  handleRestoreFileChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.restoreContents[event.target.name] = value
    this.setState({ restoreContents: this.state.restoreContents })
  }
  
  handleChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleOptionChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.options[event.target.name] = value
    this.setState({ options: this.state.options })
  }

  handleInterfaceChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.interfaces[event.target.name] = value
    this.setState({ interfaces: this.state.interfaces })
  }

  handleSaveSettings () {
    fetch(`/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        alert(response)
      })
  }

  render () {
    const fieldColWidthMd = 10
    return (
      this.state.hasData && (
          <div className='animated fadeIn'>
          {this.state.restoreState === RESTORE_NONE && (
          <Card>
            <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
              >
              {!this.state.runFromSystemd && (
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='port'>HTTP Port</Label>
                  </Col>
                  <Col xs='12' md={fieldColWidthMd}>
                    <Input
                      size='5'
                      style={{ width: 'auto' }}
                      type='text'
                      name='port'
                      onChange={this.handleChange}
                      value={this.state.port}
                    />
                    <FormText color='muted'>
                      Saving a new value here will not have effect if overridden
                      by environment variable PORT
                    </FormText>
                  </Col>
                </FormGroup>
                )}
                {this.state.runFromSystemd && (
                  <FormGroup row>
                  <Col xs='12' md={fieldColWidthMd}>
                  <FormText>
                    The server was started by systemd, run signalk-server-setup to change ports and ssl configuration.
                    </FormText>
                  </Col>
                  </FormGroup>
                )}
                {this.state.options.ssl && !this.state.runFromSystemd && (
                  <FormGroup row>
                    <Col md='2'>
                      <Label htmlFor='sslport'>SSL Port</Label>
                    </Col>
                    <Col xs='12' md={fieldColWidthMd}>
                      <Input
                        size='5'
                        style={{ width: 'auto' }}
                        type='text'
                        name='sslport'
                        onChange={this.handleChange}
                        value={this.state.sslport}
                      />
                      <FormText color='muted'>
                        Saving a new value here will not have effect if
                        overridden by environment variable SSLPORT
                      </FormText>
                    </Col>
                  </FormGroup>
                )}
                <FormGroup row>
                  <Col md='2'>
                    <Label>Options</Label>
                  </Col>
                  <Col md={fieldColWidthMd}>
                    <FormGroup check>
                      {Object.keys(this.state.options).map(name => {
                        return (
                          <div key={name}>
                            <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id={name}
                                name={name}
                                className='switch-input'
                                onChange={this.handleOptionChange}
                                checked={this.state.options[name]}
                              />
                              <span
                                className='switch-label'
                                data-on='On'
                                data-off='Off'
                              />
                              <span className='switch-handle' />
                            </Label>{' '}
                            {name}
                          </div>
                        )
                      })}
                    </FormGroup>
                  </Col>
                </FormGroup>

                <FormGroup row>
                  <Col md='2'>
                    <Label>Interfaces</Label>
                  </Col>
                  <Col md={fieldColWidthMd}>
                    <FormGroup check>
                      {Object.keys(this.state.interfaces).map(name => {
                        return (
                          <div key={name}>
                            <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id={name}
                                name={name}
                                className='switch-input'
                                onChange={this.handleInterfaceChange}
                                checked={this.state.interfaces[name]}
                              />
                              <span
                                className='switch-label'
                                data-on='On'
                                data-off='Off'
                              />
                              <span className='switch-handle' />
                            </Label>{' '}
                            {name}
                          </div>
                        )
                      })}
                    </FormGroup>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='loggingDirectory'>
                      Data Logging Directory
                    </Label>
                  </Col>
                  <Col xs='12' md={fieldColWidthMd}>
                    <Input
                      type='text'
                      name='loggingDirectory'
                      onChange={this.handleChange}
                      value={this.state.loggingDirectory}
                    />
                    <FormText color='muted'>
                      Connections that have logging enabled create hourly log
                      files in Multiplexed format in this directory
                    </FormText>
                  </Col>
              </FormGroup>
              <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='pruneContextsMinutes'>
                    Maximum age of inactive vessels' data
                    </Label>
                  </Col>
                  <Col xs='12' md={fieldColWidthMd}>
                    <Input
                      type='text'
                      name='pruneContextsMinutes'
                      onChange={this.handleChange}
                      value={this.state.pruneContextsMinutes}
                    />
                     <FormText color='muted'>
                      
                      Vessels that have not been updated after this many minutes will be removed
                    </FormText>
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Button
                size='sm'
                color='primary'
                onClick={this.handleSaveSettings}
              >
                <i className='fa fa-dot-circle-o' /> Save
              </Button>{' '}
              <Badge color='danger' className='float-right'>
                Restart Required
              </Badge>
            </CardFooter>
          </Card>
          )}
          <Card>
            <CardHeader>Backup and Restore</CardHeader>
            <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
              >
            {this.state.restoreState === RESTORE_NONE && (
            <div>
            <FormText color='muted'>
              The backup will contain the server and plugin settings only.
            </FormText><br/>
              <FormGroup row>
                  <Col xs='12' md={fieldColWidthMd}>
                    <Input
                      type='file'
                      name='backupFile'
                      onChange={this.fileChanged}
                    />
                    <FormText color='muted'>
                      Your existing settings will be overwritten
                    </FormText>
                  </Col>
              </FormGroup>
              </div>
             )}
             {this.state.restoreState === RESTORE_CONFIRM && (
                  <FormGroup check>
                  <Col xs='12' md={fieldColWidthMd}>
                      {_.keys(this.state.restoreContents).map(name => {
                        return (
                          <div key={name}>
                            <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id={name}
                                name={name}
                                className='switch-input'
                                onChange={this.handleRestoreFileChange}
                                checked={this.state.restoreContents[name]}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
                            </Label>{' '}
                            {name}
                          </div>
                        )
                      })}
                  </Col>
                  </FormGroup>
             )}
             {this.state.restoreState == RESTORE_RUNNING && this.props.restoreStatus && this.props.restoreStatus.state && (
             <div>
             <FormGroup row>             
               <Col xs='12' md={fieldColWidthMd}>
               <FormText>{this.props.restoreStatus.state} : {escape(this.props.restoreStatus.message)}</FormText>
               </Col>
             </FormGroup>
             <FormGroup row>             
               <Col xs='12' md={fieldColWidthMd}>
               <Progress
                 animated
                 color='success'
                 value={this.props.restoreStatus.percentComplete}
               />
               </Col>
             </FormGroup>
             </div>
             )}
             </Form>
            </CardBody>
            <CardFooter>
            {this.state.restoreState === RESTORE_NONE && (
            <div>
              <Button
                size='sm'
                color='primary'
                onClick={this.backup}
              >
                <i className='fa fa-dot-circle-o' /> Backup
              </Button>{' '}
              <Button
                size='sm'
                color='danger'
                onClick={this.validate}
              >
                <i className='fa fa-dot-circle-o' /> Restore
              </Button>{' '}
            </div>
            )}
            {this.state.restoreState === RESTORE_CONFIRM && (
            <div>
              <Button
                size='sm'
                color='primary'
                onClick={this.cancelRestore}
              >
                <i className='fa fa-dot-circle-o' /> Cancel
              </Button>{' '}
              <Button
                size='sm'
                color='danger'
                onClick={this.restore}
              >
                <i className='fa fa-dot-circle-o' /> Confirm
              </Button>
              </div>
            )}
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

export default connect(({restoreStatus}) => ({restoreStatus}))(Settings)
