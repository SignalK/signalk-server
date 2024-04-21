import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
} from 'reactstrap'

function fetchVessel() {
  fetch(`${window.serverRoutesPrefix}/vessel`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then((data) => {
      this.setState({ ...data, hasData: true })
    })
}

class VesselConfiguration extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
    }

    this.fetchVessel = fetchVessel.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSaveVessel = this.handleSaveVessel.bind(this)
  }

  componentDidMount() {
    this.fetchVessel()
  }

  handleChange(event) {
    console.log(event)
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleSaveVessel() {
    fetch(`${window.serverRoutesPrefix}/vessel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.state),
      credentials: 'include',
    })
      .then((response) => response.text())
      .then((response) => {
        alert(response)
      })
  }

  render() {
    return (
      this.state.hasData && (
        <div className="animated fadeIn">
          <Card>
            <CardHeader>
              <i className="fa fa-align-justify" />
              <strong>Vessel Base Data</strong>
            </CardHeader>
            <CardBody>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
              >
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="name">Name</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="name"
                      onChange={this.handleChange}
                      value={this.state.name}
                    />
                    <FormText color="muted">The name of the vessel</FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="mmsi">MMSI</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="mmsi"
                      onChange={this.handleChange}
                      value={this.state.mmsi}
                    />
                    <FormText color="muted">
                      Leave blank if there is no mmsi
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="callsignVhf">Call Sign</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="callsignVhf"
                      onChange={this.handleChange}
                      value={this.state.callsignVhf}
                    />
                    <FormText color="muted">
                      Leave blank if there is no call sign
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="uuid">UUID</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="uuid"
                      onChange={this.handleChange}
                      value={this.state.uuid}
                    />
                    <FormText color="muted">Ignored if MMSI is set</FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="aisShipType">Ship Type</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="select"
                      name="aisShipType"
                      value={this.state.aisShipType}
                      onChange={this.handleChange}
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
                      <option value="81">
                        Tanker carrying dangerous goods
                      </option>
                      <option value="82">Tanker hazard cat B</option>
                      <option value="83">Tanker hazard cat C</option>
                      <option value="84">Tanker hazard cat D</option>
                      <option value="89">
                        Tanker (no additional information)
                      </option>
                      <option value="90">Other</option>
                      <option value="91">Other carrying dangerous goods</option>
                      <option value="92">Other hazard cat B</option>
                      <option value="93">Other hazard cat C</option>
                      <option value="94">Other hazard cat D</option>
                      <option value="99">
                        Other (no additional information)
                      </option>
                    </Input>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="draft">Draft</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="draft"
                      onChange={this.handleChange}
                      value={this.state.draft}
                    />
                    <FormText color="muted">
                      The maximum draft in meters of the vessel
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="length">Length</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="length"
                      onChange={this.handleChange}
                      value={this.state.length}
                    />
                    <FormText color="muted">
                      The overall length of the vessel in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="beam">Beam</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="beam"
                      onChange={this.handleChange}
                      value={this.state.beam}
                    />
                    <FormText color="muted">
                      The beam of the vessel in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="height">Height</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="height"
                      onChange={this.handleChange}
                      value={this.state.height}
                    />
                    <FormText color="muted">
                      The total height of the vessel in meters{' '}
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="gpsFromBow">GPS Distance From Bow</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="gpsFromBow"
                      onChange={this.handleChange}
                      value={this.state.gpsFromBow}
                    />
                    <FormText color="muted">
                      The distance of the gps receiver from the bow in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md="2">
                    <Label htmlFor="gpsFromCenter">
                      GPS Distance From Center
                    </Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="gpsFromCenter"
                      onChange={this.handleChange}
                      value={this.state.gpsFromCenter}
                    />
                    <FormText color="muted">
                      The distance from the center of vessel of the gps receiver
                      in meters
                    </FormText>
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Button size="sm" color="primary" onClick={this.handleSaveVessel}>
                <i className="fa fa-dot-circle-o" /> Save
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

export default connect()(VesselConfiguration)
