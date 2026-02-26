import {
  useState,
  useEffect,
  useCallback,
  useRef,
  ChangeEvent,
  ReactNode
} from 'react'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
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
  token?: string
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
      <Form.Group as={Row} className="mb-3">
        <Col xs="3" md="3">
          <Form.Label htmlFor="select">Data Type</Form.Label>
        </Col>
        <Col xs="6" md="3">
          {value.isNew ? (
            <Form.Select
              value={value.type}
              name="type"
              onChange={(event) => onChange(event)}
            >
              <option value="NMEA2000">NMEA 2000</option>
              <option value="NMEA0183">NMEA 0183</option>
              <option value="SignalK">Signal K</option>
              <option value="Seatalk">Seatalk (GPIO)</option>
              <option value="FileStream">File Stream</option>
            </Form.Select>
          ) : (
            value.type
          )}
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3">
        <Col xs="3" md="3">
          <Form.Label htmlFor="provider-enabled">Enabled</Form.Label>
        </Col>
        <Col xs="2" md="3">
          <Form.Label className="switch switch-text switch-primary">
            <input
              type="checkbox"
              id="provider-enabled"
              name="enabled"
              className="switch-input"
              onChange={(event) => onChange(event)}
              checked={value.enabled}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Form.Label>
        </Col>
      </Form.Group>
      {value.type !== 'FileStream' && (
        <LoggingInput value={value} onChange={onChange} />
      )}
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="id">ID</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Control
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
      </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col md="3">
        <Form.Label htmlFor={name}>{title}</Form.Label>
      </Col>
      <Col xs="12" md="3">
        <Form.Control
          type="text"
          name={name}
          value={value ?? ''}
          onChange={(event) => onChange(event)}
        />
        {helpText && <Form.Text muted>{helpText}</Form.Text>}
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col md="3">
        <Form.Label htmlFor={name}>{title}</Form.Label>
      </Col>
      <Col xs="12" md="3">
        <Form.Control
          as="textarea"
          name={name}
          value={value ?? ''}
          rows={rows}
          onChange={(event) => onChange(event)}
        />
        {helpText && <Form.Text muted>{helpText}</Form.Text>}
      </Col>
    </Form.Group>
  )
}

interface TestConnectionResult {
  success: boolean
  authenticated?: boolean
  connected?: boolean
  self?: string
  server?: { id: string; version: string }
  error?: string
}

interface AccessRequestState {
  requestId?: string
  state: 'idle' | 'requesting' | 'pending' | 'polling' | 'completed' | 'error'
  error?: string
}

function TokenInput({
  value,
  onChange
}: {
  value: ProviderValue
  onChange: OnChangeHandler
}) {
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null
  )
  const [testing, setTesting] = useState(false)
  const [accessRequest, setAccessRequest] = useState<AccessRequestState>({
    state: 'idle'
  })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
      }
    }
  }, [])

  const remoteParams = useCallback(
    () => ({
      host: value.options.host,
      port: value.options.port,
      useTLS: value.options.type === 'wss',
      selfsignedcert: value.options.selfsignedcert
    }),
    [
      value.options.host,
      value.options.port,
      value.options.type,
      value.options.selfsignedcert
    ]
  )

  const testConnection = useCallback(() => {
    setTesting(true)
    setTestResult(null)
    fetch(`${window.serverRoutesPrefix}/testConnection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...remoteParams(),
        token: value.options.token
      })
    })
      .then((response) => response.json())
      .then((result: TestConnectionResult) => setTestResult(result))
      .catch((err: Error) =>
        setTestResult({ success: false, error: err.message })
      )
      .finally(() => setTesting(false))
  }, [remoteParams, value.options.token])

  const pollAccessRequestRef = useRef<(requestId: string) => void>(() => {})

  const pollAccessRequest = useCallback(
    (requestId: string) => {
      fetch(`${window.serverRoutesPrefix}/checkAccessRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...remoteParams(), requestId })
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.state === 'COMPLETED') {
            const token = data.accessRequest?.token
            if (token) {
              onChange({
                target: { name: 'options.token', value: token }
              })
              setAccessRequest({ state: 'completed' })
            } else if (data.accessRequest?.permission === 'DENIED') {
              setAccessRequest({ state: 'error', error: 'Access denied' })
            }
          } else if (data.state === 'PENDING') {
            setAccessRequest({
              state: 'pending',
              requestId
            })
            pollTimerRef.current = setTimeout(
              () => pollAccessRequestRef.current(requestId),
              5000
            )
          } else {
            setAccessRequest({
              state: 'error',
              error: data.error || `Unexpected state: ${data.state}`
            })
          }
        })
        .catch((err: Error) => {
          setAccessRequest({ state: 'error', error: err.message })
        })
    },
    [remoteParams, onChange]
  )

  useEffect(() => {
    pollAccessRequestRef.current = pollAccessRequest
  }, [pollAccessRequest])

  const requestAccess = useCallback(() => {
    // If we have a previous requestId from a cancelled request, resume polling
    if (accessRequest.requestId) {
      setAccessRequest({ state: 'pending', requestId: accessRequest.requestId })
      pollTimerRef.current = setTimeout(
        () => pollAccessRequestRef.current(accessRequest.requestId!),
        1000
      )
      return
    }

    setAccessRequest({ state: 'requesting' })
    const clientId = `${value.id || 'signalk-server'}-${Date.now()}`
    fetch(`${window.serverRoutesPrefix}/requestAccess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...remoteParams(),
        clientId,
        description: `Signal K Server connection: ${value.id || 'unknown'}`
      })
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.state === 'PENDING' && data.requestId) {
          setAccessRequest({ state: 'pending', requestId: data.requestId })
          pollTimerRef.current = setTimeout(
            () => pollAccessRequestRef.current(data.requestId),
            5000
          )
        } else {
          setAccessRequest({
            state: 'error',
            error:
              data.message ||
              data.error ||
              `Unexpected response: ${JSON.stringify(data)}`
          })
        }
      })
      .catch((err: Error) => {
        setAccessRequest({ state: 'error', error: err.message })
      })
  }, [remoteParams, value.id, accessRequest.requestId])

  const cancelPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setAccessRequest((prev) => ({
      state: 'idle',
      requestId: prev.requestId
    }))
  }, [])

  return (
    <>
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="options.token">Authentication Token</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Control
            type="text"
            name="options.token"
            value={value.options.token ?? ''}
            onChange={(event) => onChange(event)}
          />
          <Form.Text muted>
            Use &quot;Request Access&quot; to request a token from the remote
            server. An admin on the remote server must approve the request.
          </Form.Text>
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3">
        <Col md="3" />
        <Col xs="12" md="3">
          <div className="d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline-primary"
              onClick={requestAccess}
              disabled={
                !value.options.host ||
                !value.options.port ||
                accessRequest.state === 'requesting' ||
                accessRequest.state === 'pending'
              }
            >
              {accessRequest.state === 'requesting'
                ? 'Requesting...'
                : 'Request Access'}
            </Button>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={testConnection}
              disabled={testing || !value.options.host || !value.options.port}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>
          {accessRequest.state === 'pending' && (
            <div className="mt-2">
              <span className="text-warning">
                Waiting for approval on the remote server...
              </span>
              <Button
                size="sm"
                variant="link"
                className="p-0 ms-2"
                onClick={cancelPolling}
              >
                Cancel
              </Button>
            </div>
          )}
          {accessRequest.state === 'completed' && (
            <div className="mt-2">
              <span className="text-success">
                Access approved. Token has been filled in automatically.
              </span>
            </div>
          )}
          {accessRequest.state === 'error' && (
            <div className="mt-2">
              <span className="text-danger">{accessRequest.error}</span>
            </div>
          )}
          {testResult && (
            <div className="mt-2">
              {testResult.success && testResult.authenticated ? (
                <span className="text-success">
                  Connected and authenticated
                  {testResult.server &&
                    ` \u2014 ${testResult.server.id} v${testResult.server.version}`}
                </span>
              ) : testResult.success && !testResult.authenticated ? (
                <span className="text-warning">
                  Connected but not authenticated — use Request Access or enter
                  a token
                  {testResult.server &&
                    ` \u2014 ${testResult.server.id} v${testResult.server.version}`}
                </span>
              ) : (
                <span className="text-danger">
                  {testResult.connected ? 'Connected but ' : ''}
                  {testResult.error}
                </span>
              )}
            </div>
          )}
        </Col>
      </Form.Group>
    </>
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
    <Form.Group as={Row} className="mb-3">
      <Col md="3">
        <Form.Label htmlFor="serialportselect">Serial port</Form.Label>
      </Col>
      <Col xs="12" md="3">
        <Form.Select
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
        </Form.Select>
      </Col>
      <Col xs="12" md="3">
        <Form.Control
          type="text"
          name="options.device"
          disabled={!isManualEntry}
          value={manualEntryValue || ''}
          onChange={(event) => onChange(event)}
        />
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-logging">Data Logging</Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-logging"
            name="logging"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.logging}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-validateChecksum">
          Validate Checksum
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-validateChecksum"
            name="options.validateChecksum"
            className="switch-input"
            onChange={handleChange}
            checked={isValidateChecksumEnabled}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
  )
}

function OverrideTimestamps({ value, onChange }: OverrideTimestampsProps) {
  return (
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-overrideTimestamp">
          Override timestamps
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-overrideTimestamp"
            name="options.overrideTimestamp"
            className="switch-input"
            onChange={onChange}
            checked={value.overrideTimestamp}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-removeNulls">
          Remove NULL characters
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-removeNulls"
            name="options.removeNulls"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.removeNulls}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-appendChecksum">
          Append Checksum
        </Form.Label>
      </Col>
      <Col xs="2" md="1">
        <Form.Label className="switch switch-text switch-primary">
          <input
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
        </Form.Label>
      </Col>
      <Col xs="12" md="6">
        {isValidateChecksumEnabled && (
          <label className="text-muted small">
            Turn Validate Checksum OFF to enable appending the checksum
          </label>
        )}
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col md="3">
        <Form.Label htmlFor="dataType">Data Type</Form.Label>
      </Col>
      <Col xs="12" md="4">
        <Form.Select
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
        </Form.Select>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-suppress0183event">
          Suppress nmea0183 event
        </Form.Label>
      </Col>
      <Col xs="1" md="1">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-suppress0183event"
            name="options.suppress0183event"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.suppress0183event}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
      <Col xs="12" md="6">
        <label className="text-muted small">
          Supress sending the default nmea0183 event for incoming sentences
        </label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-useCanName">
          Use Can NAME in source data
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-useCanName"
            name="options.useCanName"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.useCanName}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-useCamelCompat">
          CamcelCase Compat (for legacy N2K plugins)
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
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
        </Form.Label>
      </Col>
    </Form.Group>
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
    <Form.Group as={Row} className="mb-3">
      <Col xs="3" md="3">
        <Form.Label htmlFor="provider-sendNetworkStats">
          Collect Network Statistics
        </Form.Label>
      </Col>
      <Col xs="2" md="3">
        <Form.Label className="switch switch-text switch-primary">
          <input
            type="checkbox"
            id="provider-sendNetworkStats"
            name="options.sendNetworkStats"
            className="switch-input"
            onChange={(event) => onChange(event)}
            checked={value.sendNetworkStats}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
        </Form.Label>
      </Col>
    </Form.Group>
  )
}

function NMEA2000({ value, onChange, hasAnalyzer }: TypeComponentProps) {
  return (
    <div>
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="options.type">NMEA 2000 Source</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Select
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
          </Form.Select>
        </Col>
      </Form.Group>
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
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="options.type">NMEA 0183 Source</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Select
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
          </Form.Select>
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
      </Form.Group>
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
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="options.type">SignalK Source</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Select
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
          </Form.Select>
        </Col>
      </Form.Group>
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
              <Form.Group as={Row} className="mb-3">
                <Col xs="0" md="3">
                  <Form.Label htmlFor="provider-selfsignedcert">
                    Allow self signed certificates
                  </Form.Label>
                </Col>
                <Col xs="12" md="8">
                  <div>
                    <Form.Label className="switch switch-text switch-primary">
                      <input
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
                    </Form.Label>
                  </div>
                </Col>
              </Form.Group>
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
                <TokenInput value={value} onChange={onChange} />
              </div>
            )}
          </div>
        )}
      {value.options.type === 'udp' && (
        <PortInput value={value.options} onChange={onChange} />
      )}
      {serialParams({ value, onChange })}
      {!value.options.useDiscovery && (
        <Form.Group as={Row} className="mb-3">
          <Col md="3">
            <Form.Label htmlFor="options.type">
              &apos;self&apos; handling
            </Form.Label>
          </Col>
          <Col xs="12" md="3">
            <Form.Select
              value={value.options.selfHandling || 'useRemoteSelf'}
              name="options.selfHandling"
              onChange={(event) => onChange(event)}
            >
              <option value="useRemoteSelf">
                Map remote &apos;self&apos; to local &apos;self&apos;
              </option>
              <option value="manualSelf">Manual mapping</option>
              <option value="noSelf">No &apos;self&apos; mapping</option>
            </Form.Select>
          </Col>
        </Form.Group>
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
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="options.type">GPIO Library</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Select
            value={value.options.type || 'none'}
            name="options.type"
            onChange={(event) => onChange(event)}
          >
            <option value="none">Select a library</option>
            <option value="gpiod">gpiod</option>
            <option value="pigpio">pigpio (legacy)</option>
          </Form.Select>
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="gpio">GPIO Pin</Form.Label>
        </Col>
        <Col xs="12" md="3">
          <Form.Select
            name="options.gpio"
            id="gpio"
            onChange={onChange}
            value={value.options.gpio || gpios[0]}
          >
            {gpios.map((gpio) => (
              <option key={gpio}>{`GPIO${gpio}`}</option>
            ))}
          </Form.Select>
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3">
        <Col md="3">
          <Form.Label htmlFor="gpioInvert">Invert signal</Form.Label>
        </Col>
        <Col xs="12" md="10">
          <Form.Label className="switch switch-text switch-primary">
            <input
              type="checkbox"
              id="gpioInvert"
              name="options.gpioInvert"
              className="switch-input"
              onChange={onChange}
              checked={value.options.gpioInvert}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Form.Label>
        </Col>
      </Form.Group>
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
