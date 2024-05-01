import {
  faPencil,
  faPlusSquare,
  faSave,
  faSquarePlus,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState } from 'react'
import { Col, Form, FormGroup, FormText, Input, Label, Row } from 'reactstrap'

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

const ScaleSelect = () => <span>TODO scale editor</span>

const Text = ({ disabled, setValue, value }) => (
  <Input
    disabled={disabled}
    type="text"
    onChange={(e) => setValue(e.target.value)}
    value={value}
  />
)
const Number = ({ disabled, setValue, value }) => (
  <Input
    disabled={disabled}
    type="number"
    onChange={(e) => {
      try {
        setValue(Number(e.target.value))
      } catch (e) {
        setValue('')
      }
    }}
    value={value}
  />
)

const MethodSelect = ({ disabled, setValue, value }) => {
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

const METAFIELDRENDERERS = {
  units: (props) => (
    <MetaFormRow {...props} renderValue={UnitSelect}></MetaFormRow>
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
    <MetaFormRow {...props} renderValue={Number}></MetaFormRow>
  ),
  displayScale: (props) => (
    <MetaFormRow {...props} renderValue={ScaleSelect}></MetaFormRow>
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
  ),
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
  'emergencyMethod',
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
}

const saveMeta = (path, meta) => {
  fetch(`/signalk/v1/api/vessels/self/${path.replaceAll('.', '/')}/meta`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: meta }),
  })
}

export default function Meta({ meta, path }) {
  const [isEditing, setIsEditing] = useState(false)
  const [localMeta, setLocalMeta] = useState(meta)
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
  const extraValues = clone(localMeta)
  for (const prop in extraValues) {
    if (METAFIELDS.indexOf(prop) < 0) {
      delete extraValues[prop]
    }
  }

  const zonesMetaValue = metaValues.find(({ key }) => key === 'zones')
  const zones = zonesMetaValue ? zonesMetaValue.value : []
  return (
    <>
      {!isEditing && (
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
            const props = {
              _key: key,
              value,
              disabled: !isEditing,
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
              },
            }
            const renderer = METAFIELDRENDERERS[key]
            return renderer && renderer(props)
          })}
        <Zones
          zones={zones}
          isEditing={isEditing}
          setZones={(zones) => setLocalMeta({ ...localMeta, zones })}
        ></Zones>
        {isEditing && (
          <FontAwesomeIcon
            icon={faSquarePlus}
            onClick={() => {
              const copy = { ...localMeta }
              const firstNewMetaFieldKey = METAFIELDS.find(
                (metaFieldName) => localMeta[metaFieldName] === undefined
              )
              copy[firstNewMetaFieldKey] = ''
              setLocalMeta(copy)
            }}
          />
        )}
      </Form>
    </>
  )
}

const MetaFormRow = (props) => {
  const { _key, renderValue, value, disabled, setValue, setKey, deleteKey } =
    props
  const V = renderValue
  return (
    <FormGroup row>
      <Col xs="3" md="2" className={'col-form-label'}>
        <Input
          disabled={disabled}
          type="select"
          value={_key}
          onChange={(e) => setKey(e.target.value)}
        >
          {METAFIELDS.map((fieldName, i) => (
            <option key={i} value={fieldName}>
              {fieldName}
            </option>
          ))}
        </Input>
      </Col>
      <Col xs="12" md="4">
        <V {...props}></V>
      </Col>
      <Col>
        {!disabled && <FontAwesomeIcon icon={faTrashCan} onClick={deleteKey} />}
      </Col>
    </FormGroup>
  )
}

const STATES = ['nominal', 'alert', 'warn', 'alarm', 'emergency']
const Zone = ({ zone, isEditing, showHint, setZone, deleteZone }) => {
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
          {STATES.map((state, i) => (
            <option key={i} value={state}>
              {state}
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
const Zones = ({ zones, isEditing, setZones }) => (
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
        {zones.map((zone, i) => (
          <Zone
            key={i}
            zone={zone}
            isEditing={isEditing}
            showHint={i === 0}
            setZone={(zone) => {
              zones[i] = zone
              setZones([...zones])
            }}
            deleteZone={() => {
              zones.splice(i, 1)
              setZones(zones)
            }}
          ></Zone>
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
                message: '',
              },
            ])
          }
        />
      )}
    </Col>
  </Row>
)

const clone = (o) => JSON.parse(JSON.stringify(o))
