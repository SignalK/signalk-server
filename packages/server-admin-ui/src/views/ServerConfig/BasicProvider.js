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
          <Col xs='3' md='3'>
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
          <Col xs='3' md='3'>
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
          <Col md='3'>
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
        <Col md='3'>
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

class TextAreaInput extends Component {
  render () {
    return (
      <FormGroup row>
        <Col md='3'>
          <Label htmlFor={this.props.name}>{this.props.title}</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='textarea'
            name={this.props.name}
            value={this.props.value}
            rows={this.props.rows}
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
      devices: {}
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
    const isManualEntry = !isListedDevice(this.props.value.device, this.state.devices)
    let manualEntryValue = isManualEntry
      ? this.props.value.device === 'Enter manually'
        ? ''
        : this.props.value.device
      : ''
    return (
      <FormGroup row>
        <Col md='3'>
          <Label htmlFor="serialportselect">Serial port</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type="select"
            name="options.device"
            id="serialportselect"
            onChange={this.props.onChange}
            value={isManualEntry ? 'Enter manually' : this.props.value.device}
          >
            <option key="enterManually">Enter manually</option>
            {serialportListOptions(
              ['byOpenPlotter', 'byId', 'byPath', 'serialports'],
              ['OpenPlotter managed:', 'by-id:', 'by-path:', 'Listed:'],
              this.state.devices
            )}
          </Input>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type="text"
            name="options.device"
            disabled={!isManualEntry}
            value={manualEntryValue || ''}
            onChange={event => this.props.onChange(event)}
          />
        </Col>
      </FormGroup>
    )
  }
}

const isListedDevice = (device, deviceListMap) => {
  const list = Object.keys(deviceListMap).reduce((acc, key) => {
    return acc.concat(deviceListMap[key])
  }, [])
  return list.includes(device)
}

const serialportListOptions = (keys, labels, deviceListMap) => {
  return keys.reduce((acc, key, j) => {
    if (deviceListMap[key] && deviceListMap[key].length > 0) {
      acc.push(<option disabled="true" key={key}>{labels[j]}</option>)
      deviceListMap[key].forEach((device, i) => {
        acc.push(<option key={`${key}${i}`}>{device}</option>)
      })
    }
    return acc
  },[])
}

class LoggingInput extends Component {
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='3'>
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
        <Col xs='3' md='3'>
          <Label>Validate Checksum</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.validateChecksum'
              className='switch-input'
              onChange={event => {
                this.props.onChange(event)
                if (this.props.value.validateChecksum) {
                  this.props.value.appendChecksum = false;
                }
              }
              }
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

class RemoveNullsInput extends Component {
  constructor (props) {
    super(props)
    this.props.value.removeNulls =
      this.props.value.removeNulls
  }
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='3'>
          <Label>Remove NULL characters</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.removeNulls'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.removeNulls}
            />
            <span className='switch-label' data-on='Yes' data-off='No' />
            <span className='switch-handle' />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class AppendChecksum extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs='3' md='3'>
          <Label>Append Checksum</Label>
        </Col>
        <Col xs='2' md='1'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.appendChecksum'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.appendChecksum && !this.props.value.validateChecksum}
              disabled={!!this.props.value.validateChecksum}
            />
            <span className='switch-label' data-on='Yes' data-off='No' />
            <span className='switch-handle' />
          </Label>
        </Col>
        <Col xs='12' md='6'>
          {this.props.value.validateChecksum && (
           <label className='text-muted small'>Turn Validate Checksum OFF to enable appending the checksum</label>
          )}
        </Col>
      </FormGroup>
    )
  }
}

class SentenceEventInput extends Component {
  render () {
    return (
      <TextInput
        title='Sentence Event'
        name='options.sentenceEvent'
        helpText='Event name for incoming sentences. Example: nmea1data'
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
        <Col md='3'>
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

class StdOutInput extends Component {
  constructor(props) {
    super();
    let value = props.value.toStdout;
    if(Array.isArray(value)) {
      value = value.join(',');
    }
    this.state = {value}
    this.onChange = this.onChange.bind(this);
  }
  onChange(e) {
    this.setState({value: e.target.value});
    this.props.onChange({
      target: {
        type: e.target.type,
        name: e.target.name,
        value: e.target.value.split(','),
      }
    });
  }
  render () {
    return (
      <TextInput
        title='Output Events'
        name='options.toStdout'
        helpText='Events that should be written as output to this connection. Example: nmea0183,nmea0183out'
        value={this.state.value}
        onChange={this.onChange}
      />
    )
  }
}

class IgnoredSentences extends Component {
  constructor(props) {
    super();
    let value = props.value.ignoredSentences;
    if(Array.isArray(value)) {
      value = value.join(',');
    }
    this.state = {value}
    this.onChange = this.onChange.bind(this);
  }
  onChange(e) {
    this.setState({value: e.target.value});
    this.props.onChange({
      target: {
        type: e.target.type,
        name: e.target.name,
        value: e.target.value.split(','),
      }
    });
  }
  render () {
    return (
      <TextInput
        title='Ignored Sentences'
        name='options.ignoredSentences'
        helpText='NMEA0183 sentences to throw away from the input data. Example: RMC,ROT'
        value={this.state.value}
        onChange={this.onChange}
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

class RemoteSelfInput extends Component {
  render () {
    return (
      <TextInput
        title="Remote 'self' to use"
        name='options.remoteSelf'
        helpText='like vessels.urn:mrn:signalk:uuid:f6d9f041-4e61-4335-82c0-7a51fb10ae86 OR vessels.urn:mrn:imo:mmsi:230099999'
        value={this.props.value.remoteSelf}
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
        <Col xs='3' md='3'>
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

class UseCanNameInput extends Component {
  constructor (props) {
    super(props)
    /*
    this.props.value.useCanName =
      (typeof this.props.value.useCanName !== 'undefined' &&
       this.props.value.useCanName) || this.props.value.isNew
    */
  }
  render () {
    return (
      <FormGroup row>
        <Col xs='3' md='3'>
          <Label>Use Can NAME in source data</Label>
        </Col>
        <Col xs='2' md='3'>
          <Label className='switch switch-text switch-primary'>
            <Input
              type='checkbox'
              name='options.useCanName'
              className='switch-input'
              onChange={event => this.props.onChange(event)}
              checked={this.props.value.useCanName}
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
        <Col md='3'>
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
            <option value='navlink2-tcp-canboatjs'>NavLink2 (canboatjs)</option>

            <option value='ydwg02-canboatjs'>Yacht Devices RAW TCP (canboatjs)</option>
            <option value='ydwg02-udp-canboatjs'>Yacht Devices RAW UDP (canboatjs)</option>
            <option value='ydwg02-usb-canboatjs'>Yacht Devices RAW USB (canboatjs)</option>
            <option value='canbus-canboatjs'>Canbus (canboatjs)</option>
            <option value='canbus' disabled={!props.hasAnalyzer}>Canbus (canboat)</option>
          </Input>
        </Col>
      </FormGroup>
      {(props.value.options.type === 'ngt-1' ||
        props.value.options.type === 'ngt-1-canboatjs' ||
        props.value.options.type === 'ydwg02-usb-canboatjs' ||
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
      {(props.value.options.type === 'navlink2-tcp-canboatjs') && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
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
      <UseCanNameInput
        value={props.value.options}
        onChange={props.onChange}
      />
    </div>
  )
}

const NMEA0183 = props => {
  return (
    <div>
      <FormGroup row>
        <Col md='3'>
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
            <option value='gpsd'>GPSD</option>
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
      {(props.value.options.type === 'tcp' || props.value.options.type === 'gpsd') && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
          <StdOutInput value={props.value.options} onChange={props.onChange} />
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
        <AppendChecksum
          value={props.value.options}
          onChange={props.onChange}
        />
      <RemoveNullsInput
        value={props.value.options}
        onChange={props.onChange}
      />
      <IgnoredSentences
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
        <Col md='3'>
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
              <Col xs='0' md='3'>
              <Label htmlFor='options.useDiscovery'>Discovery</Label>
              </Col>
              <Col xs='12' md='8'>
                <div key={name}>
                  <Label className='switch switch-text switch-primary'>
                    <Input
                      type='checkbox'
                      id='options.useDiscovery'
                      name='options.useDiscovery'
                      className='switch-input'
                      onChange={props.onChange}
                      checked={props.value.options.useDiscovery}
                    />
                    <span
                      className='switch-label'
                      data-on='On'
                      data-off='Off'
                    />
                    <span className='switch-handle' />
                  </Label>
                  Discover Signal K servers automatically
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
          {(props.value.options.type === 'ws' ||
            props.value.options.type === 'wss') && (
            <div>
             <TextAreaInput
               title='Subscription'
               name='options.subscription'
               rows='6'
               value={props.value.options.subscription}
               onChange={event => props.onChange(event, 'jsonstring')}
               helpText='Defaults to all. This can be an array of subscriptions.'
             />
            </div>
          )}
        </div>
      )}
      {props.value.options.type === 'udp' && (
        <PortInput value={props.value.options} onChange={props.onChange} />
      )}
      {serialParams(props)}
      <FormGroup row>
        <Col md='3'>
          <Label htmlFor='options.type'>'self' handling</Label>
        </Col>
        <Col xs='12' md='3'>
          <Input
            type='select'
            value={props.value.options.selfHandling || 'noSelf'}
            name='options.selfHandling'
            onChange={event => props.onChange(event)}
          >
            <option value='useRemoteSelf'>Map remote 'self' to local 'self'</option>
            <option value='manualSelf'>Manual mapping</option>
            <option value='noSelf'>No 'self' mapping</option>
          </Input>
        </Col>
      </FormGroup>
      {props.value.options.selfHandling === 'manualSelf' && (
        <RemoteSelfInput value={props.value.options} onChange={props.onChange} />
      )}
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
    <StdOutInput
      value={props.value.options}
      onChange={props.onChange}
    />
  </div>
))
