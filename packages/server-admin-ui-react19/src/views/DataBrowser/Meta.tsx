import { faPencil } from '@fortawesome/free-solid-svg-icons/faPencil'
import { faPlusSquare } from '@fortawesome/free-solid-svg-icons/faPlusSquare'
import { faSave } from '@fortawesome/free-solid-svg-icons/faSave'
import { faSquarePlus } from '@fortawesome/free-solid-svg-icons/faSquarePlus'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, type JSX } from 'react'
import { useLoginStatus } from '../../store'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'

interface DisplayScaleValue {
  lower?: number
  upper?: number
  type?: string
  power?: number
}

interface MetaData {
  units?: string
  description?: string
  displayName?: string
  longName?: string
  shortName?: string
  timeout?: number
  displayScale?: DisplayScaleValue
  zones?: Zone[]
  normalMethod?: string[]
  nominalMethod?: string[]
  alertMethod?: string[]
  warnMethod?: string[]
  alarmMethod?: string[]
  emergencyMethod?: string[]
  [key: string]: unknown
}

interface Zone {
  lower: number
  upper: number
  state: string
  message: string
}

// Counter for generating unique zone IDs for stable React keys
let zoneIdCounter = 0
function generateZoneId(): string {
  return `zone-${++zoneIdCounter}`
}

interface MetaProps {
  meta: MetaData
  path: string
  context?: string
}

interface MetaFormRowProps {
  fieldKey: string
  value: unknown
  disabled: boolean
  setValue: (value: unknown) => void
  setKey: (key: string) => void
  deleteKey: () => void
  renderValue: React.FC<ValueRenderProps>
  idPrefix: string
}

interface ValueRenderProps {
  disabled: boolean
  value: unknown
  setValue: (value: unknown) => void
  inputId?: string
}

const UNITS: Record<string, string> = {
  A: 'Ampere',
  C: 'Coulomb',
  Hz: 'Hertz',
  'ISO-8601 (UTC)': 'Timestamp',
  J: 'Joule',
  K: 'Kelvin',
  Pa: 'Pascal',
  V: 'Volt',
  W: 'Watt',
  deg: 'Degree',
  kg: 'Kilogram',
  m: 'Meter',
  'm/s': 'Meters per second',
  m2: 'Square meter',
  m3: 'Cubic meter',
  'm3/s': 'Cubic meters per second',
  rad: 'Radian',
  'rad/s': 'Radians per second',
  ratio: 'Ratio',
  s: 'Second',
  bool: 'Boolean'
}

const METAFIELDS = [
  'units',
  'description',
  'displayName',
  'longName',
  'shortName',
  'timeout',
  'displayScale',
  'zones',
  'normalMethod',
  'nominalMethod',
  'alertMethod',
  'warnMethod',
  'alarmMethod',
  'emergencyMethod'
]

const DISPLAYTYPES = ['linear', 'logarithmic', 'squareroot', 'power']

const STATES = ['nominal', 'alert', 'warn', 'alarm', 'emergency']

const UnitSelect: React.FC<ValueRenderProps> = ({
  disabled,
  value,
  setValue,
  inputId
}) => (
  <Form.Select
    id={inputId}
    disabled={disabled}
    value={value as string}
    onChange={(e) => setValue(e.target.value)}
  >
    {Object.entries(UNITS).map(([unit, description]) => (
      <option key={unit} value={unit}>
        {unit}:{description}
      </option>
    ))}
  </Form.Select>
)

const Text: React.FC<ValueRenderProps> = ({
  disabled,
  setValue,
  value,
  inputId
}) => (
  <Form.Control
    id={inputId}
    disabled={disabled}
    type="text"
    onChange={(e) => setValue(e.target.value)}
    value={value as string}
  />
)

const NumberValue: React.FC<ValueRenderProps> = ({
  disabled,
  setValue,
  value,
  inputId
}) => (
  <Form.Control
    id={inputId}
    disabled={disabled}
    type="number"
    onChange={(e) => {
      try {
        setValue(Number(e.target.value))
      } catch {
        setValue('')
      }
    }}
    value={value as number}
  />
)

const MethodSelect: React.FC<ValueRenderProps> = ({
  setValue,
  value,
  inputId
}) => {
  if (!Array.isArray(value)) {
    setValue([])
    return null
  }
  const baseId = inputId || 'meta-method'
  return (
    <>
      {['sound', 'visual'].map((method) => (
        <label
          key={method}
          className="switch switch-text switch-primary"
          htmlFor={`${baseId}-${method}`}
        >
          <input
            type="checkbox"
            id={`${baseId}-${method}`}
            className="switch-input"
            onChange={() => {
              const arr = value as string[]
              if (arr.indexOf(method) < 0) {
                arr.push(method)
                setValue([...arr])
              } else {
                const newArr = arr.filter((m) => m !== method)
                setValue(newArr)
              }
            }}
            checked={(value as string[]).indexOf(method) >= 0}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
          {method}
        </label>
      ))}
    </>
  )
}

const DisplaySelect: React.FC<ValueRenderProps> = ({
  disabled,
  setValue,
  value,
  inputId
}) => {
  const displayValue = value as DisplayScaleValue
  const { lower, upper, type, power } = displayValue
  const baseId = inputId || 'display-scale'
  return (
    <>
      <label htmlFor={`${baseId}-type`} className="visually-hidden">
        Display type
      </label>
      <Form.Select
        id={`${baseId}-type`}
        disabled={disabled}
        value={type}
        onChange={(e) =>
          setValue({
            ...displayValue,
            type: e.target.value
          })
        }
      >
        {DISPLAYTYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Form.Select>

      <label htmlFor={`${baseId}-lower`} className="visually-hidden">
        Lower bound
      </label>
      <Form.Control
        id={`${baseId}-lower`}
        disabled={disabled}
        type="number"
        onChange={(e) => {
          try {
            setValue({
              ...displayValue,
              lower: Number(e.target.value)
            })
          } catch {
            setValue({
              ...displayValue,
              lower: undefined
            })
          }
        }}
        value={lower}
      />

      <label htmlFor={`${baseId}-upper`} className="visually-hidden">
        Upper bound
      </label>
      <Form.Control
        id={`${baseId}-upper`}
        disabled={disabled}
        type="number"
        onChange={(e) => {
          try {
            setValue({
              ...displayValue,
              upper: Number(e.target.value)
            })
          } catch {
            setValue({
              ...displayValue,
              upper: undefined
            })
          }
        }}
        value={upper}
      />
      <label htmlFor={`${baseId}-power`} className="visually-hidden">
        Power
      </label>
      <Form.Control
        id={`${baseId}-power`}
        disabled={disabled || type !== 'power'}
        type="number"
        onChange={(e) => {
          try {
            setValue({
              ...displayValue,
              power: Number(e.target.value)
            })
          } catch {
            setValue({
              ...displayValue,
              power: undefined
            })
          }
        }}
        value={power}
      />
    </>
  )
}

const METAFIELDRENDERERS: Record<
  string,
  (props: MetaFormRowProps) => JSX.Element
> = {
  units: (props) => <MetaFormRow {...props} renderValue={UnitSelect} />,
  description: (props) => <MetaFormRow {...props} renderValue={Text} />,
  displayName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  longName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  shortName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  timeout: (props) => <MetaFormRow {...props} renderValue={NumberValue} />,
  displayScale: (props) => (
    <MetaFormRow {...props} renderValue={DisplaySelect} />
  ),
  zones: () => <></>,
  normalMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect} />
  ),
  nominalMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect} />
  ),
  alertMethod: (props) => <MetaFormRow {...props} renderValue={MethodSelect} />,
  warnMethod: (props) => <MetaFormRow {...props} renderValue={MethodSelect} />,
  alarmMethod: (props) => <MetaFormRow {...props} renderValue={MethodSelect} />,
  emergencyMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect} />
  )
}

const saveMeta = (path: string, meta: MetaData) => {
  fetch(`/signalk/v1/api/vessels/self/${path.replaceAll('.', '/')}/meta`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: meta })
  })
}

const Meta: React.FC<MetaProps> = ({ meta, path, context }) => {
  const loginStatus = useLoginStatus()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [localMeta, setLocalMeta] = useState<MetaData>(meta)

  const ctxPrefix = context ? context.replace(/[.:]/g, '-') + '-' : ''
  const idPrefix = `meta-${ctxPrefix}${path.replace(/\./g, '-')}`

  const canEditMetadata =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin')

  const summaryParts: string[] = []
  if (meta.units) summaryParts.push(meta.units)
  if (meta.description) summaryParts.push(meta.description)
  if (meta.displayName) summaryParts.push(`"${meta.displayName}"`)
  const fieldCount = Object.keys(meta).length
  if (fieldCount > summaryParts.length) {
    summaryParts.push(`+${fieldCount - summaryParts.length} more`)
  }

  if (!isExpanded) {
    return (
      <span
        onClick={() => setIsExpanded(true)}
        style={{ cursor: 'pointer' }}
        title="Click to expand"
      >
        {summaryParts.length > 0 ? summaryParts.join(' | ') : '(no meta)'}
      </span>
    )
  }

  const metaValues: Array<{ key: string; value: unknown }> = METAFIELDS.reduce(
    (acc: Array<{ key: string; value: unknown }>, key) => {
      if (localMeta[key] !== undefined) {
        acc.push({ key, value: localMeta[key] })
      }
      return acc
    },
    []
  )

  Object.keys(localMeta).reduce((acc, key) => {
    if (METAFIELDS.indexOf(key) < 0) {
      acc.push({ key, value: localMeta[key] })
    }
    return acc
  }, metaValues)

  const zonesMetaValue = metaValues.find(({ key }) => key === 'zones')
  const zones = zonesMetaValue ? (zonesMetaValue.value as Zone[]) : []

  return (
    <>
      <span
        onClick={() => {
          if (!isEditing) setIsExpanded(false)
        }}
        style={{ cursor: isEditing ? 'default' : 'pointer' }}
        title={isEditing ? undefined : 'Click to collapse'}
      >
        [-]
      </span>{' '}
      {!isEditing && canEditMetadata && (
        <FontAwesomeIcon icon={faPencil} onClick={() => setIsEditing(true)} />
      )}
      {isEditing && (
        <FontAwesomeIcon
          icon={faSave}
          onClick={() => {
            saveMeta(path, localMeta)
            setIsEditing(false)
          }}
        />
      )}{' '}
      <Form
        action=""
        method="post"
        encType="multipart/form-data"
        className="form-horizontal"
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        {metaValues
          .filter(({ key }) => key !== 'zones')
          .map(({ key, value }) => {
            const renderer = METAFIELDRENDERERS[key]
            if (renderer) {
              const props: MetaFormRowProps = {
                fieldKey: key,
                value,
                disabled: !isEditing,
                setValue: (metaFieldValue) =>
                  setLocalMeta({ ...localMeta, [key]: metaFieldValue }),
                setKey: (metaFieldKey) => {
                  const copy = { ...localMeta }
                  copy[metaFieldKey] = localMeta[key]
                  delete copy[key]
                  setLocalMeta(copy)
                },
                deleteKey: () => {
                  const copy = { ...localMeta }
                  delete copy[key]
                  setLocalMeta(copy)
                },
                renderValue: () => <></>,
                idPrefix
              }

              return (
                <React.Fragment key={key}>{renderer(props)}</React.Fragment>
              )
            } else {
              return (
                <UnknownMetaFormRow key={key} metaKey={key} value={value} />
              )
            }
          })}
        {isEditing && (
          <FontAwesomeIcon
            icon={faSquarePlus}
            onClick={() => {
              const copy = { ...localMeta }
              const firstNewMetaFieldKey = METAFIELDS.find(
                (metaFieldName) => localMeta[metaFieldName] === undefined
              )
              if (firstNewMetaFieldKey) {
                copy[firstNewMetaFieldKey] = ''
                setLocalMeta(copy)
              }
            }}
          />
        )}
        <Zones
          zones={zones !== undefined && zones !== null ? zones : []}
          isEditing={isEditing}
          setZones={(newZones) =>
            setLocalMeta({ ...localMeta, zones: newZones })
          }
          idPrefix={idPrefix}
        />
      </Form>
    </>
  )
}

const MetaFormRow: React.FC<MetaFormRowProps> = (props) => {
  const {
    fieldKey,
    renderValue: V,
    disabled,
    setKey,
    deleteKey,
    idPrefix
  } = props
  const fieldSelectId = `${idPrefix}-field-${fieldKey}`
  const valueInputId = `${idPrefix}-value-${fieldKey}`
  return (
    <Form.Group as={Row}>
      <Col xs="3" md="2" className={'col-form-label'}>
        <label htmlFor={fieldSelectId} className="visually-hidden">
          Field name
        </label>
        <Form.Select
          id={fieldSelectId}
          disabled={disabled}
          value={fieldKey}
          onChange={(e) => setKey(e.target.value)}
        >
          {METAFIELDS.filter((fieldName) => fieldName !== 'zones').map(
            (fieldName) => (
              <option key={fieldName} value={fieldName}>
                {fieldName}
              </option>
            )
          )}
        </Form.Select>
      </Col>
      <Col xs="12" md="4">
        <label htmlFor={valueInputId} className="visually-hidden">
          {fieldKey} value
        </label>
        <V {...props} inputId={valueInputId} />
      </Col>
      <Col>
        {!disabled && <FontAwesomeIcon icon={faTrashCan} onClick={deleteKey} />}
      </Col>
    </Form.Group>
  )
}

interface UnknownMetaFormRowProps {
  metaKey: string
  value: unknown
}

const UnknownMetaFormRow: React.FC<UnknownMetaFormRowProps> = ({
  metaKey,
  value
}) => {
  return (
    <Form.Group as={Row}>
      <Col xs="3" md="2" className={'col-form-label'}>
        {metaKey}
      </Col>
      <Col xs="12" md="9">
        <pre
          className="text-primary"
          style={{
            border: '1px solid #c8ced3',
            borderRadius: '0.25rem',
            padding: '0.375rem 0.75rem',
            backgroundColor: '#f0f3f5',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowX: 'auto'
          }}
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      </Col>
    </Form.Group>
  )
}

interface ZoneProps {
  zone: Zone
  isEditing: boolean
  showHint: boolean
  setZone: (zone: Zone) => void
  deleteZone: () => void
  idPrefix: string
  index: number
}

const ZoneRow: React.FC<ZoneProps> = ({
  zone,
  isEditing,
  showHint,
  setZone,
  deleteZone,
  idPrefix,
  index
}) => {
  const { state, lower, upper, message } = zone
  const zoneId = `${idPrefix}-zone-${index}`
  return (
    <Form.Group as={Row}>
      <Col xs="2" md="2">
        <label
          htmlFor={`${zoneId}-lower`}
          className={showHint ? 'text-muted small' : 'visually-hidden'}
        >
          Lower
        </label>
        <Form.Control
          id={`${zoneId}-lower`}
          disabled={!isEditing}
          type="number"
          onChange={(e) => setZone({ ...zone, lower: Number(e.target.value) })}
          value={lower}
        />
      </Col>
      <Col xs="2" md="2">
        <label
          htmlFor={`${zoneId}-upper`}
          className={showHint ? 'text-muted small' : 'visually-hidden'}
        >
          Upper
        </label>
        <Form.Control
          id={`${zoneId}-upper`}
          disabled={!isEditing}
          type="number"
          onChange={(e) => setZone({ ...zone, upper: Number(e.target.value) })}
          value={upper}
        />
      </Col>
      <Col xs="12" md="2">
        <label
          htmlFor={`${zoneId}-state`}
          className={showHint ? 'text-muted small' : 'visually-hidden'}
        >
          State
        </label>
        <Form.Select
          id={`${zoneId}-state`}
          disabled={!isEditing}
          value={state}
          onChange={(e) => setZone({ ...zone, state: e.target.value })}
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Form.Select>
      </Col>
      <Col xs="3" md="3">
        <label
          htmlFor={`${zoneId}-message`}
          className={showHint ? 'text-muted small' : 'visually-hidden'}
        >
          Message
        </label>
        <Form.Control
          id={`${zoneId}-message`}
          disabled={!isEditing}
          type="text"
          onChange={(e) => setZone({ ...zone, message: e.target.value })}
          value={message}
        />
      </Col>
      <Col xs="2" md="2">
        {isEditing && (
          <>
            {showHint && (
              <span className="text-muted small d-block">Remove</span>
            )}
            <FontAwesomeIcon icon={faTrashCan} onClick={deleteZone} />
          </>
        )}
      </Col>
    </Form.Group>
  )
}

interface ZonesProps {
  zones: Zone[]
  isEditing: boolean
  setZones: (zones: Zone[]) => void
  idPrefix: string
}

// Zones component manages internal IDs for stable React keys while
// passing clean Zone objects to the parent setZones callback
function Zones({ zones, isEditing, setZones, idPrefix }: ZonesProps) {
  // Generate stable IDs for zones - initialized once based on zones length
  // Using lazy initialization to generate IDs only on first render
  const [zoneIds, setZoneIds] = useState<string[]>(() =>
    zones.map(() => generateZoneId())
  )

  // Sync IDs with zones length when zones change
  // This runs after render, avoiding ref access during render
  const expectedLength = zones.length
  if (zoneIds.length !== expectedLength) {
    if (expectedLength > zoneIds.length) {
      // Add new IDs for added zones
      const newIds = [...zoneIds]
      while (newIds.length < expectedLength) {
        newIds.push(generateZoneId())
      }
      setZoneIds(newIds)
    } else {
      // Trim IDs for removed zones
      setZoneIds(zoneIds.slice(0, expectedLength))
    }
  }

  return (
    <Row>
      <Col md="2">Zones</Col>
      <Col md="10">
        <Form
          action=""
          method="post"
          encType="multipart/form-data"
          className="form-horizontal"
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          {(zones === undefined || zones.length === 0) &&
            !isEditing &&
            'No zones defined'}
          {zones.map((zone, i) => (
            <ZoneRow
              key={zoneIds[i] ?? `zone-fallback-${i}`}
              zone={zone}
              isEditing={isEditing}
              showHint={i === 0}
              setZone={(newZone) => {
                const newZones = [...zones]
                newZones[i] = newZone
                setZones(newZones)
              }}
              deleteZone={() => {
                // Remove the ID at this index too
                setZoneIds((prev) => [
                  ...prev.slice(0, i),
                  ...prev.slice(i + 1)
                ])
                const newZones = zones.filter((_, index) => index !== i)
                setZones(newZones)
              }}
              idPrefix={idPrefix}
              index={i}
            />
          ))}
        </Form>
        {isEditing && (
          <FontAwesomeIcon
            icon={faPlusSquare}
            onClick={() =>
              setZones([
                ...zones,
                {
                  upper: 1,
                  lower: 0,
                  state: STATES[0],
                  message: ''
                }
              ])
            }
          />
        )}
      </Col>
    </Row>
  )
}

export default Meta
