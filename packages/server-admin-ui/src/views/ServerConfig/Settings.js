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
  Table
} from 'reactstrap'

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
      hasData: false
    }

    this.fetchSettings = fetchSettings.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleOptionChange = this.handleOptionChange.bind(this)
    this.handleInterfaceChange = this.handleInterfaceChange.bind(this)
    this.handleSaveSettings = this.handleSaveSettings.bind(this)
  }

  componentDidMount () {
    this.fetchSettings()
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
                      Providers that have logging enabled create hourly log
                      files in Multiplexed format in this directory
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
        </div>
      )
    )
  }
}

export default connect()(Settings)
