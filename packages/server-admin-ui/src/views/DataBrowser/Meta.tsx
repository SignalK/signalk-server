import {
  faPencil,
  faPlusSquare,
  faSave,
  faSquarePlus,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import { Col, Form, FormGroup, FormText, Input, Label, Row } from 'reactstrap'

interface LoginStatus {
  authenticationRequired: boolean
  status: string
  userLevel: string
}

interface RootState {
  loginStatus: LoginStatus
}

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

interface MetaProps {
  meta: MetaData
  path: string
}

interface MetaFormRowProps {
  _key: string
  value: unknown
  disabled: boolean
  setValue: (value: unknown) => void
  setKey: (key: string) => void
  deleteKey: () => void
  renderValue: React.FC<ValueRenderProps>
}

interface ValueRenderProps {
  disabled: boolean
  value: unknown
  setValue: (value: unknown) => void
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
  setValue
}) => (
  <Input
    disabled={disabled}
    type="select"
    value={value as string}
    onChange={(e) => setValue(e.target.value)}
  >
    {Object.entries(UNITS).map(([unit, description]) => (
      <option key={unit} value={unit}>
        {unit}:{description}
      </option>
    ))}
  </Input>
)

const Text: React.FC<ValueRenderProps> = ({ disabled, setValue, value }) => (
  <Input
    disabled={disabled}
    type="text"
    onChange={(e) => setValue(e.target.value)}
    value={value as string}
  />
)

const NumberValue: React.FC<ValueRenderProps> = ({
  disabled,
  setValue,
  value
}) => (
  <Input
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

const MethodSelect: React.FC<ValueRenderProps> = ({ setValue, value }) => {
  if (!Array.isArray(value)) {
    setValue([])
    return null
  }
  return (
    <>
      {['sound', 'visual'].map((method) => (
        <Label key={method} className="switch switch-text switch-primary">
          <Input
            type="checkbox"
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
        </Label>
      ))}
    </>
  )
}

const DisplaySelect: React.FC<ValueRenderProps> = ({
  disabled,
  setValue,
  value
}) => {
  const displayValue = value as DisplayScaleValue
  const { lower, upper, type, power } = displayValue
  return (
    <>
      <Input
        disabled={disabled}
        type="select"
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
      </Input>

      <Input
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

      <Input
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
      <Input
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

const Meta: React.FC<MetaProps> = ({ meta, path }) => {
  const loginStatus = useSelector((state: RootState) => state.loginStatus)
  const [isEditing, setIsEditing] = useState(false)
  const [localMeta, setLocalMeta] = useState<MetaData>(meta)

  const canEditMetadata =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin')

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
                _key: key,
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
                renderValue: () => <></>
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
        />
      </Form>
    </>
  )
}

const MetaFormRow: React.FC<MetaFormRowProps> = (props) => {
  const { _key, renderValue: V, disabled, setKey, deleteKey } = props
  return (
    <FormGroup row>
      <Col xs="3" md="2" className={'col-form-label'}>
        <Input
          disabled={disabled}
          type="select"
          value={_key}
          onChange={(e) => setKey(e.target.value)}
        >
          {METAFIELDS.filter((fieldName) => fieldName !== 'zones').map(
            (fieldName, i) => (
              <option key={i} value={fieldName}>
                {fieldName}
              </option>
            )
          )}
        </Input>
      </Col>
      <Col xs="12" md="4">
        <V {...props} />
      </Col>
      <Col>
        {!disabled && <FontAwesomeIcon icon={faTrashCan} onClick={deleteKey} />}
      </Col>
    </FormGroup>
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
    <FormGroup row>
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
    </FormGroup>
  )
}

interface ZoneProps {
  zone: Zone
  isEditing: boolean
  showHint: boolean
  setZone: (zone: Zone) => void
  deleteZone: () => void
}

const ZoneRow: React.FC<ZoneProps> = ({
  zone,
  isEditing,
  showHint,
  setZone,
  deleteZone
}) => {
  const { state, lower, upper, message } = zone
  return (
    <FormGroup row>
      <Col xs="2" md="2">
        {showHint && <FormText color="muted">Lower</FormText>}
        <Input
          disabled={!isEditing}
          type="number"
          onChange={(e) => setZone({ ...zone, lower: Number(e.target.value) })}
          value={lower}
        />
      </Col>
      <Col xs="2" md="2">
        {showHint && <FormText color="muted">Upper</FormText>}
        <Input
          disabled={!isEditing}
          type="number"
          name="search"
          onChange={(e) => setZone({ ...zone, upper: Number(e.target.value) })}
          value={upper}
        />
      </Col>
      <Col xs="12" md="2">
        {showHint && <FormText color="muted">State</FormText>}
        <Input
          disabled={!isEditing}
          type="select"
          value={state}
          name="options.type"
          onChange={(e) => setZone({ ...zone, state: e.target.value })}
        >
          {STATES.map((s, i) => (
            <option key={i} value={s}>
              {s}
            </option>
          ))}
        </Input>
      </Col>
      <Col xs="3" md="3">
        {showHint && <FormText color="muted">Message</FormText>}
        <Input
          disabled={!isEditing}
          type="text"
          name="search"
          onChange={(e) => setZone({ ...zone, message: e.target.value })}
          value={message}
        />
      </Col>
      <Col xs="2" md="2">
        {isEditing && (
          <>
            {showHint && <FormText color="muted">Remove</FormText>}
            <FontAwesomeIcon icon={faTrashCan} onClick={deleteZone} />
          </>
        )}
      </Col>
    </FormGroup>
  )
}

interface ZonesProps {
  zones: Zone[]
  isEditing: boolean
  setZones: (zones: Zone[]) => void
}

const Zones: React.FC<ZonesProps> = ({ zones, isEditing, setZones }) => (
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
            key={i}
            zone={zone}
            isEditing={isEditing}
            showHint={i === 0}
            setZone={(newZone) => {
              const newZones = [...zones]
              newZones[i] = newZone
              setZones(newZones)
            }}
            deleteZone={() => {
              const newZones = zones.filter((_, index) => index !== i)
              setZones(newZones)
            }}
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

export default Meta
