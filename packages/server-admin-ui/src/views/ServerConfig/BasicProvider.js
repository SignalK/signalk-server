import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Input, FormGroup, FormText, Col, Label } from 'reactstrap'

class BasicProvider extends Component {
  constructor(props) {
    super()
    this.state = {
      hasAnalyzer: false
    }
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/hasAnalyzer`, {
      credentials: 'include'
    })
    .then(response => response.json())
    .then(value => {
      this.setState({ hasAnalyzer: value })
    })
  }

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
          hasAnalyzer={this.state.hasAnalyzer}
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
  constructor(props) {
    super()
    this.state = {
      devices: []
    }
  }

  componentDidMount() {
    fetch(`/serialports`, {
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        this.setState({
          devices: data
        })
      })
  }

  render () {
    const isManualEntry = !this.state.devices.includes(this.props.value.device)
    let manualEntryValue = isManualEntry
      ? this.props.value.device === 'Enter manually'
        ? ''
        : this.props.value.device
      : ''
    const fixedEntries = ['Enter manually', '-']
    return (
      <FormGroup row>
        <Col md='2'>
          <Label htmlFor="serialportselect">Serial port</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type="select"
            name="options.device"
            id="serialportselect"
            onChange={this.props.onChange}
            value={isManualEntry ? 'Enter manually' : this.props.value.device}>
              {fixedEntries.concat(this.state.devices).map((device, i) => (
                <option disabled={device === '-'}key={i}>{device}</option>
              ))}
          </Input>
        </Col>
        <Col xs='12' md='3'>
          <Input
              type='text'
              name='options.device'
              disabled={!isManualEntry}
              value={manualEntryValue}
              onChange={event => this.props.onChange(event)}
            />
        </Col>
      </FormGroup>
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
  constructor (props) {
    super(props)
    this.props.value.validateChecksum =
      typeof this.props.value.validateChecksum === 'undefined' ||
      this.props.value.validateChecksum
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

class SentenceEventInput extends Component {
  render () {
    return (
      <TextInput
        title='sentenceEvent'
        name='options.sentenceEvent'
        helpText='Example: nmea1data'
        value={this.props.value.sentenceEvent}
        onChange={this.props.onChange}
      />
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
        <Col xs='12' md='4'>
          <Input
            type='select'
            value={this.props.value.options.dataType}
            name='options.dataType'
            onChange={event => this.props.onChange(event)}
          >
            {!this.props.value.options.dataType && (<option value=''>Select data type</option>)}
            <option value='SignalK'>Signal K</option>
            <option value='NMEA2000JS'>Actisense NMEA 2000 (canboatjs)</option>
            <option value='NMEA2000IK'>iKonvert NMEA 2000 (canboatjs)</option>
            <option value='NMEA2000YD'>Yacht Devices YDGW-02 NMEA 2000 (canboatjs)</option>
            <option value='NMEA2000' disabled={!this.props.hasAnalyzer}>NMEA 2000 (canboat)</option>
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

class BaudRateIntputCanboat extends Component {
  constructor (props) {
    super(props)
    this.props.value.baudrate = this.props.value.baudrate || (this.props.value.type === 'ikonvert-canboatjs' ? 230400 : 115200)
  }
	
  render () {
    return (
      <TextInput
        title='Baud Rate'
        name='options.baudrate'
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

class Suppress0183Checkbox extends Component {
  constructor (props) {
    super(props)
    this.props.value.suppress0183event =
      typeof this.props.value.suppress0183event === 'undefined' ||
      this.props.value.suppress0183event
  }
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='2'>
          <Label>Suppress nmea0183 event</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.suppress0183event'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.suppress0183event}
            />
            <span className='switch-label' data-on='Yes' data-off='No' />
            <span className='switch-handle' />
          </Label>
        </Col>
      </FormGroup>
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
            <option value='ngt-1-canboatjs'>Actisense NGT-1 (canboatjs)</option>
            <option value='ngt-1' disabled={!props.hasAnalyzer}>Actisense NGT-1 (canboat)</option>
            <option value='ikonvert-canboatjs'>iKonvert (canboatjs)</option>
            <option value='ydwg02-canboatjs'>Yacht Devices YDWG-02 TCP (canboatjs)</option>
            <option value='ydwg02-udp-canboatjs'>Yacht Devices YDWG-02 UDP (canboatjs)</option>
            <option value='canbus-canboatjs'>Canbus (canboatjs)</option>
            <option value='canbus' disabled={!props.hasAnalyzer}>Canbus (canboat)</option>
          </Input>
        </Col>
      </FormGroup>
      {(props.value.options.type === 'ngt-1' ||
        props.value.options.type === 'ngt-1-canboatjs' ||
        props.value.options.type === 'ikonvert-canboatjs') && (
         <div>
             <DeviceInput value={props.value.options} onChange={props.onChange} />
             <BaudRateIntputCanboat value={props.value.options} onChange={props.onChange} />
         </div>
        )}
      {(props.value.options.type === 'ydwg02-canboatjs') && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
        </div>
      )}
      {(props.value.options.type === 'ydwg02-udp-canboatjs') && (
        <div>
          <PortInput value={props.value.options} onChange={props.onChange} />
        </div>
      )}
      {(props.value.options.type === 'canbus' ||
        props.value.options.type === 'canbus-canboatjs') && (
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
            <option value='tcp'>TCP Client</option>
            <option value='tcpserver'>TCP Server</option>
            <option value='udp'>UDP</option>
          </Input>
        </Col>
        {props.value.options.type === 'tcpserver' && (
          <Col xs='12' md='6'>
            Make this server's NMEA 10110 server bidirectional so that input
            from clients is converted to Signal K.
          </Col>
        )}
      </FormGroup>
      {serialParams(props)}
      {props.value.options.type === 'tcp' && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
        </div>
      )}
      {props.value.options.type === 'tcpserver' && (
        <div>
          <Suppress0183Checkbox
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      {props.value.options.type === 'udp' && (
        <PortInput value={props.value.options} onChange={props.onChange} />
      )}
      <SentenceEventInput
        value={props.value.options}
        onChange={props.onChange}
      />
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
            <option value='serial'>Serial</option>
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
      {serialParams(props)}
    </div>
  )
}

const FileStream = props => {
  return (
    <div>
      <DataTypeInput hasAnalyzer={props.hasAnalyzer} value={props.value} onChange={props.onChange} />
      <TextInput
        title='File Name'
        name='options.filename'
        value={props.value.options.filename}
        onChange={props.onChange}
      />
    </div>
  )
}

const serialParams = props => (props.value.options.type === 'serial' && (
  <div>
    <DeviceInput value={props.value.options} onChange={props.onChange} />
    <BaudRateIntput
      value={props.value.options}
      onChange={props.onChange}
    />
  </div>
))
