import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Input, FormGroup, FormText, Col, Label } from 'reactstrap'

class BasicProvider extends Component {
  render () {
    const lookup = {
      NMEA2000: NMEA2000,
      NMEA0183: NMEA0183,
      SignalK: SignalK,
      FileStream: FileStream
    }
    let TypeComponent = lookup[this.props.value.type] || (() => null)

    return (
      <div>
        <FormGroup row>
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Input Type</Label>
          </Col>
          <Col xs='6' md='3'>
            {this.props.value.isNew ? (
              <Input
                type='select'
                value={this.props.type}
                name='type'
                onChange={event => this.props.onChange(event)}
              >
                <option value='NMEA2000'>NMEA 2000</option>
                <option value='NMEA0183'>NMEA 0183</option>
                <option value='SignalK'>Signal K</option>
                <option value='FileStream'>File Stream</option>
              </Input>
            ) : (
              this.props.value.type
            )}
          </Col>
        </FormGroup>
        <FormGroup row>
          <Col xs='3' md='2'>
            <Label>Enabled</Label>
          </Col>
          <Col xs='2' md='3'>
            <Label className='switch switch-text switch-primary'>
              <Input
                type='checkbox'
                name='enabled'
                className='switch-input'
                onChange={event => this.props.onChange(event)}
                checked={this.props.value.enabled}
              />
              <span className='switch-label' data-on='Yes' data-off='No' />
              <span className='switch-handle' />
            </Label>
          </Col>
        </FormGroup>
        {this.props.value.type !== 'FileStream' && (
          <LoggingInput
            value={this.props.value}
            onChange={this.props.onChange}
          />
        )}
        <FormGroup row>
          <Col md='2'>
            <Label htmlFor='id'>ID</Label>
          </Col>
          <Col xs='12' md='3'>
            <Input
              type='text'
              name='id'
              value={this.props.value.id}
              onChange={event => this.props.onChange(event)}
            />
          </Col>
        </FormGroup>
        <TypeComponent
          value={this.props.value}
          onChange={this.props.onChange}
        />
      </div>
    )
  }
}

export default BasicProvider

class TextInput extends Component {
  render () {
    return (
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor={this.props.name}>{this.props.title}</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='text'
            name={this.props.name}
            value={this.props.value}
            onChange={event => this.props.onChange(event)}
          />
          {this.props.helpText && (
            <FormText color='muted'>{this.props.helpText}</FormText>
          )}
        </Col>
      </FormGroup>
    )
  }
}

class DeviceInput extends Component {
  render () {
    return (
      <div>
        <TextInput
          title='Device'
          name='options.device'
          helpText='Example: /dev/ttyUSB0'
          value={this.props.value.device}
          onChange={this.props.onChange}
        />
      </div>
    )
  }
}

class LoggingInput extends Component {
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='2'>
          <Label>Logging</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='logging'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.logging}
            />
            <span className='switch-label' data-on='Yes' data-off='No' />
            <span className='switch-handle' />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class ValidateChecksumInput extends Component {
  constructor(props) {
    super(props)
    this.props.value.validateChecksum = typeof this.props.value.validateChecksum === 'undefined' || this.props.value.validateChecksum
  }
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='2'>
          <Label>Validate Checksum</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.validateChecksum'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.validateChecksum}
            />
            <span className='switch-label' data-on='Yes' data-off='No' />
            <span className='switch-handle' />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class DataTypeInput extends Component {
  render () {
    return (
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor='dataType'>Data Type</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='select'
            value={this.props.value.options.dataType}
            name='options.dataType'
            onChange={event => this.props.onChange(event)}
          >
            <option value='SignalK'>Signal K</option>
        <option value='NMEA2000'>NMEA 2000 (canboat)</option>
            <option value='NMEA2000JS'>NMEA 2000 (canboatjs)</option>
            <option value='NMEA0183'>NMEA 0183</option>
            {this.props.value.type === 'FileStream' && (
              <option value='Multiplexed'>Multiplexed Log</option>
            )}
          </Input>
        </Col>
      </FormGroup>
    )
  }
}

class BaudRateIntput extends Component {
  render () {
    return (
      <TextInput
        title='Baud Rate'
        name='options.baudrate'
        helpText='Example: 4800'
        value={this.props.value.baudrate}
        onChange={event => this.props.onChange(event, 'number')}
      />
    )
  }
}

class PortInput extends Component {
  render () {
    return (
      <TextInput
        title='Port'
        name='options.port'
        helpText='Example: 4123'
        value={this.props.value.port}
        onChange={this.props.onChange}
      />
    )
  }
}

class HostInput extends Component {
  render () {
    return (
      <TextInput
        title='Host'
        name='options.host'
        helpText='Example: localhost'
        value={this.props.value.host}
        onChange={this.props.onChange}
      />
    )
  }
}

const NMEA2000 = props => {
  return (
    <div>
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor='options.type'>NMEA 2000 Source</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='select'
            value={props.value.options.type || 'none'}
            name='options.type'
            onChange={event => props.onChange(event)}
          >
            <option value='none'>Select a source</option>
            <option value='ngt-1'>Actisense NTG-1 (canboat)</option>
            <option value='ngt-1-canboatjs'>Actisense NTG-1 (canboatjs)</option>
            <option value='canbus'>Canbus (canboat)</option>
            <option value='canbus-canboatjs'>Canbus (canboatjs)</option>
          </Input>
        </Col>
      </FormGroup>
      {(props.value.options.type === 'ngt-1' || props.value.options.type === 'ngt-1-canboatjs')  && (
        <DeviceInput value={props.value.options} onChange={props.onChange} />
      )}
      {(props.value.options.type === 'canbus' || props.value.options.type === 'canbus-canboatjs') && (
        <TextInput
          title='Interface'
          name='options.interface'
          helpText='Example: can0'
          value={props.value.options.interface}
          onChange={props.onChange}
        />
      )}
    </div>
  )
}

const NMEA0183 = props => {
  return (
    <div>
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor='options.type'>NMEA 0183 Source</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='select'
            value={props.value.options.type}
            name='options.type'
            onChange={event => props.onChange(event)}
          >
            <option>Select a source</option>
            <option value='serial'>Serial</option>
            <option value='tcp'>TCP</option>
            <option value='udp'>UDP</option>
          </Input>
        </Col>
      </FormGroup>
      {props.value.options.type === 'serial' && (
        <div>
          <DeviceInput value={props.value.options} onChange={props.onChange} />
          <BaudRateIntput
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      {props.value.options.type === 'tcp' && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
        </div>
      )}
      {props.value.options.type === 'udp' && (
        <PortInput value={props.value.options} onChange={props.onChange} />
      )}
      <ValidateChecksumInput
        value={props.value.options}
        onChange={props.onChange}
      />
    </div>
  )
}

const SignalK = props => {
  return (
    <div>
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor='options.type'>SignalK Source</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='select'
            value={props.value.options.type}
            name='options.type'
            onChange={event => props.onChange(event)}
          >
            <option>Select a source</option>
            <option value='ws'>WebSocket</option>
            <option value='wss'>WebSocket SSL</option>
            <option value='tcp'>TCP</option>
            <option value='udp'>UDP</option>
          </Input>
        </Col>
      </FormGroup>
      {(props.value.options.type === 'ws' ||
        props.value.options.type === 'wss' ||
        props.value.options.type === 'tcp') && (
          <div>
            {(props.value.options.type === 'ws' ||
            props.value.options.type === 'wss') && (
                <FormGroup row>
                  <Col xs='0' md='2'>
                    <Label />
                  </Col>
                  <Col xs='12' md='3'>
                    <div className='checkbox'>
                      <Label check htmlFor='enabled'>
                        <Input
                          type='checkbox'
                          name='options.useDiscovery'
                          onChange={props.onChange}
                          checked={props.value.options.useDiscovery}
                        />Use Discovery
                      </Label>
                    </div>
                  </Col>
                </FormGroup>
              )}
            {!props.value.options.useDiscovery && (
              <div>
                <HostInput
                  value={props.value.options}
                  onChange={props.onChange}
                />
                <PortInput
                  value={props.value.options}
                  onChange={props.onChange}
                />
              </div>
            )}
          </div>
        )}
      {props.value.options.type === 'udp' && (
        <PortInput value={props.value.options} onChange={props.onChange} />
      )}
    </div>
  )
}

const FileStream = props => {
  return (
    <div>
      <DataTypeInput value={props.value} onChange={props.onChange} />
      <TextInput
        title='File Name'
        name='options.filename'
        value={props.value.options.filename}
        onChange={props.onChange}
      />
    </div>
  )
}
