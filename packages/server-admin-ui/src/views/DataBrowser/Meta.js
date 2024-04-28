import {
  faPlusSquare,
  faSquarePlus,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import { Col, Form, FormGroup, FormText, Input, Row } from 'reactstrap'

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

export default function Meta({ meta }) {
  let metaValues = METAFIELDS.reduce((acc, key) => {
    if (meta[key]) {
      acc.push({ key, value: meta[key] })
    }
    return acc
  }, [])
  Object.keys(meta).reduce((acc, key) => {
    if (METAFIELDS.indexOf(key) < 0) {
      acc.push({ key, value: meta[key] })
    }
    return acc
  }, metaValues)
  const extraValues = clone(meta)
  for (const prop in extraValues) {
    if (METAFIELDS.indexOf(prop) < 0) {
      delete extraValues[prop]
    }
  }

  const zonesMetaValue = metaValues.find(({ key }) => key === 'zones')
  const zones = zonesMetaValue ? zonesMetaValue.value : []
  return (
    <Form
      action=""
      method="post"
      encType="multipart/form-data"
      className="form-horizontal"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      {metaValues.map(({ key, value }) => (
        <>
          {key !== 'zones' && (
            <TextMetaFormRow _key={key} value={value}></TextMetaFormRow>
          )}
        </>
      ))}
      <Zones zones={zones}></Zones>
      <FontAwesomeIcon
        className="icon__add_metavalue"
        icon={faSquarePlus}
        onClick={(e) => console.log(e)}
      />
    </Form>
  )
}

const TextMetaFormRow = ({ _key, value }) => (
  <FormGroup row>
    <Col xs="3" md="2" className={'col-form-label'}>
      <Input
        type="select"
        value={_key}
        name="options.type"
        onChange={(event) => console.log(event)}
      >
        {METAFIELDS.map((fieldName, i) => (
          <option key={i} value={fieldName}>
            {fieldName}
          </option>
        ))}
      </Input>
    </Col>
    <Col xs="12" md="4">
      <Input
        type="text"
        name="search"
        onChange={(e) => console.log(e)}
        value={value}
      />
    </Col>
    <Col>
      <FontAwesomeIcon
        className="icon__remove"
        icon={faTrashCan}
        onClick={(e) => console.log(e)}
      />
    </Col>
  </FormGroup>
)

const STATES = ['nominal', 'alert', 'warn', 'alarm', 'emergency']
const Zone = ({ zone }) => {
  const { state, lower, upper, message } = zone
  return (
    <FormGroup row>
      <Col xs="2" md="2">
        <FormText color="muted">Upper</FormText>
        <Input
          type="number"
          name="search"
          onChange={(e) => console.log(e)}
          value={lower}
        />
      </Col>
      <Col xs="2" md="2">
        <FormText color="muted">Upper</FormText>
        <Input
          type="number"
          name="search"
          onChange={(e) => console.log(e)}
          value={upper}
        />
      </Col>
      <Col xs="12" md="2">
        <FormText color="muted">State</FormText>
        <Input
          type="select"
          value={state}
          name="options.type"
          onChange={(event) => console.log(event)}
        >
          {STATES.map((state, i) => (
            <option key={i} value={state}>
              {state}
            </option>
          ))}
        </Input>
      </Col>
      <Col xs="3" md="3">
        <FormText color="muted">Message</FormText>
        <Input
          type="text"
          name="search"
          onChange={(e) => console.log(e)}
          value={message}
        />
      </Col>
      <Col xs="2" md="2">
        <FormText color="muted">Remove</FormText>
        <FontAwesomeIcon
          className="icon__remove"
          icon={faTrashCan}
          onClick={(e) => console.log(e)}
        />
      </Col>
    </FormGroup>
  )
}
const Zones = ({ zones }) => (
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
          <Zone key={i} zone={zone}></Zone>
        ))}
      </Form>
      <FontAwesomeIcon
        className="icon__remove"
        icon={faPlusSquare}
        onClick={(e) => console.log(e)}
      />
    </Col>
  </Row>
)

const clone = (o) => JSON.parse(JSON.stringify(o))
