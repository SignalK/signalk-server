import { useState, useEffect, ChangeEvent, ReactNode } from 'react'
import { Input, FormGroup, FormText, Col, Label } from 'reactstrap'
import N2KFilters from './N2KFilters'

interface ProviderOptions {
  type?: string
  device?: string
  baudrate?: number
  port?: string
  host?: string
  interface?: string
  uniqueNumber?: string
  mfgCode?: string
  useCanName?: boolean
  useCamelCompat?: boolean
  sendNetworkStats?: boolean
  noDataReceivedTimeout?: string
  remoteSelf?: string
  selfHandling?: string
  subscription?: string
  selfsignedcert?: boolean
  useDiscovery?: boolean
  toStdout?: string | string[]
  ignoredSentences?: string | string[]
  sentenceEvent?: string
  validateChecksum?: boolean
  appendChecksum?: boolean
  overrideTimestamp?: boolean
  removeNulls?: boolean
  suppress0183event?: boolean
  dataType?: string
  filename?: string
  gpio?: string
  gpioInvert?: boolean
  filtersEnabled?: boolean
  filters?: Array<{ source: string; pgn: string }>
  [key: string]: unknown
}

interface ProviderValue {
  type: string
  id: string
  enabled: boolean
  logging?: boolean
  isNew?: boolean
  options: ProviderOptions
  [key: string]: unknown
}

interface DeviceListMap {
  byOpenPlotter?: string[]
  byId?: string[]
  byPath?: string[]
  serialports?: string[]
  [key: string]: string[] | undefined
}

type OnChangeHandler = (
  event:
    | ChangeEvent<HTMLInputElement>
    | { target: { name: string; value: unknown; type?: string } },
  valueType?: string
) => void
type OnPropChangeHandler = (
  event:
    | ChangeEvent<HTMLInputElement>
    | { target: { name: string; value: unknown; type?: string } }
) => void

interface BasicProviderProps {
  value: ProviderValue
  onChange: OnChangeHandler
  onPropChange: OnPropChangeHandler
}

interface TextInputProps {
  name: string
  title: string
  value: string | number | undefined
  helpText?: string
  onChange: OnChangeHandler
}

interface TextAreaInputProps {
  name: string
  title: string
  value: string | undefined
  rows?: number
  helpText?: string
  onChange: OnChangeHandler
}

interface DeviceInputProps {
  value: ProviderOptions
  onChange: OnChangeHandler
}

interface LoggingInputProps {
  value: ProviderValue
  onChange: OnChangeHandler
}

interface ValidateChecksumInputProps {
  value: ProviderOptions
  onChange: OnChangeHandler
}

interface OverrideTimestampsProps {
  value: ProviderOptions
  onChange: OnChangeHandler
}

interface TypeComponentProps {
  value: ProviderValue
  onChange: OnChangeHandler
  hasAnalyzer?: boolean
}

// Defined outside component to avoid recreation on render
const TYPE_COMPONENTS: Record<
  string,
  React.ComponentType<TypeComponentProps>
> = {
  NMEA2000: NMEA2000,
  NMEA0183: NMEA0183,
  SignalK: SignalK,
  Seatalk: Seatalk,
  FileStream: FileStream
}

export default function BasicProvider({
  value,
  onChange,
  onPropChange
}: BasicProviderProps) {
  const [hasAnalyzer, setHasAnalyzer] = useState(false)

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/hasAnalyzer`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        setHasAnalyzer(data)
      })
  }, [])

  const TypeComponent = TYPE_COMPONENTS[value.type]

  return (
    <div>
      <FormGroup row>
        <Col xs="3" md="3">
          <Label htmlFor="select">Data Type</Label>
        </Col>
        <Col xs="6" md="3">
          {value.isNew ? (
            <Input
              type="select"
              value={value.type}
              name="type"
              onChange={(event) => onChange(event)}
            >
              <option value="NMEA2000">NMEA 2000</option>
              <option value="NMEA0183">NMEA 0183</option>
              <option value="SignalK">Signal K</option>
              <option value="Seatalk">Seatalk (GPIO)</option>
              <option value="FileStream">File Stream</option>
            </Input>
          ) : (
            value.type
          )}
        </Col>
      </FormGroup>
      <FormGroup row>
        <Col xs="3" md="3">
          <Label htmlFor="provider-enabled">Enabled</Label>
        </Col>
        <Col xs="2" md="3">
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              id="provider-enabled"
              name="enabled"
              className="switch-input"
              onChange={(event) => onChange(event)}
              checked={value.enabled}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
      {value.type !== 'FileStream' && (
        <LoggingInput value={value} onChange={onChange} />
      )}
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="id">ID</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="text"
            name="id"
            value={value.id}
            disabled={!value.isNew}
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
              onChange(dummyEvent)
            }}
          />
        </Col>
      </FormGroup>
      {TypeComponent && (
        <TypeComponent
          value={value}
          onChange={onChange}
          hasAnalyzer={hasAnalyzer}
        />
      )}
      <OverrideTimestamps value={value.options} onChange={onChange} />

      {value.type === 'NMEA2000' && (
        <N2KFilters value={value} onChange={onPropChange} />
      )}
    </div>
  )
}

function TextInput({ name, title, value, helpText, onChange }: TextInputProps) {
  return (
    <FormGroup row>
      <Col md="3">
        <Label htmlFor={name}>{title}</Label>
      </Col>
      <Col xs="12" md="3">
        <Input
          type="text"
          name={name}
          value={value ?? ''}
          onChange={(event) => onChange(event)}
        />
        {helpText && <FormText color="muted">{helpText}</FormText>}
      </Col>
    </FormGroup>
  )
}

function TextAreaInput({
  name,
  title,
  value,
  rows,
  helpText,
  onChange
}: TextAreaInputProps) {
  return (
    <FormGroup row>
      <Col md="3">
        <Label htmlFor={name}>{title}</Label>
      </Col>
      <Col xs="12" md="3">
        <Input
          type="textarea"
          name={name}
          value={value ?? ''}
          rows={rows}
          onChange={(event) => onChange(event)}
        />
        {helpText && <FormText color="muted">{helpText}</FormText>}
      </Col>
    </FormGroup>
  )
}

function DeviceInput({ value, onChange }: DeviceInputProps) {
  const [devices, setDevices] = useState<DeviceListMap>({})

  useEffect(() => {
    fetch(`${window.serverRoutesPrefix}/serialports`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        data.serialports = data.serialports.map(
          (portInfo: { path: string }) => portInfo.path
        )
        setDevices(data)
      })
  }, [])

  const isManualEntry = !isListedDevice(value.device, devices)
  const manualEntryValue = isManualEntry
    ? value.device === 'Enter manually'
      ? ''
      : value.device
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
          onChange={onChange}
          value={isManualEntry ? 'Enter manually' : value.device}
        >
          <option key="enterManually">Enter manually</option>
          {serialportListOptions(
            ['byOpenPlotter', 'byId', 'byPath', 'serialports'],
            ['OpenPlotter managed:', 'by-id:', 'by-path:', 'Listed:'],
            devices
          )}
        </Input>
      </Col>
      <Col xs="12" md="3">
        <Input
          type="text"
          name="options.device"
          disabled={!isManualEntry}
          value={manualEntryValue || ''}
          onChange={(event) => onChange(event)}
        />
      </Col>
    </FormGroup>
  )
}

const isListedDevice = (
  device: string | undefined,
  deviceListMap: DeviceListMap
): boolean => {
  const list = Object.keys(deviceListMap).reduce<string[]>((acc, key) => {
    return acc.concat(deviceListMap[key] || [])
  }, [])
  return list.includes(device || '')
}

const serialportListOptions = (
  keys: string[],
  labels: string[],
  deviceListMap: DeviceListMap
): ReactNode[] => {
  return keys.reduce<ReactNode[]>((acc, key, j) => {
    const devices = deviceListMap[key]
    if (devices && devices.length > 0) {
      acc.push(
        <option disabled key={key}>
          {labels[j]}
        </option>
      )
      devices.forEach((device) => {
        acc.push(<option key={`${key}-${device}`}>{device}</option>)
      })
    }
    return acc
  }, [])
}

function LoggingInput({ value, onChange }: LoggingInputProps) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-logging">Data Logging</Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-logging"
            name="logging"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.logging}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function ValidateChecksumInput({
  value,
  onChange
}: ValidateChecksumInputProps) {
  // Default to true if undefined - controlled with fallback
  const isValidateChecksumEnabled = value.validateChecksum ?? true

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValidateChecksum = event.target.checked
    onChange(event)

    // When enabling validateChecksum, disable appendChecksum
    // (they are mutually exclusive - can't append checksum if validating it)
    if (newValidateChecksum && value.appendChecksum) {
      onChange({
        target: {
          name: 'options.appendChecksum',
          value: false,
          type: 'checkbox'
        }
      })
    }
  }

  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-validateChecksum">Validate Checksum</Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-validateChecksum"
            name="options.validateChecksum"
            className="switch-input"
            onChange={handleChange}
            checked={isValidateChecksumEnabled}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function OverrideTimestamps({ value, onChange }: OverrideTimestampsProps) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-overrideTimestamp">Override timestamps</Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-overrideTimestamp"
            name="options.overrideTimestamp"
            className="switch-input"
            onChange={onChange}
            checked={value.overrideTimestamp}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function RemoveNullsInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-removeNulls">Remove NULL characters</Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-removeNulls"
            name="options.removeNulls"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.removeNulls}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function AppendChecksum({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  // validateChecksum defaults to true when undefined
  const isValidateChecksumEnabled = value.validateChecksum ?? true

  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-appendChecksum">Append Checksum</Label>
      </Col>
      <Col xs="2" md="1">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-appendChecksum"
            name="options.appendChecksum"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.appendChecksum && !isValidateChecksumEnabled}
            disabled={isValidateChecksumEnabled}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
      <Col xs="12" md="6">
        {isValidateChecksumEnabled && (
          <label className="text-muted small">
            Turn Validate Checksum OFF to enable appending the checksum
          </label>
        )}
      </Col>
    </FormGroup>
  )
}

function SentenceEventInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="Input Event"
      name="options.sentenceEvent"
      helpText="Additional event name for incoming sentences. Example: nmea1data"
      value={value.sentenceEvent}
      onChange={onChange}
    />
  )
}

function DataTypeInput({
  value,
  onChange,
  hasAnalyzer
}: {
  value: ProviderValue
  onChange: OnChangeHandler
  hasAnalyzer?: boolean
}) {
  return (
    <FormGroup row>
      <Col md="3">
        <Label htmlFor="dataType">Data Type</Label>
      </Col>
      <Col xs="12" md="4">
        <Input
          type="select"
          value={value.options.dataType}
          name="options.dataType"
          onChange={(event) => onChange(event)}
        >
          {!value.options.dataType && (
            <option value="">Select data type</option>
          )}
          <option value="SignalK">Signal K</option>
          <option value="NMEA2000JS">Actisense NMEA 2000 (canboatjs)</option>
          <option value="NMEA2000IK">iKonvert NMEA 2000 (canboatjs)</option>
          <option value="NMEA2000YD">
            Yacht Devices YDGW-02 NMEA 2000 (canboatjs)
          </option>
          <option value="NMEA2000" disabled={!hasAnalyzer}>
            NMEA 2000 (canboat)
          </option>
          <option value="NMEA0183">NMEA 0183</option>
          {value.type === 'FileStream' && (
            <option value="Multiplexed">Multiplexed Log</option>
          )}
        </Input>
      </Col>
    </FormGroup>
  )
}

function BaudRateInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="Baud Rate"
      name="options.baudrate"
      helpText="Example: 4800"
      value={value.baudrate}
      onChange={(event) => onChange(event, 'number')}
    />
  )
}

function BaudRateInputCanboat({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  // Default baud rate based on device type - controlled with fallback
  const defaultBaudrate = value.type === 'ikonvert-canboatjs' ? 230400 : 115200
  const displayBaudrate = value.baudrate ?? defaultBaudrate

  return (
    <TextInput
      title="Baud Rate"
      name="options.baudrate"
      value={displayBaudrate}
      onChange={(event) => onChange(event, 'number')}
    />
  )
}

function StdOutInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  let displayValue = value.toStdout
  if (Array.isArray(displayValue)) {
    displayValue = displayValue.join(',')
  }

  const handleChange: OnChangeHandler = (e) => {
    const target = e.target as { type?: string; name: string; value: unknown }
    onChange({
      target: {
        type: target.type,
        name: target.name,
        value: String(target.value).split(',')
      }
    })
  }

  return (
    <TextInput
      title="Output Events"
      name="options.toStdout"
      helpText="Events that should be written as output to this connection. Example: nmea0183,nmea0183out"
      value={displayValue as string}
      onChange={handleChange}
    />
  )
}

function IgnoredSentences({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  let displayValue = value.ignoredSentences
  if (Array.isArray(displayValue)) {
    displayValue = displayValue.join(',')
  }

  const handleChange: OnChangeHandler = (e) => {
    const target = e.target as { type?: string; name: string; value: unknown }
    onChange({
      target: {
        type: target.type,
        name: target.name,
        value: String(target.value).split(',')
      }
    })
  }

  return (
    <TextInput
      title="Ignored Sentences"
      name="options.ignoredSentences"
      helpText="NMEA0183 sentences to throw away from the input data. Example: RMC,ROT"
      value={displayValue as string}
      onChange={handleChange}
    />
  )
}

function PortInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="Port"
      name="options.port"
      helpText="Example: 4123"
      value={value.port}
      onChange={onChange}
    />
  )
}

function HostInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="Host"
      name="options.host"
      helpText="Example: localhost"
      value={value.host}
      onChange={onChange}
    />
  )
}

function NoDataReceivedTimeoutInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="No data timeout"
      name="options.noDataReceivedTimeout"
      helpText="Timeout for no data received in seconds. Socket is disconnected and reconnection attempted if timeout is reached. Leave empty or 0 to disable."
      value={value.noDataReceivedTimeout}
      onChange={onChange}
    />
  )
}

function RemoteSelfInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <TextInput
      title="Remote 'self' to use"
      name="options.remoteSelf"
      helpText="like vessels.urn:mrn:signalk:uuid:f6d9f041-4e61-4335-82c0-7a51fb10ae86 OR vessels.urn:mrn:imo:mmsi:230099999"
      value={value.remoteSelf}
      onChange={onChange}
    />
  )
}

function Suppress0183Checkbox({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-suppress0183event">
          Suppress nmea0183 event
        </Label>
      </Col>
      <Col xs="1" md="1">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-suppress0183event"
            name="options.suppress0183event"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.suppress0183event}
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

function UseCanNameInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-useCanName">Use Can NAME in source data</Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-useCanName"
            name="options.useCanName"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.useCanName}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function CamelCaseCompatInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-useCamelCompat">
          CamcelCase Compat (for legacy N2K plugins)
        </Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-useCamelCompat"
            name="options.useCamelCompat"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={
              value.useCamelCompat !== undefined ? value.useCamelCompat : true
            }
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function CollectNetworkStatsInput({
  value,
  onChange
}: {
  value: ProviderOptions
  onChange: OnChangeHandler
}) {
  return (
    <FormGroup row>
      <Col xs="3" md="3">
        <Label htmlFor="provider-sendNetworkStats">
          Collect Network Statistics
        </Label>
      </Col>
      <Col xs="2" md="3">
        <Label className="switch switch-text switch-primary">
          <Input
            type="checkbox"
            id="provider-sendNetworkStats"
            name="options.sendNetworkStats"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.sendNetworkStats}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Label>
      </Col>
    </FormGroup>
  )
}

function NMEA2000({ value, onChange, hasAnalyzer }: TypeComponentProps) {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">NMEA 2000 Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={value.options.type || 'none'}
            name="options.type"
            onChange={(event) => onChange(event)}
          >
            <option value="none">Select a source</option>
            <option value="ngt-1-canboatjs">Actisense NGT-1 (canboatjs)</option>
            <option value="ngt-1" disabled={!hasAnalyzer}>
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
            <option value="canbus" disabled={!hasAnalyzer}>
              Canbus (canboat)
            </option>
          </Input>
        </Col>
      </FormGroup>
      {(value.options.type === 'ngt-1' ||
        value.options.type === 'ngt-1-canboatjs' ||
        value.options.type === 'ydwg02-usb-canboatjs' ||
        value.options.type === 'ikonvert-canboatjs') && (
        <div>
          <DeviceInput value={value.options} onChange={onChange} />
          <BaudRateInputCanboat value={value.options} onChange={onChange} />
        </div>
      )}
      {value.options.type === 'ydwg02-canboatjs' && (
        <div>
          <HostInput value={value.options} onChange={onChange} />
          <PortInput value={value.options} onChange={onChange} />
          <NoDataReceivedTimeoutInput
            value={value.options}
            onChange={onChange}
          />
        </div>
      )}
      {value.options.type === 'ydwg02-udp-canboatjs' && (
        <div>
          <HostInput value={value.options} onChange={onChange} />
          <PortInput value={value.options} onChange={onChange} />
        </div>
      )}
      {value.options.type === 'navlink2-tcp-canboatjs' && (
        <div>
          <HostInput value={value.options} onChange={onChange} />
          <PortInput value={value.options} onChange={onChange} />
          <NoDataReceivedTimeoutInput
            value={value.options}
            onChange={onChange}
          />
        </div>
      )}
      {(value.options.type === 'canbus' ||
        value.options.type === 'canbus-canboatjs') && (
        <div>
          <TextInput
            title="Interface"
            name="options.interface"
            helpText="Example: can0"
            value={value.options.interface}
            onChange={onChange}
          />
          <TextInput
            title="UniqueNumber"
            name="options.uniqueNumber"
            helpText="Example: any number from 1 to 2097151, will be equal to SerialNumber of a SignalK NMEA2000 device. Leave empty for random (default). Set a fixed value if you have problem with source identification on some B&G MFD's after SignalK restart."
            value={value.options.uniqueNumber}
            onChange={onChange}
          />
          <TextInput
            title="ManufacturerCode"
            name="options.mfgCode"
            helpText="Example: 999 - Unknown (default), 0 - Internal, or any other mabufacturer code to emulate. Leave empty for default 999.  Set to 0 if you have problem with source identification on some B&G MFD's after SignalK restart."
            value={value.options.mfgCode}
            onChange={onChange}
          />
        </div>
      )}
      {(value.options.type === 'ngt-1-canboatjs' ||
        value.options.type === 'ikonvert-canboatjs' ||
        value.options.type === 'navlink2-tcp-canboatjs') && (
        <CollectNetworkStatsInput value={value.options} onChange={onChange} />
      )}
      {(value.options.type === 'w2k-1-n2k-ascii-canboatjs' ||
        value.options.type === 'w2k-1-n2k-actisense-canboatjs') && (
        <div>
          <HostInput value={value.options} onChange={onChange} />
          <PortInput value={value.options} onChange={onChange} />
          <NoDataReceivedTimeoutInput
            value={value.options}
            onChange={onChange}
          />
        </div>
      )}
      <UseCanNameInput value={value.options} onChange={onChange} />
      {value.options.type !== undefined &&
        value.options.type.indexOf('canboatjs') !== -1 && (
          <CamelCaseCompatInput value={value.options} onChange={onChange} />
        )}
    </div>
  )
}

function NMEA0183({ value, onChange }: TypeComponentProps) {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">NMEA 0183 Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={value.options.type}
            name="options.type"
            onChange={(event) => onChange(event)}
          >
            <option>Select a source</option>
            <option value="serial">Serial</option>
            <option value="tcp">TCP Client</option>
            <option value="tcpserver">TCP Server on port 10110</option>
            <option value="udp">UDP</option>
            <option value="gpsd">GPSD</option>
          </Input>
        </Col>
        {value.options.type === 'serial' && (
          <Col xs="12" md="6">
            Serial ports are bidirectional. Input from the connection is parsed
            as NMEA0183. Configure Output Events below to connect server&apos;s
            NMEA0183 data for output.
          </Col>
        )}
        {value.options.type === 'tcpserver' && (
          <Col xs="12" md="6">
            Accept input from clients connected to the default TCP/10110
            NMEA0183 server
          </Col>
        )}
      </FormGroup>
      {serialParams({ value, onChange })}
      {(value.options.type === 'tcp' || value.options.type === 'gpsd') && (
        <div>
          <HostInput value={value.options} onChange={onChange} />
          <PortInput value={value.options} onChange={onChange} />
          <StdOutInput value={value.options} onChange={onChange} />
          <NoDataReceivedTimeoutInput
            value={value.options}
            onChange={onChange}
          />
        </div>
      )}
      <div>
        <Suppress0183Checkbox value={value.options} onChange={onChange} />
      </div>
      {value.options.type === 'udp' && (
        <PortInput value={value.options} onChange={onChange} />
      )}
      <SentenceEventInput value={value.options} onChange={onChange} />
      <ValidateChecksumInput value={value.options} onChange={onChange} />
      <AppendChecksum value={value.options} onChange={onChange} />
      <RemoveNullsInput value={value.options} onChange={onChange} />
      <IgnoredSentences value={value.options} onChange={onChange} />
    </div>
  )
}

function SignalK({ value, onChange }: TypeComponentProps) {
  return (
    <div>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">SignalK Source</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={value.options.type}
            name="options.type"
            onChange={(event) => onChange(event)}
            disabled={value.options.useDiscovery}
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
      {value.options.useDiscovery && (
        <p className="text-danger">
          This connection is deprecated, please delete it and recreate it with
          the connection automatically discovered at the top of the page.
        </p>
      )}
      {!value.options.useDiscovery &&
        (value.options.type === 'ws' ||
          value.options.type === 'wss' ||
          value.options.type === 'tcp') && (
          <div>
            <HostInput value={value.options} onChange={onChange} />
            <PortInput value={value.options} onChange={onChange} />
            {value.options.type === 'wss' && (
              <FormGroup row>
                <Col xs="0" md="3">
                  <Label htmlFor="provider-selfsignedcert">
                    Allow self signed certificates
                  </Label>
                </Col>
                <Col xs="12" md="8">
                  <div>
                    <Label className="switch switch-text switch-primary">
                      <Input
                        type="checkbox"
                        id="provider-selfsignedcert"
                        name="options.selfsignedcert"
                        className="switch-input"
                        onChange={onChange}
                        checked={value.options.selfsignedcert}
                        disabled={!(value.options.type === 'wss')}
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
            {(value.options.type === 'ws' || value.options.type === 'wss') && (
              <div>
                <TextAreaInput
                  title="Subscription"
                  name="options.subscription"
                  rows={6}
                  value={value.options.subscription}
                  onChange={(event) => onChange(event, 'jsonstring')}
                  helpText="Defaults to all. This can be an array of subscriptions."
                />
              </div>
            )}
          </div>
        )}
      {value.options.type === 'udp' && (
        <PortInput value={value.options} onChange={onChange} />
      )}
      {serialParams({ value, onChange })}
      {!value.options.useDiscovery && (
        <FormGroup row>
          <Col md="3">
            <Label htmlFor="options.type">&apos;self&apos; handling</Label>
          </Col>
          <Col xs="12" md="3">
            <Input
              type="select"
              value={value.options.selfHandling || 'noSelf'}
              name="options.selfHandling"
              onChange={(event) => onChange(event)}
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
      {!value.options.useDiscovery &&
        value.options.selfHandling === 'manualSelf' && (
          <RemoteSelfInput value={value.options} onChange={onChange} />
        )}
    </div>
  )
}

const gpios = [
  4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27
].map((gpio) => `0${gpio}`.slice(-2))

function Seatalk({ value, onChange }: TypeComponentProps) {
  return (
    <span>
      <FormGroup row>
        <Col md="3">
          <Label htmlFor="options.type">GPIO Library</Label>
        </Col>
        <Col xs="12" md="3">
          <Input
            type="select"
            value={value.options.type || 'none'}
            name="options.type"
            onChange={(event) => onChange(event)}
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
            onChange={onChange}
            value={value.options.gpio || gpios[0]}
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
              onChange={onChange}
              checked={value.options.gpioInvert}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
        </Col>
      </FormGroup>
    </span>
  )
}

function FileStream({ value, onChange, hasAnalyzer }: TypeComponentProps) {
  return (
    <div>
      <DataTypeInput
        hasAnalyzer={hasAnalyzer}
        value={value}
        onChange={onChange}
      />
      <TextInput
        title="File Name"
        name="options.filename"
        value={value.options.filename}
        onChange={onChange}
      />
    </div>
  )
}

const serialParams = ({
  value,
  onChange
}: {
  value: ProviderValue
  onChange: OnChangeHandler
}) =>
  value.options.type === 'serial' && (
    <div>
      <DeviceInput value={value.options} onChange={onChange} />
      <BaudRateInput value={value.options} onChange={onChange} />
      <StdOutInput value={value.options} onChange={onChange} />
    </div>
  )
