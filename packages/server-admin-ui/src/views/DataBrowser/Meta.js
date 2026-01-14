import {
  faArrowDown,
  faArrowUp,
  faPencil,
  faPlusSquare,
  faSave,
  faSquarePlus,
  faTimes,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useEffect } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Col,
  Form,
  FormGroup,
  FormText,
  Input,
  Label,
  Row
} from 'reactstrap'
import { compile } from 'mathjs'

// Cache for compiled mathjs expressions
const compiledFormulaCache = new Map()

/**
 * Get a compiled expression from cache, or compile and cache it
 * @param {string} formula - The formula string to compile
 * @returns {object} - Compiled mathjs expression
 */
function getCompiledFormula(formula) {
  if (!compiledFormulaCache.has(formula)) {
    compiledFormulaCache.set(formula, compile(formula))
  }
  return compiledFormulaCache.get(formula)
}

const UnitSelect = ({ disabled, value, setValue }) => (
  <Input
    disabled={disabled}
    type="select"
    value={value}
    onChange={(e) => setValue(e.target.value)}
  >
    {Object.entries(UNITS).map(([unit, description]) => (
      <option key={unit} value={unit}>
        {unit}:{description}
      </option>
    ))}
  </Input>
)

const Text = ({ disabled, setValue, value }) => (
  <Input
    disabled={disabled}
    type="text"
    onChange={(e) => setValue(e.target.value)}
    value={value}
  />
)
const NumberValue = ({ disabled, setValue, value }) => (
  <Input
    disabled={disabled}
    type="number"
    onChange={(e) => {
      try {
        setValue(Number(e.target.value))
      } catch (_) {
        setValue('')
      }
    }}
    value={value}
  />
)

const MethodSelect = ({ setValue, value }) => {
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
              if (value.indexOf(method) < 0) {
                value.push(method)
                setValue(value)
              } else {
                value.splice(value.indexOf(method, 1))
                setValue(value)
              }
            }}
            checked={value.indexOf(method) >= 0}
          />
          <span className="switch-label" data-on="Yes" data-off="No" />
          <span className="switch-handle" />
          {method}
        </Label>
      ))}
    </>
  )
}

const DISPLAYTYPES = ['linear', 'logarithmic', 'squareroot', 'power']

const DisplaySelect = ({ disabled, setValue, value }) => {
  const { lower, upper, type, power } = value
  return (
    <>
      <Input
        disabled={disabled}
        type="select"
        value={type}
        onChange={(e) =>
          setValue({
            ...value,
            type: e.target.value
          })
        }
      >
        {DISPLAYTYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </Input>

      <Input
        disabled={disabled}
        type="number"
        onChange={(e) => {
          try {
            setValue({
              ...value,
              lower: Number(e.target.value)
            })
          } catch (_) {
            setValue({
              ...value,
              lower: null
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
              ...value,
              upper: Number(e.target.value)
            })
          } catch (_) {
            setValue({
              ...value,
              upper: null
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
              ...value,
              power: Number(e.target.value)
            })
          } catch (_) {
            setValue({
              ...value,
              upper: null
            })
          }
        }}
        value={power}
      />
    </>
  )
}

// Default categories (fallback if fetch fails)
const DEFAULT_CATEGORIES = [
  'speed', 'temperature', 'pressure', 'distance', 'depth', 'angle',
  'angleDegrees', 'angularVelocity', 'volume', 'voltage', 'current',
  'power', 'percentage', 'frequency', 'time', 'charge', 'volumeRate',
  'length', 'energy', 'mass', 'area', 'dateTime', 'epoch', 'unitless', 'boolean'
]

const CategorySelect = ({ disabled, value, setValue, categories }) => {
  const category = value?.category || ''
  const categoryList = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES
  return (
    <Input
      disabled={disabled}
      type="select"
      value={category}
      onChange={(e) => setValue({ ...value, category: e.target.value })}
    >
      <option value="">-- No category --</option>
      {categoryList.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </Input>
  )
}

// Helper to get category badge color
const getCategoryColor = (category) => {
  const colors = {
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
  return colors[category] || 'primary'
}

// Convert value based on category and preset
const convertValue = (value, siUnit, category, presetDetails, unitDefinitions) => {
  if (typeof value !== 'number' || !category || !presetDetails || !unitDefinitions) {
    return null
  }
  const targetConfig = presetDetails.categories?.[category]
  if (!targetConfig?.targetUnit) return null
  const targetUnit = targetConfig.targetUnit
  if (targetUnit === siUnit) return null
  const formula = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.formula
  const symbol = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.symbol || targetUnit
  if (!formula) return null
  try {
    const compiled = getCompiledFormula(formula)
    const converted = compiled.evaluate({ value })
    return { value: converted, unit: symbol }
  } catch {
    return null
  }
}

const METAFIELDRENDERERS = {
  units: (props) => (
    <MetaFormRow {...props} renderValue={UnitSelect} description="SI base unit for this path"></MetaFormRow>
  ),
  displayUnits: (props) => (
    <MetaFormRow {...props} renderValue={(p) => <CategorySelect {...p} categories={props.categories} />} description="Category for unit conversion"></MetaFormRow>
  ),
  description: (props) => (
    <MetaFormRow {...props} renderValue={Text}></MetaFormRow>
  ),
  displayName: (props) => (
    <MetaFormRow {...props} renderValue={Text}></MetaFormRow>
  ),
  longName: (props) => (
    <MetaFormRow {...props} renderValue={Text}></MetaFormRow>
  ),
  shortName: (props) => (
    <MetaFormRow {...props} renderValue={Text}></MetaFormRow>
  ),
  timeout: (props) => (
    <MetaFormRow {...props} renderValue={NumberValue}></MetaFormRow>
  ),
  displayScale: (props) => (
    <MetaFormRow {...props} renderValue={DisplaySelect}></MetaFormRow>
  ),
  zones: () => <></>, // not used
  normalMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  ),
  nominalMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  ),
  alertMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  ),
  warnMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  ),
  alarmMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  ),
  emergencyMethod: (props) => (
    <MetaFormRow {...props} renderValue={MethodSelect}></MetaFormRow>
  )
}
const METAFIELDS = [
  'units',
  'displayUnits',
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

const UNITS = {
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

const saveMeta = (path, meta) => {
  // Mark displayUnits as explicit (manually set) so patterns don't overwrite
  const metaToSave = {
    ...meta,
    displayUnits: meta.displayUnits ? {
      ...meta.displayUnits,
      explicit: true  // Flag to prevent pattern override
    } : undefined
  }

  fetch(`/signalk/v1/api/vessels/self/${path.replaceAll('.', '/')}/meta`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: metaToSave })
  })
}

function Meta({ meta, path, loginStatus, currentValue, activePreset, presetDetails, unitDefinitions }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [localMeta, setLocalMeta] = useState(meta)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  // Fetch categories from server
  useEffect(() => {
    fetch('/signalk/v1/unitpreferences/categories', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const cats = Object.keys(data.categoryToBaseUnit || data)
        if (cats.length > 0) setCategories(cats.sort())
      })
      .catch(() => {})
  }, [])

  // Check if user can edit metadata
  const canEditMetadata =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin')

  let metaValues = METAFIELDS.reduce((acc, key) => {
    if (localMeta[key] !== undefined) {
      acc.push({ key, value: localMeta[key] })
    }
    return acc
  }, [])
  Object.keys(localMeta).reduce((acc, key) => {
    if (METAFIELDS.indexOf(key) < 0) {
      acc.push({ key, value: localMeta[key] })
    }
    return acc
  }, metaValues)

  const zonesMetaValue = metaValues.find(({ key }) => key === 'zones')
  const zones = zonesMetaValue ? zonesMetaValue.value : []

  // Get category and converted value for preview
  const category = localMeta.displayUnits?.category
  const siUnit = localMeta.units || ''
  const converted = convertValue(currentValue, siUnit, category, presetDetails, unitDefinitions)

  // Format values for display
  const formatValue = (v) => typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v

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

  return (
    <Card className="meta-card" style={{ marginBottom: '0.5rem' }}>
      <CardHeader
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: !isEditing ? 'pointer' : 'default',
          padding: '8px 15px'
        }}
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{path}</strong>
          {category && (
            <Badge color={getCategoryColor(category)} style={{ fontSize: '0.75rem' }}>{category}</Badge>
          )}
          {/* Show quick value preview when collapsed */}
          {!isExpanded && currentValue !== undefined && typeof currentValue === 'number' && (
            <span style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              {formatValue(currentValue)} {siUnit}
              {converted && <span style={{ color: '#28a745' }}> → {formatValue(converted.value)} {converted.unit}</span>}
            </span>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          {!isEditing && canEditMetadata && (
            <Button color="info" size="sm" onClick={handleEdit}>
              <FontAwesomeIcon icon={faPencil} /> Edit
            </Button>
          )}
          {isEditing && (
            <ButtonGroup>
              <Button color="success" size="sm" onClick={handleSave}>
                <FontAwesomeIcon icon={faSave} /> Save
              </Button>
              <Button color="secondary" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </ButtonGroup>
          )}
        </div>
      </CardHeader>
      {isExpanded && <CardBody>
        {/* Value Preview with Conversion */}
        {currentValue !== undefined && typeof currentValue === 'number' && (
          <div style={{
            padding: '10px 15px',
            background: '#f8f9fa',
            borderRadius: '4px',
            marginBottom: '15px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            <span style={{ color: '#495057' }}>
              <strong>Value:</strong> {formatValue(currentValue)} {siUnit && <strong>{siUnit}</strong>}
            </span>
            {converted && (
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                → {formatValue(converted.value)} <strong>{converted.unit}</strong>
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
                const props = {
                  _key: key,
                  value,
                  disabled: !isEditing,
                  categories,
                  setValue: (metaFieldValue) =>
                    setLocalMeta({ ...localMeta, ...{ [key]: metaFieldValue } }),
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
                  }
                }
                return renderer(props)
              } else {
                return <UnknownMetaFormRow key={key} metaKey={key} value={value} />
              }
            })}

          {isEditing && (
            <Button
              color="info"
              size="sm"
              outline
              style={{ marginTop: '10px' }}
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
            setZones={(zones) => setLocalMeta({ ...localMeta, zones })}
          />
        </Form>
      </CardBody>}
    </Card>
  )
}

const MetaFormRow = (props) => {
  const { _key, renderValue, disabled, setKey, deleteKey, description } = props
  const V = renderValue
  return (
    <FormGroup row style={{ marginBottom: '10px' }}>
      <Col xs="3" md="2" className={'col-form-label'}>
        <Input
          disabled={disabled}
          type="select"
          value={_key}
          onChange={(e) => setKey(e.target.value)}
          bsSize="sm"
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
      <Col xs="12" md="6">
        <V {...props}></V>
        {description && <FormText color="muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{description}</FormText>}
      </Col>
      <Col xs="1" md="1">
        {!disabled && (
          <Button color="danger" size="sm" outline onClick={deleteKey}>
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        )}
      </Col>
    </FormGroup>
  )
}

const UnknownMetaFormRow = ({ metaKey, value }) => {
  return (
    <FormGroup row>
      <Col xs="3" md="2" className={'col-form-label'}>
        {metaKey}
      </Col>
      <Col xs="12" md="4">
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </Col>
    </FormGroup>
  )
}

const STATES = ['nominal', 'alert', 'warn', 'alarm', 'emergency']
const STATE_COLORS = {
  nominal: '#28a745',
  alert: '#ffc107',
  warn: '#fd7e14',
  alarm: '#dc3545',
  emergency: '#6f42c1'
}

const Zone = ({ zone, isEditing, showHint, setZone, deleteZone, moveUp, moveDown, canMoveUp, canMoveDown }) => {
  const { state, lower, upper, message } = zone
  return (
    <div style={{
      backgroundColor: 'aliceblue',
      padding: '10px',
      marginBottom: '5px',
      borderRadius: '4px',
      borderLeft: `4px solid ${STATE_COLORS[state] || '#6c757d'}`
    }}>
      <Row>
        <Col xs="2" md="2">
          {showHint && <FormText color="muted" style={{ fontSize: '0.7rem' }}>Lower</FormText>}
          <Input
            disabled={!isEditing}
            type="number"
            bsSize="sm"
            onChange={(e) => setZone({ ...zone, lower: Number(e.target.value) })}
            value={lower}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && <FormText color="muted" style={{ fontSize: '0.7rem' }}>Upper</FormText>}
          <Input
            disabled={!isEditing}
            type="number"
            bsSize="sm"
            onChange={(e) => setZone({ ...zone, upper: Number(e.target.value) })}
            value={upper}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && <FormText color="muted" style={{ fontSize: '0.7rem' }}>State</FormText>}
          <Input
            disabled={!isEditing}
            type="select"
            bsSize="sm"
            value={state}
            onChange={(e) => setZone({ ...zone, state: e.target.value })}
          >
            {STATES.map((s, i) => (
              <option key={i} value={s}>{s}</option>
            ))}
          </Input>
        </Col>
        <Col xs="4" md="4">
          {showHint && <FormText color="muted" style={{ fontSize: '0.7rem' }}>Message</FormText>}
          <Input
            disabled={!isEditing}
            type="text"
            bsSize="sm"
            onChange={(e) => setZone({ ...zone, message: e.target.value })}
            value={message}
          />
        </Col>
        <Col xs="2" md="2">
          {showHint && <FormText color="muted" style={{ fontSize: '0.7rem' }}>Actions</FormText>}
          {isEditing && (
            <ButtonGroup size="sm">
              <Button color="outline-dark" disabled={!canMoveUp} onClick={moveUp} title="Move Up">
                <FontAwesomeIcon icon={faArrowUp} />
              </Button>
              <Button color="outline-dark" disabled={!canMoveDown} onClick={moveDown} title="Move Down">
                <FontAwesomeIcon icon={faArrowDown} />
              </Button>
              <Button color="danger" onClick={deleteZone} title="Remove">
                <FontAwesomeIcon icon={faTimes} />
              </Button>
            </ButtonGroup>
          )}
        </Col>
      </Row>
    </div>
  )
}
const Zones = ({ zones, isEditing, setZones }) => {
  const moveZone = (fromIndex, toIndex) => {
    const newZones = [...zones]
    const [moved] = newZones.splice(fromIndex, 1)
    newZones.splice(toIndex, 0, moved)
    setZones(newZones)
  }

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid #dee2e6', paddingTop: '15px' }}>
      <Row>
        <Col md="2">
          <strong>Zones</strong>
          <FormText color="muted" style={{ fontSize: '0.7rem' }}>Alert thresholds</FormText>
        </Col>
        <Col md="10">
          {(zones === undefined || zones.length === 0) && !isEditing && (
            <span style={{ color: '#6c757d', fontStyle: 'italic' }}>No zones defined</span>
          )}
          {zones.map((zone, i) => (
            <Zone
              key={i}
              zone={zone}
              isEditing={isEditing}
              showHint={i === 0}
              setZone={(zone) => {
                const newZones = [...zones]
                newZones[i] = zone
                setZones(newZones)
              }}
              deleteZone={() => {
                const newZones = [...zones]
                newZones.splice(i, 1)
                setZones(newZones)
              }}
              moveUp={() => moveZone(i, i - 1)}
              moveDown={() => moveZone(i, i + 1)}
              canMoveUp={i > 0}
              canMoveDown={i < zones.length - 1}
            />
          ))}
          {isEditing && (
            <Button
              color="info"
              size="sm"
              outline
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

const clone = (o) => JSON.parse(JSON.stringify(o))

export default connect(({ loginStatus }) => ({ loginStatus }))(Meta)
