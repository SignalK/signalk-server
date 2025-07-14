import React, { Component } from 'react'
import { Input, FormGroup, FormText, Col, Label } from 'reactstrap'
import N2KFilters from './N2KFilters'

class BasicProvider extends Component {
  constructor() {
    super()
    this.state = {
      hasAnalyzer: false
    }
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/hasAnalyzer`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((value) => {
        this.setState({ hasAnalyzer: value })
      })
  }

  render() {
    const lookup = {
      NMEA2000: NMEA2000,
      NMEA0183: NMEA0183,
      SignalK: SignalK,
      Seatalk: Seatalk,
      FileStream: FileStream
    }
    let TypeComponent = lookup[this.props.value.type] || (() => null)

    return (
      <div>
        <FormGroup row>
          <Col xs="3" md="3">
            <Label htmlFor="select">Data Type</Label>
          </Col>
          <Col xs="6" md="3">
            {this.props.value.isNew ? (
              <Input
                type="select"
                value={this.props.value.type}
                name="type"
                onChange={(event) => this.props.onChange(event)}
              >
                <option value="NMEA2000">NMEA 2000</option>
                <option value="NMEA0183">NMEA 0183</option>
                <option value="SignalK">Signal K</option>
                <option value="Seatalk">Seatalk (GPIO)</option>
                <option value="FileStream">File Stream</option>
              </Input>
            ) : (
              this.props.value.type
            )}
          </Col>
        </FormGroup>
        <FormGroup row>
          <Col xs="3" md="3">
            <Label>Enabled</Label>
          </Col>
          <Col xs="2" md="3">
            <Label className="switch switch-text switch-primary">
              <Input
                type="checkbox"
                name="enabled"
                className="switch-input"
                onChange={(event) => this.props.onChange(event)}
                checked={this.props.value.enabled}
              />
              <span className="switch-label" data-on="Yes" data-off="No" />
              <span className="switch-handle" />
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
          <Col md="3">
            <Label htmlFor="id">ID</Label>
          </Col>
          <Col xs="12" md="3">
            <Input
              type="text"
              name="id"
              value={this.props.value.id}
              disabled={!this.props.value.isNew}
              onChange={(event) => {
                const dummyEvent = {
                  target: {
                    name: event.target.name,
                    type: event.target.type,
                    value: (event.target.value || '').replace(
                      /[^a-zA-Z\d-_]/g,
                      ''
                    )
                  }
                }
                this.props.onChange(dummyEvent)
              }}
            />
          </Col>
        </FormGroup>
        <TypeComponent
          value={this.props.value}
          onChange={this.props.onChange}
          hasAnalyzer={this.state.hasAnalyzer}
        />
        <OverrideTimestamps
          value={this.props.value.options}
          onChange={this.props.onChange}
        />

        {this.props.value.type === 'NMEA2000' && (
          <N2KFilters
            value={this.props.value}
            onChange={this.props.onPropChange}
          />
        )}
      </div>
    )
  }
}

export default BasicProvider

class TextInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col md="3">
          <Label htmlFor={this.props.name}>{this.props.title}</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="text"
            name={this.props.name}
            value={this.props.value}
            onChange={(event) => this.props.onChange(event)}
          />
          {this.props.helpText && (
            <FormText color="muted">{this.props.helpText}</FormText>
          )}
        </Col>
      </FormGroup>
    )
  }
}

class TextAreaInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col md="3">
          <Label htmlFor={this.props.name}>{this.props.title}</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="textarea"
            name={this.props.name}
            value={this.props.value}
            rows={this.props.rows}
            onChange={(event) => this.props.onChange(event)}
          />
          {this.props.helpText && (
            <FormText color="muted">{this.props.helpText}</FormText>
          )}
        </Col>
      </FormGroup>
    )
  }
}

class DeviceInput extends Component {
  constructor() {
    super()
    this.state = {
      devices: {}
    }
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/serialports`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        data.serialports = data.serialports.map((portInfo) => portInfo.path)
        this.setState({
          devices: data
        })
      })
  }

  render() {
    const isManualEntry = !isListedDevice(
      this.props.value.device,
      this.state.devices
    )
    let manualEntryValue = isManualEntry
      ? this.props.value.device === 'Enter manually'
        ? ''
        : this.props.value.device
      : ''
    return (
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="serialportselect">Serial port</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            name="options.device"
            id="serialportselect"
            onChange={this.props.onChange}
            helpText="help me"
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
        <Col xs="12" md="3">
          <Input
            type="text"
            name="options.device"
            disabled={!isManualEntry}
            value={manualEntryValue || ''}
            onChange={(event) => this.props.onChange(event)}
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
      acc.push(
        <option disabled="true" key={key}>
          {labels[j]}
        </option>
      )
      deviceListMap[key].forEach((device, i) => {
        acc.push(<option key={`${key}${i}`}>{device}</option>)
      })
    }
    return acc
  }, [])
}

class LoggingInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Data Logging</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="logging"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={this.props.value.logging}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class ValidateChecksumInput extends Component {
  constructor(props) {
    super(props)
    this.props.value.validateChecksum =
      typeof this.props.value.validateChecksum === 'undefined' ||
      this.props.value.validateChecksum
  }
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Validate Checksum</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.validateChecksum"
              className="switch-input"
              onChange={(event) => {
                this.props.onChange(event)
                if (this.props.value.validateChecksum) {
                  this.props.value.appendChecksum = false
                }
              }}
              checked={this.props.value.validateChecksum}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class OverrideTimestamps extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Override timestamps</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.overrideTimestamp"
              className="switch-input"
              onChange={this.props.onChange}
              checked={this.props.value.overrideTimestamp}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class RemoveNullsInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Remove NULL characters</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.removeNulls"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={this.props.value.removeNulls}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
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
        <Col xs="3" md="3">
          <Label>Append Checksum</Label>
        </Col>
        <Col xs="2" md="1">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.appendChecksum"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={
                this.props.value.appendChecksum &&
                !this.props.value.validateChecksum
              }
              disabled={!!this.props.value.validateChecksum}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
        <Col xs="12" md="6">
          {this.props.value.validateChecksum && (
            <label className="text-muted small">
              Turn Validate Checksum OFF to enable appending the checksum
            </label>
          )}
        </Col>
      </FormGroup>
    )
  }
}

class SentenceEventInput extends Component {
  render() {
    return (
      <TextInput
        title="Input Event"
        name="options.sentenceEvent"
        helpText="Additional event name for incoming sentences. Example: nmea1data"
        value={this.props.value.sentenceEvent}
        onChange={this.props.onChange}
      />
    )
  }
}

class DataTypeInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="dataType">Data Type</Label>
        </Col>
        <Col xs="12" md="4">
          <Input
            type="select"
            value={this.props.value.options.dataType}
            name="options.dataType"
            onChange={(event) => this.props.onChange(event)}
          >
            {!this.props.value.options.dataType && (
              <option value="">Select data type</option>
            )}
            <option value="SignalK">Signal K</option>
            <option value="NMEA2000JS">Actisense NMEA 2000 (canboatjs)</option>
            <option value="NMEA2000IK">iKonvert NMEA 2000 (canboatjs)</option>
            <option value="NMEA2000YD">
              Yacht Devices YDGW-02 NMEA 2000 (canboatjs)
            </option>
            <option value="NMEA2000" disabled={!this.props.hasAnalyzer}>
              NMEA 2000 (canboat)
            </option>
            <option value="NMEA0183">NMEA 0183</option>
            {this.props.value.type === 'FileStream' && (
              <option value="Multiplexed">Multiplexed Log</option>
            )}
          </Input>
        </Col>
      </FormGroup>
    )
  }
}

class BaudRateIntput extends Component {
  render() {
    return (
      <TextInput
        title="Baud Rate"
        name="options.baudrate"
        helpText="Example: 4800"
        value={this.props.value.baudrate}
        onChange={(event) => this.props.onChange(event, 'number')}
      />
    )
  }
}

class BaudRateIntputCanboat extends Component {
  constructor(props) {
    super(props)
    this.props.value.baudrate =
      this.props.value.baudrate ||
      (this.props.value.type === 'ikonvert-canboatjs' ? 230400 : 115200)
  }

  render() {
    return (
      <TextInput
        title="Baud Rate"
        name="options.baudrate"
        value={this.props.value.baudrate}
        onChange={(event) => this.props.onChange(event, 'number')}
      />
    )
  }
}

class StdOutInput extends Component {
  constructor(props) {
    super()
    this.state = StdOutInput.getDerivedStateFromProps(props)
    this.onChange = this.onChange.bind(this)
  }

  static getDerivedStateFromProps(props) {
    let value = props.value.toStdout
    if (Array.isArray(value)) {
      value = value.join(',')
    }
    return { value }
  }
  onChange(e) {
    this.setState({ value: e.target.value })
    this.props.onChange({
      target: {
        type: e.target.type,
        name: e.target.name,
        value: e.target.value.split(',')
      }
    })
  }
  render() {
    return (
      <TextInput
        title="Output Events"
        name="options.toStdout"
        helpText="Events that should be written as output to this connection. Example: nmea0183,nmea0183out"
        value={this.state.value}
        onChange={this.onChange}
      />
    )
  }
}

class IgnoredSentences extends Component {
  constructor(props) {
    super()
    this.onChange = this.onChange.bind(this)
    this.state = IgnoredSentences.getDerivedStateFromProps(props)
  }

  static getDerivedStateFromProps(props) {
    let value = props.value.ignoredSentences
    if (Array.isArray(value)) {
      value = value.join(',')
    }
    return { value }
  }

  onChange(e) {
    this.setState({ value: e.target.value })
    this.props.onChange({
      target: {
        type: e.target.type,
        name: e.target.name,
        value: e.target.value.split(',')
      }
    })
  }
  render() {
    return (
      <TextInput
        title="Ignored Sentences"
        name="options.ignoredSentences"
        helpText="NMEA0183 sentences to throw away from the input data. Example: RMC,ROT"
        value={this.state.value}
        onChange={this.onChange}
      />
    )
  }
}

class PortInput extends Component {
  render() {
    return (
      <TextInput
        title="Port"
        name="options.port"
        helpText="Example: 4123"
        value={this.props.value.port}
        onChange={this.props.onChange}
      />
    )
  }
}

class HostInput extends Component {
  render() {
    return (
      <TextInput
        title="Host"
        name="options.host"
        helpText="Example: localhost"
        value={this.props.value.host}
        onChange={this.props.onChange}
      />
    )
  }
}

class NoDataReceivedTimeoutInput extends Component {
  render() {
    return (
      <TextInput
        title="No data timeout"
        name="options.noDataReceivedTimeout"
        helpText="Timeout for no data received in seconds. Socket is disconnected and reconnection attempted if timeout is reached. Leave empty or 0 to disable."
        value={this.props.value.noDataReceivedTimeout}
        onChange={this.props.onChange}
      />
    )
  }
}

class RemoteSelfInput extends Component {
  render() {
    return (
      <TextInput
        title="Remote 'self' to use"
        name="options.remoteSelf"
        helpText="like vessels.urn:mrn:signalk:uuid:f6d9f041-4e61-4335-82c0-7a51fb10ae86 OR vessels.urn:mrn:imo:mmsi:230099999"
        value={this.props.value.remoteSelf}
        onChange={this.props.onChange}
      />
    )
  }
}

class Suppress0183Checkbox extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Suppress nmea0183 event</Label>
        </Col>
        <Col xs="1" md="1">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.suppress0183event"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={this.props.value.suppress0183event}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
        <Col xs="12" md="6">
          <label className="text-muted small">
            Supress sending the default nmea0183 event for incoming sentences
          </label>
        </Col>
      </FormGroup>
    )
  }
}

class UseCanNameInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Use Can NAME in source data</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.useCanName"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={this.props.value.useCanName}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class CamelCaseCompatInput extends Component {
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>CamcelCase Compat (for legacy N2K plugins)</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.useCamelCompat"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={
                this.props.value.useCamelCompat !== undefined
                  ? this.props.value.useCamelCompat
                  : true
              }
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

class CollectNetworkStatsInput extends Component {
  constructor(props) {
    super(props)
  }
  render() {
    return (
      <FormGroup row>
        <Col xs="3" md="3">
          <Label>Collect Network Statistics</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="options.sendNetworkStats"
              className="switch-input"
              onChange={(event) => this.props.onChange(event)}
              checked={this.props.value.sendNetworkStats}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    )
  }
}

const NMEA2000 = (props) => {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">NMEA 2000 Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={props.value.options.type || 'none'}
            name="options.type"
            onChange={(event) => props.onChange(event)}
          >
            <option value="none">Select a source</option>
            <option value="ngt-1-canboatjs">Actisense NGT-1 (canboatjs)</option>
            <option value="ngt-1" disabled={!props.hasAnalyzer}>
              Actisense NGT-1 (canboat)
            </option>
            <option value="ikonvert-canboatjs">iKonvert (canboatjs)</option>
            <option value="navlink2-tcp-canboatjs">NavLink2 (canboatjs)</option>

            <option value="ydwg02-canboatjs">
              Yacht Devices RAW TCP (canboatjs)
            </option>
            <option value="ydwg02-udp-canboatjs">
              Yacht Devices RAW UDP (canboatjs)
            </option>
            <option value="ydwg02-usb-canboatjs">
              Yacht Devices RAW USB (canboatjs)
            </option>
            <option value="canbus-canboatjs">Canbus (canboatjs)</option>
            <option value="w2k-1-n2k-ascii-canboatjs">
              W2K-1 N2K ASCII (canboatjs)
            </option>
            <option value="w2k-1-n2k-actisense-canboatjs">
              W2K-1 N2K ACTISENSE (canboatjs)
            </option>
            <option value="canbus" disabled={!props.hasAnalyzer}>
              Canbus (canboat)
            </option>
          </Input>
        </Col>
      </FormGroup>
      {(props.value.options.type === 'ngt-1' ||
        props.value.options.type === 'ngt-1-canboatjs' ||
        props.value.options.type === 'ydwg02-usb-canboatjs' ||
        props.value.options.type === 'ikonvert-canboatjs') && (
        <div>
          <DeviceInput value={props.value.options} onChange={props.onChange} />
          <BaudRateIntputCanboat
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      {props.value.options.type === 'ydwg02-canboatjs' && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
          <NoDataReceivedTimeoutInput
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      {props.value.options.type === 'ydwg02-udp-canboatjs' && (
        <div>
          <PortInput value={props.value.options} onChange={props.onChange} />
        </div>
      )}
      {props.value.options.type === 'navlink2-tcp-canboatjs' && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
          <NoDataReceivedTimeoutInput
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      {(props.value.options.type === 'canbus' ||
        props.value.options.type === 'canbus-canboatjs') && (
        <div>
          <TextInput
            title="Interface"
            name="options.interface"
            helpText="Example: can0"
            value={props.value.options.interface}
            onChange={props.onChange}
          />
          <TextInput
            title="UniqueNumber"
            name="options.uniqueNumber"
            helpText="Example: any number from 1 to 2097151, will be equal to SerialNumber of a SignalK NMEA2000 device. Leave empty for random (default). Set a fixed value if you have problem with source identification on some B&G MFD's after SignalK restart."
            value={props.value.options.uniqueNumber}
            onChange={props.onChange}
          />
          <TextInput
            title="ManufacturerCode"
            name="options.mfgCode"
            helpText="Example: 999 - Unknown (default), 0 - Internal, or any other mabufacturer code to emulate. Leave empty for default 999.  Set to 0 if you have problem with source identification on some B&G MFD's after SignalK restart."
            value={props.value.options.mfgCode}
            onChange={props.onChange}
          />
        </div>
      )}
      {(props.value.options.type === 'ngt-1-canboatjs' ||
        props.value.options.type === 'ikonvert-canboatjs' ||
        props.value.options.type === 'navlink2-tcp-canboatjs') && (
        <CollectNetworkStatsInput
          value={props.value.options}
          onChange={props.onChange}
        />
      )}
      {(props.value.options.type === 'w2k-1-n2k-ascii-canboatjs' ||
        props.value.options.type === 'w2k-1-n2k-actisense-canboatjs') && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
          <NoDataReceivedTimeoutInput
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      <UseCanNameInput value={props.value.options} onChange={props.onChange} />
      {props.value.options.type.indexOf('canboatjs') != -1 && (
        <CamelCaseCompatInput
          value={props.value.options}
          onChange={props.onChange}
        />
      )}
    </div>
  )
}

const NMEA0183 = (props) => {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">NMEA 0183 Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={props.value.options.type}
            name="options.type"
            onChange={(event) => props.onChange(event)}
          >
            <option>Select a source</option>
            <option value="serial">Serial</option>
            <option value="tcp">TCP Client</option>
            <option value="tcpserver">TCP Server on port 10110</option>
            <option value="udp">UDP</option>
            <option value="gpsd">GPSD</option>
          </Input>
        </Col>
        {props.value.options.type === 'serial' && (
          <Col xs="12" md="6">
            Serial ports are bidirectional. Input from the connection is parsed
            as NMEA0183. Configure Output Events below to connect server&apos;s
            NMEA0183 data for output.
          </Col>
        )}
        {props.value.options.type === 'tcpserver' && (
          <Col xs="12" md="6">
            Accept input from clients connected to the default TCP/10110
            NMEA0183 server
          </Col>
        )}
      </FormGroup>
      {serialParams(props)}
      {(props.value.options.type === 'tcp' ||
        props.value.options.type === 'gpsd') && (
        <div>
          <HostInput value={props.value.options} onChange={props.onChange} />
          <PortInput value={props.value.options} onChange={props.onChange} />
          <StdOutInput value={props.value.options} onChange={props.onChange} />
          <NoDataReceivedTimeoutInput
            value={props.value.options}
            onChange={props.onChange}
          />
        </div>
      )}
      <div>
        <Suppress0183Checkbox
          value={props.value.options}
          onChange={props.onChange}
        />
      </div>
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
      <AppendChecksum value={props.value.options} onChange={props.onChange} />
      <RemoveNullsInput value={props.value.options} onChange={props.onChange} />
      <IgnoredSentences value={props.value.options} onChange={props.onChange} />
    </div>
  )
}

const SignalK = (props) => {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">SignalK Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={props.value.options.type}
            name="options.type"
            onChange={(event) => props.onChange(event)}
            disabled={props.value.options.useDiscovery}
            helpText="afoo"
          >
            <option>Select a source</option>
            <option value="serial">Serial</option>
            <option value="ws">WebSocket</option>
            <option value="wss">WebSocket SSL</option>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </Input>
        </Col>
      </FormGroup>
      {props.value.options.useDiscovery && (
        <p className="text-danger">
          This connection is deprecated, please delete it and recreate it with
          the connection automatically discovered at the top of the page.
        </p>
      )}
      {!props.value.options.useDiscovery &&
        (props.value.options.type === 'ws' ||
          props.value.options.type === 'wss' ||
          props.value.options.type === 'tcp') && (
          <div>
            <HostInput value={props.value.options} onChange={props.onChange} />
            <PortInput value={props.value.options} onChange={props.onChange} />
            {props.value.options.type === 'wss' && (
              <FormGroup row>
                <Col xs="0" md="3">
                  <Label>Allow self signed certificates</Label>
                </Col>
                <Col xs="12" md="8">
                  <div key={name}>
                    <Label className="switch switch-text switch-primary">
                      <Input
                        type="checkbox"
                        id="options.selfsignedcert"
                        name="options.selfsignedcert"
                        className="switch-input"
                        onChange={props.onChange}
                        checked={props.value.options.selfsignedcert}
                        disabled={!(props.value.options.type === 'wss')}
                      />
                      <span
                        className="switch-label"
                        data-on="On"
                        data-off="Off"
                      />
                      <span className="switch-handle" />
                    </Label>
                  </div>
                </Col>
              </FormGroup>
            )}
            {(props.value.options.type === 'ws' ||
              props.value.options.type === 'wss') && (
              <div>
                <TextAreaInput
                  title="Subscription"
                  name="options.subscription"
                  rows="6"
                  value={props.value.options.subscription}
                  onChange={(event) => props.onChange(event, 'jsonstring')}
                  helpText="Defaults to all. This can be an array of subscriptions."
                />
              </div>
            )}
          </div>
        )}
      {props.value.options.type === 'udp' && (
        <PortInput value={props.value.options} onChange={props.onChange} />
      )}
      {serialParams(props)}
      {!props.value.options.useDiscovery && (
        <FormGroup row>
          <Col md="3">
            <Label htmlFor="options.type">&apos;self&apos; handling</Label>
          </Col>
          <Col xs="12" md="3">
            <Input
              type="select"
              value={props.value.options.selfHandling || 'noSelf'}
              name="options.selfHandling"
              onChange={(event) => props.onChange(event)}
            >
              <option value="useRemoteSelf">
                Map remote &apos;self&apos; to local &apos;self&apos;
              </option>
              <option value="manualSelf">Manual mapping</option>
              <option value="noSelf">No &apos;self&apos; mapping</option>
            </Input>
          </Col>
        </FormGroup>
      )}
      {!props.value.options.useDiscovery &&
        props.value.options.selfHandling === 'manualSelf' && (
          <RemoteSelfInput
            value={props.value.options}
            onChange={props.onChange}
          />
        )}
    </div>
  )
}

const gpios = [
  4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27
].map((gpio) => `0${gpio}`.slice(-2))
const Seatalk = (props) => (
  <span>
    <FormGroup row>
      <Col md="3">
        <Label htmlFor="options.type">GPIO Library</Label>
      </Col>
      <Col xs="12" md="3">
        <Input
          type="select"
          value={props.value.options.type || 'none'}
          name="options.type"
          onChange={(event) => props.onChange(event)}
        >
          <option value="none">Select a library</option>
          <option value="gpiod">gpiod</option>
          <option value="pigpio">pigpio (legacy)</option>
        </Input>
      </Col>
    </FormGroup>
    <FormGroup row>
      <Col md="3">
        <Label htmlFor="gpio">GPIO Pin</Label>
      </Col>
      <Col xs="12" md="3">
        <Input
          type="select"
          name="options.gpio"
          id="gpio"
          onChange={props.onChange}
          value={props.value.options.gpio || gpios[0]}
        >
          {gpios.map((gpio) => (
            <option key={gpio}>{`GPIO${gpio}`}</option>
          ))}
        </Input>
      </Col>
    </FormGroup>
    <FormGroup row>
      <Col md="3">
        <Label htmlFor="gpioInvert">Invert signal</Label>
      </Col>
      <Col xs="12" md="10">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="gpioInvert"
            name="options.gpioInvert"
            className="switch-input"
            onChange={props.onChange}
            checked={props.value.options.gpioInvert}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  </span>
)

const FileStream = (props) => {
  return (
    <div>
      <DataTypeInput
        hasAnalyzer={props.hasAnalyzer}
        value={props.value}
        onChange={props.onChange}
      />
      <TextInput
        title="File Name"
        name="options.filename"
        value={props.value.options.filename}
        onChange={props.onChange}
      />
    </div>
  )
}

const serialParams = (props) =>
  props.value.options.type === 'serial' && (
    <div>
      <DeviceInput value={props.value.options} onChange={props.onChange} />
      <BaudRateIntput value={props.value.options} onChange={props.onChange} />
      <StdOutInput value={props.value.options} onChange={props.onChange} />
    </div>
  )
