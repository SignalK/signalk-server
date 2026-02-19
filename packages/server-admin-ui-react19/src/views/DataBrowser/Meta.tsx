import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faPencil } from '@fortawesome/free-solid-svg-icons/faPencil'
import { faPlusSquare } from '@fortawesome/free-solid-svg-icons/faPlusSquare'
import { faSave } from '@fortawesome/free-solid-svg-icons/faSave'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useEffect, type JSX } from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import ButtonGroup from 'react-bootstrap/ButtonGroup'
import Card from 'react-bootstrap/Card'
import {
  useLoginStatus,
  usePresetDetails,
  useUnitDefinitions,
  useStore
} from '../../store'
import { convertValue } from '../../utils/unitConversion'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'

// Imperative accessor — avoids subscribing Meta to every value change.
const getSignalkData = () => useStore.getState().signalkData

interface DisplayScaleValue {
  lower?: number
  upper?: number
  type?: string
  power?: number
}

interface DisplayUnits {
  category?: string
  targetUnit?: string
  formula?: string
  inverseFormula?: string
  symbol?: string
}

interface MetaData {
  units?: string
  description?: string
  displayName?: string
  longName?: string
  shortName?: string
  timeout?: number
  displayScale?: DisplayScaleValue
  displayUnits?: DisplayUnits
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
  categories?: string[]
  siUnit?: string
  description?: string
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
  'displayUnits',
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

const STATE_COLORS: Record<string, string> = {
  nominal: '#28a745',
  alert: '#ffc107',
  warn: '#fd7e14',
  alarm: '#dc3545',
  emergency: '#6f42c1'
}

const DEFAULT_CATEGORIES = [
  'speed',
  'temperature',
  'pressure',
  'distance',
  'depth',
  'angle',
  'angleDegrees',
  'angularVelocity',
  'volume',
  'voltage',
  'current',
  'power',
  'percentage',
  'frequency',
  'time',
  'charge',
  'volumeRate',
  'length',
  'energy',
  'mass',
  'area',
  'dateTime',
  'epoch',
  'unitless',
  'boolean'
]

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  speed: 'primary',
  temperature: 'danger',
  pressure: 'warning',
  voltage: 'info',
  current: 'info',
  power: 'success',
  distance: 'secondary',
  depth: 'secondary',
  angle: 'dark',
  time: 'light'
}

interface CategorySelectProps extends ValueRenderProps {
  categories?: string[]
  siUnit?: string
}

const CategorySelect: React.FC<CategorySelectProps> = ({
  disabled,
  value,
  setValue,
  inputId,
  categories,
  siUnit
}) => {
  const displayUnits = value as DisplayUnits | undefined
  const category = displayUnits?.category || ''
  const categoryList =
    categories !== undefined ? categories : DEFAULT_CATEGORIES
  return (
    <Form.Select
      id={inputId}
      disabled={disabled}
      value={category}
      size="sm"
      onChange={(e) => setValue({ ...displayUnits, category: e.target.value })}
    >
      <option value="">-- No category --</option>
      {siUnit && <option value="base">base ({siUnit})</option>}
      {categoryList.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </Form.Select>
  )
}

const formatMetaValue = (v: unknown): string =>
  typeof v === 'number'
    ? Number.isInteger(v)
      ? String(v)
      : v.toFixed(2)
    : String(v)

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
    size="sm"
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
    size="sm"
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
    size="sm"
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
        size="sm"
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
        size="sm"
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
        size="sm"
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
        size="sm"
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

const DisplayUnitsView: React.FC<CategorySelectProps> = (props) => {
  const { disabled, categories, siUnit } = props
  if (disabled) {
    const displayUnits = props.value as DisplayUnits | undefined
    if (!displayUnits || !displayUnits.category) {
      return (
        <span className="text-muted" style={{ padding: '0.375rem 0' }}>
          No display unit category assigned
        </span>
      )
    }
    return (
      <div style={{ padding: '0.375rem 0' }}>
        <Badge
          bg={CATEGORY_BADGE_COLORS[displayUnits.category] || 'primary'}
          style={{ fontSize: '0.8rem', marginRight: '8px' }}
        >
          {displayUnits.category}
        </Badge>
        {displayUnits.targetUnit && (
          <span className="text-muted">
            target:{' '}
            <strong>{displayUnits.symbol || displayUnits.targetUnit}</strong>
          </span>
        )}
      </div>
    )
  }
  return <CategorySelect {...props} categories={categories} siUnit={siUnit} />
}

const METAFIELDRENDERERS: Record<
  string,
  (props: MetaFormRowProps) => JSX.Element
> = {
  units: (props) => (
    <MetaFormRow
      {...props}
      renderValue={UnitSelect}
      description="SI base unit for this path"
    />
  ),
  description: (props) => <MetaFormRow {...props} renderValue={Text} />,
  displayName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  longName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  shortName: (props) => <MetaFormRow {...props} renderValue={Text} />,
  timeout: (props) => <MetaFormRow {...props} renderValue={NumberValue} />,
  displayScale: (props) => (
    <MetaFormRow {...props} renderValue={DisplaySelect} />
  ),
  displayUnits: (props) => (
    <MetaFormRow
      {...props}
      renderValue={(p) => (
        <DisplayUnitsView
          {...p}
          categories={props.categories}
          siUnit={props.siUnit}
        />
      )}
      description="Category for unit conversion"
    />
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
  // Mark displayUnits as explicit (manually set) so patterns don't overwrite
  const metaToSave = {
    ...meta,
    displayUnits: meta.displayUnits
      ? {
          ...meta.displayUnits,
          explicit: true
        }
      : undefined
  }

  fetch(`/signalk/v1/api/vessels/self/${path.replaceAll('.', '/')}/meta`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: metaToSave })
  })
}

const Meta: React.FC<MetaProps> = ({ meta, path, context }) => {
  const loginStatus = useLoginStatus()
  const presetDetails = usePresetDetails()
  const unitDefinitions = useUnitDefinitions()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [localMeta, setLocalMeta] = useState<MetaData>(meta)
  const [categoryToBaseUnit, setCategoryToBaseUnit] = useState<
    Record<string, string>
  >({})

  // Fetch categories from server for SI unit filtering
  useEffect(() => {
    fetch('/signalk/v1/unitpreferences/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setCategoryToBaseUnit(data.categoryToBaseUnit || {})
      })
      .catch(() => {})
  }, [])

  // Get current value — imperative read, no subscription to avoid re-renders on every delta.
  const ctxData = getSignalkData()[context || 'self']
  let currentValue: unknown
  if (ctxData) {
    for (const entry of Object.values(ctxData)) {
      const e = entry as { path?: string; value?: unknown } | undefined
      if (e?.path === path) {
        currentValue = e.value
        break
      }
    }
  }

  const ctxPrefix = context ? context.replace(/[.:]/g, '-') + '-' : ''
  const idPrefix = `meta-${ctxPrefix}${path.replace(/\./g, '-')}`

  const canEditMetadata =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin')

  // Get category and converted value for preview
  const category = localMeta.displayUnits?.category
  const siUnit = localMeta.units || ''
  const converted = convertValue(
    currentValue,
    siUnit,
    category,
    presetDetails,
    unitDefinitions
  )

  const handleEdit = () => {
    setIsEditing(true)
    setIsExpanded(true)
  }

  const handleSave = () => {
    saveMeta(path, localMeta)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setLocalMeta(meta)
    setIsEditing(false)
    setIsExpanded(false)
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

  // Filter categories by SI unit
  let filteredCategories: string[] = []
  if (siUnit) {
    const builtIn = Object.entries(categoryToBaseUnit)
      .filter(([, unit]) => unit === siUnit)
      .map(([cat]) => cat)

    const presetCats = presetDetails?.categories
      ? Object.entries(presetDetails.categories)
          .filter(
            ([, config]) =>
              (config as { baseUnit?: string }).baseUnit === siUnit
          )
          .map(([cat]) => cat)
      : []

    const merged = [...builtIn]
    presetCats.forEach((cat) => {
      if (!merged.includes(cat)) {
        merged.push(cat)
      }
    })
    filteredCategories = merged.sort()
  }

  return (
    <Card className="meta-card" style={{ marginBottom: '0.5rem' }}>
      <Card.Header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: !isEditing ? 'pointer' : 'default',
          padding: '8px 15px'
        }}
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flex: 1
          }}
        >
          <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {path}
          </strong>
          {category && (
            <Badge
              bg={CATEGORY_BADGE_COLORS[category] || 'primary'}
              style={{ fontSize: '0.75rem' }}
            >
              {category}
            </Badge>
          )}
          {!isExpanded &&
            currentValue !== undefined &&
            typeof currentValue === 'number' && (
              <span style={{ color: '#6c757d', fontSize: '0.85rem' }}>
                {formatMetaValue(currentValue)} {siUnit}
                {converted && (
                  <span style={{ color: '#28a745' }}>
                    {' '}
                    → {formatMetaValue(converted.value)} {converted.unit}
                  </span>
                )}
              </span>
            )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          {!isEditing && canEditMetadata && (
            <Button variant="info" size="sm" onClick={handleEdit}>
              <FontAwesomeIcon icon={faPencil} /> Edit
            </Button>
          )}
          {isEditing && (
            <ButtonGroup>
              <Button variant="success" size="sm" onClick={handleSave}>
                <FontAwesomeIcon icon={faSave} /> Save
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </ButtonGroup>
          )}
        </div>
      </Card.Header>
      {isExpanded && (
        <Card.Body>
          {currentValue !== undefined && typeof currentValue === 'number' && (
            <div
              style={{
                padding: '10px 15px',
                background: '#f8f9fa',
                borderRadius: '4px',
                marginBottom: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}
            >
              <span style={{ color: '#495057' }}>
                <strong>Value:</strong> {formatMetaValue(currentValue)}{' '}
                {siUnit && <strong>{siUnit}</strong>}
              </span>
              {converted && (
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                  → {formatMetaValue(converted.value)}{' '}
                  <strong>{converted.unit}</strong>
                </span>
              )}
            </div>
          )}

          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={(e) => e.preventDefault()}
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
                    categories: filteredCategories,
                    siUnit,
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
              <Button
                variant="info"
                size="sm"
                className="mt-2"
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
              >
                <FontAwesomeIcon icon={faPlusSquare} /> Add Field
              </Button>
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
        </Card.Body>
      )}
    </Card>
  )
}

const MetaFormRow: React.FC<MetaFormRowProps> = (props) => {
  const {
    fieldKey,
    renderValue: V,
    disabled,
    setKey,
    deleteKey,
    description,
    idPrefix
  } = props
  const fieldSelectId = `${idPrefix}-field-${fieldKey}`
  const valueInputId = `${idPrefix}-value-${fieldKey}`
  return (
    <Form.Group
      as={Row}
      className="align-items-start"
      style={{ marginBottom: '10px' }}
    >
      <Col xs="3" md="2">
        <label htmlFor={fieldSelectId} className="visually-hidden">
          Field name
        </label>
        <Form.Select
          id={fieldSelectId}
          disabled={disabled}
          value={fieldKey}
          size="sm"
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
      <Col xs="12" md="6">
        <label htmlFor={valueInputId} className="visually-hidden">
          {fieldKey} value
        </label>
        <V {...props} inputId={valueInputId} />
        {description && (
          <Form.Text muted style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
            {description}
          </Form.Text>
        )}
      </Col>
      <Col xs="1" md="1">
        {!disabled && (
          <Button variant="outline-danger" size="sm" onClick={deleteKey}>
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        )}
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
  moveUp: () => void
  moveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  idPrefix: string
  index: number
}

const ZoneRow: React.FC<ZoneProps> = ({
  zone,
  isEditing,
  showHint,
  setZone,
  deleteZone,
  moveUp,
  moveDown,
  canMoveUp,
  canMoveDown,
  idPrefix,
  index
}) => {
  const { state, lower, upper, message } = zone
  const zoneId = `${idPrefix}-zone-${index}`
  return (
    <div
      style={{
        backgroundColor: 'aliceblue',
        padding: '10px',
        marginBottom: '5px',
        borderRadius: '4px',
        borderLeft: `4px solid ${STATE_COLORS[state] || '#6c757d'}`
      }}
    >
      <Row>
        <Col xs="2" md="2">
          {showHint && (
            <Form.Text muted style={{ fontSize: '0.7rem' }}>
              Lower
            </Form.Text>
          )}
          <Form.Control
            id={`${zoneId}-lower`}
            disabled={!isEditing}
            type="number"
            size="sm"
            onChange={(e) =>
              setZone({ ...zone, lower: Number(e.target.value) })
            }
            value={lower}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && (
            <Form.Text muted style={{ fontSize: '0.7rem' }}>
              Upper
            </Form.Text>
          )}
          <Form.Control
            id={`${zoneId}-upper`}
            disabled={!isEditing}
            type="number"
            size="sm"
            onChange={(e) =>
              setZone({ ...zone, upper: Number(e.target.value) })
            }
            value={upper}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && (
            <Form.Text muted style={{ fontSize: '0.7rem' }}>
              State
            </Form.Text>
          )}
          <Form.Select
            id={`${zoneId}-state`}
            disabled={!isEditing}
            value={state}
            size="sm"
            onChange={(e) => setZone({ ...zone, state: e.target.value })}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs="4" md="4">
          {showHint && (
            <Form.Text muted style={{ fontSize: '0.7rem' }}>
              Message
            </Form.Text>
          )}
          <Form.Control
            id={`${zoneId}-message`}
            disabled={!isEditing}
            type="text"
            size="sm"
            onChange={(e) => setZone({ ...zone, message: e.target.value })}
            value={message}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && (
            <Form.Text muted style={{ fontSize: '0.7rem' }}>
              Actions
            </Form.Text>
          )}
          {isEditing && (
            <ButtonGroup size="sm">
              <Button
                variant="outline-dark"
                disabled={!canMoveUp}
                onClick={moveUp}
                title="Move Up"
              >
                <FontAwesomeIcon icon={faArrowUp} />
              </Button>
              <Button
                variant="outline-dark"
                disabled={!canMoveDown}
                onClick={moveDown}
                title="Move Down"
              >
                <FontAwesomeIcon icon={faArrowDown} />
              </Button>
              <Button variant="danger" onClick={deleteZone} title="Remove">
                <FontAwesomeIcon icon={faTimes} />
              </Button>
            </ButtonGroup>
          )}
        </Col>
      </Row>
    </div>
  )
}

interface ZonesProps {
  zones: Zone[]
  isEditing: boolean
  setZones: (zones: Zone[]) => void
  idPrefix: string
}

function Zones({ zones, isEditing, setZones, idPrefix }: ZonesProps) {
  const [zoneIds, setZoneIds] = useState<string[]>(() =>
    zones.map(() => generateZoneId())
  )

  const expectedLength = zones.length
  if (zoneIds.length !== expectedLength) {
    if (expectedLength > zoneIds.length) {
      const newIds = [...zoneIds]
      while (newIds.length < expectedLength) {
        newIds.push(generateZoneId())
      }
      setZoneIds(newIds)
    } else {
      setZoneIds(zoneIds.slice(0, expectedLength))
    }
  }

  const moveZone = (fromIndex: number, toIndex: number) => {
    const newZones = [...zones]
    const [moved] = newZones.splice(fromIndex, 1)
    newZones.splice(toIndex, 0, moved)
    const newIds = [...zoneIds]
    const [movedId] = newIds.splice(fromIndex, 1)
    newIds.splice(toIndex, 0, movedId)
    setZoneIds(newIds)
    setZones(newZones)
  }

  return (
    <div
      style={{
        marginTop: '20px',
        borderTop: '1px solid #dee2e6',
        paddingTop: '15px'
      }}
    >
      <Row>
        <Col md="2">
          <strong>Zones</strong>
          <Form.Text muted style={{ fontSize: '0.7rem' }}>
            Alert thresholds
          </Form.Text>
        </Col>
        <Col md="10">
          {(zones === undefined || zones.length === 0) && !isEditing && (
            <span style={{ color: '#6c757d', fontStyle: 'italic' }}>
              No zones defined
            </span>
          )}
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
                setZoneIds((prev) => [
                  ...prev.slice(0, i),
                  ...prev.slice(i + 1)
                ])
                const newZones = zones.filter((_, index) => index !== i)
                setZones(newZones)
              }}
              moveUp={() => moveZone(i, i - 1)}
              moveDown={() => moveZone(i, i + 1)}
              canMoveUp={i > 0}
              canMoveDown={i < zones.length - 1}
              idPrefix={idPrefix}
              index={i}
            />
          ))}
          {isEditing && (
            <Button
              variant="outline-info"
              size="sm"
              style={{ marginTop: '10px' }}
              onClick={() =>
                setZones([
                  ...zones,
                  { upper: 1, lower: 0, state: STATES[0], message: '' }
                ])
              }
            >
              <FontAwesomeIcon icon={faPlusSquare} /> Add Zone
            </Button>
          )}
        </Col>
      </Row>
    </div>
  )
}

export default Meta
