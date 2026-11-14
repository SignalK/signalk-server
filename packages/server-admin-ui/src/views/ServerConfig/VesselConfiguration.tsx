import React, { useState, useEffect, useCallback } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'

interface VesselData {
  name?: string
  mmsi?: string
  callsignVhf?: string
  uuid?: string
  aisShipType?: string
  hullType?: string
  draft?: string
  length?: string
  beam?: string
  height?: string
}

const SHIP_TYPES: [number, string][] = [
  [20, 'Wing In Ground'],
  [29, 'Wing In Ground (no other information)'],
  [30, 'Fishing'],
  [31, 'Towing'],
  [32, 'Towing exceeds 200m or wider than 25m'],
  [33, 'Engaged in dredging or underwater operations'],
  [34, 'Engaged in diving operations'],
  [35, 'Engaged in military operations'],
  [36, 'Sailing'],
  [37, 'Pleasure'],
  [40, 'High speed craft'],
  [41, 'High speed craft carrying dangerous goods'],
  [42, 'High speed craft hazard cat B'],
  [43, 'High speed craft hazard cat C'],
  [44, 'High speed craft hazard cat D'],
  [49, 'High speed craft (no additional information)'],
  [50, 'Pilot vessel'],
  [51, 'SAR'],
  [52, 'Tug'],
  [53, 'Port tender'],
  [54, 'Anti-pollution'],
  [55, 'Law enforcement'],
  [56, 'Spare'],
  [57, 'Spare #2'],
  [58, 'Medical'],
  [59, 'RR Resolution No.1'],
  [60, 'Passenger ship'],
  [69, 'Passenger ship (no additional information)'],
  [70, 'Cargo ship'],
  [71, 'Cargo ship carrying dangerous goods'],
  [72, 'Cargo ship hazard cat B'],
  [73, 'Cargo ship hazard cat C'],
  [74, 'Cargo ship hazard cat D'],
  [79, 'Cargo ship (no additional information)'],
  [80, 'Tanker'],
  [81, 'Tanker carrying dangerous goods'],
  [82, 'Tanker hazard cat B'],
  [83, 'Tanker hazard cat C'],
  [84, 'Tanker hazard cat D'],
  [89, 'Tanker (no additional information)'],
  [90, 'Other'],
  [91, 'Other carrying dangerous goods'],
  [92, 'Other hazard cat B'],
  [93, 'Other hazard cat C'],
  [94, 'Other hazard cat D'],
  [99, 'Other (no additional information)']
]

const VesselConfiguration: React.FC = () => {
  const [hasData, setHasData] = useState(false)
  const [vesselData, setVesselData] = useState<VesselData>({})

  const fetchVessel = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/vessel`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data: VesselData) => {
        setVesselData(data)
        setHasData(true)
      })
  }, [])

  useEffect(() => {
    fetchVessel()
  }, [fetchVessel])

  const handleChange = useCallback(
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      const target = event.target
      const value =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? target.checked
          : target.value
      setVesselData((prev) => ({ ...prev, [target.name]: value }))
    },
    []
  )

  const handleSaveVessel = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/vessel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vesselData),
      credentials: 'include'
    })
      .then((response) => response.text())
      .then((response) => {
        alert(response)
      })
  }, [vesselData])

  if (!hasData) {
    return null
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Header>
          <FontAwesomeIcon icon={faAlignJustify} />{' '}
          <strong>Vessel Base Data</strong>
        </Card.Header>
        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="name">Name</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="name"
                  name="name"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.name || ''}
                />
                <Form.Text muted>The name of the vessel</Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="mmsi">MMSI</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="mmsi"
                  name="mmsi"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.mmsi || ''}
                />
                <Form.Text muted>Leave blank if there is no mmsi</Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="callsignVhf">Call Sign</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="callsignVhf"
                  name="callsignVhf"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.callsignVhf || ''}
                />
                <Form.Text muted>
                  Leave blank if there is no call sign
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="uuid">UUID</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="uuid"
                  name="uuid"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.uuid || ''}
                />
                <Form.Text muted>Ignored if MMSI is set</Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="aisShipType">Ship Type</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Select
                  id="aisShipType"
                  name="aisShipType"
                  value={vesselData.aisShipType || ''}
                  onChange={handleChange}
                >
                  <option value="">Not set</option>
                  {!!vesselData.aisShipType &&
                    !SHIP_TYPES.some(
                      ([id]) => id === Number(vesselData.aisShipType)
                    ) && (
                      <option value={vesselData.aisShipType}>
                        {vesselData.aisShipType}
                      </option>
                    )}
                  {SHIP_TYPES.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="hullType">Hull Type</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Select
                  id="hullType"
                  name="hullType"
                  value={vesselData.hullType || ''}
                  onChange={handleChange}
                >
                  <option value="">Not set</option>
                  <option value="monohull">Monohull</option>
                  <option value="catamaran">Catamaran</option>
                  <option value="trimaran">Trimaran</option>
                </Form.Select>
                <Form.Text muted>
                  One hull, or two or three side by side. Whether the vessel
                  sails is its Ship Type.
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="draft">Draft</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="draft"
                  name="draft"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.draft || ''}
                />
                <Form.Text muted>
                  The maximum draft in meters of the vessel
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="length">Length</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="length"
                  name="length"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.length || ''}
                />
                <Form.Text muted>
                  The overall length of the vessel in meters
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="beam">Beam</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="beam"
                  name="beam"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.beam || ''}
                />
                <Form.Text muted>The beam of the vessel in meters</Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="height">Height</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="height"
                  name="height"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.height || ''}
                />
                <Form.Text muted>
                  The total height of the vessel in meters{' '}
                </Form.Text>
              </Col>
            </Form.Group>
          </Form>
        </Card.Body>
        <Card.Footer>
          <Button size="sm" variant="primary" onClick={handleSaveVessel}>
            <FontAwesomeIcon icon={faFloppyDisk} /> Save
          </Button>
        </Card.Footer>
      </Card>
    </div>
  )
}

export default VesselConfiguration
