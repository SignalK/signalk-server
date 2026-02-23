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
  draft?: string
  length?: string
  beam?: string
  height?: string
  gpsFromBow?: string
  gpsFromCenter?: string
}

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
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      setVesselData((prev) => ({ ...prev, [event.target.name]: value }))
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
                  <option value="20">Wing In Ground</option>
                  <option value="29">
                    Wing In Ground (no other information)
                  </option>
                  <option value="30">Fishing</option>
                  <option value="31">Towing</option>
                  <option value="32">
                    Towing exceeds 200m or wider than 25m
                  </option>
                  <option value="33">
                    Engaged in dredging or underwater operations
                  </option>
                  <option value="34">Engaged in diving operations</option>
                  <option value="35">Engaged in military operations</option>
                  <option value="36">Sailing</option>
                  <option value="37">Pleasure</option>
                  <option value="40">High speed craft</option>
                  <option value="41">
                    High speed craft carrying dangerous goods
                  </option>
                  <option value="42">High speed craft hazard cat B</option>
                  <option value="43">High speed craft hazard cat C</option>
                  <option value="44">High speed craft hazard cat D</option>
                  <option value="49">
                    High speed craft (no additional information)
                  </option>
                  <option value="50">Pilot vessel</option>
                  <option value="51">SAR</option>
                  <option value="52">Tug</option>
                  <option value="53">Port tender</option>
                  <option value="54">Anti-pollution</option>
                  <option value="55">Law enforcement</option>
                  <option value="56">Spare</option>
                  <option value="57">Spare #2</option>
                  <option value="58">Medical</option>
                  <option value="59">RR Resolution No.1</option>
                  <option value="60">Passenger ship</option>
                  <option value="69">
                    Passenger ship (no additional information)
                  </option>
                  <option value="70">Cargo ship</option>
                  <option value="71">
                    Cargo ship carrying dangerous goods
                  </option>
                  <option value="72">Cargo ship hazard cat B</option>
                  <option value="73">Cargo ship hazard cat C</option>
                  <option value="74">Cargo ship hazard cat D</option>
                  <option value="79">
                    Cargo ship (no additional information)
                  </option>
                  <option value="80">Tanker</option>
                  <option value="81">Tanker carrying dangerous goods</option>
                  <option value="82">Tanker hazard cat B</option>
                  <option value="83">Tanker hazard cat C</option>
                  <option value="84">Tanker hazard cat D</option>
                  <option value="89">Tanker (no additional information)</option>
                  <option value="90">Other</option>
                  <option value="91">Other carrying dangerous goods</option>
                  <option value="92">Other hazard cat B</option>
                  <option value="93">Other hazard cat C</option>
                  <option value="94">Other hazard cat D</option>
                  <option value="99">Other (no additional information)</option>
                </Form.Select>
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
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="gpsFromBow">
                  GPS Distance From Bow
                </Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="gpsFromBow"
                  name="gpsFromBow"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.gpsFromBow || ''}
                />
                <Form.Text muted>
                  The distance of the gps receiver from the bow in meters
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col md="2">
                <Form.Label htmlFor="gpsFromCenter">
                  GPS Distance From Center
                </Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  id="gpsFromCenter"
                  name="gpsFromCenter"
                  autoComplete="off"
                  onChange={handleChange}
                  value={vesselData.gpsFromCenter || ''}
                />
                <Form.Text muted>
                  The distance from the center of vessel of the gps receiver in
                  meters
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
