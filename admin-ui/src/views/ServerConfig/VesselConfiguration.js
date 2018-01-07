import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  InputGroup,
  InputGroupAddon,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Table
} from 'reactstrap'

function fetchVessel () {
  fetch(`/vessel`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState({ ...data, hasData: true })
    })
}

class VesselConfiguration extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false
    }

    this.fetchVessel = fetchVessel.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSaveVessel = this.handleSaveVessel.bind(this)
  }

  componentDidMount () {
    this.fetchVessel()
  }

  handleChange (event) {
    console.log(event)
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleSaveVessel () {
    fetch(`/vessel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        alert(response)
      })
  }

  render () {
    return (
      this.state.hasData && (
        <div className='animated fadeIn'>
          <Card>
            <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
              >
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='name'>Name</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='name'
                      onChange={this.handleChange}
                      value={this.state.name}
                    />
                    <FormText color='muted'>The name of the vessel</FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='mmsi'>MMSI</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='mmsi'
                      onChange={this.handleChange}
                      value={this.state.mmsi}
                    />
                    <FormText color='muted'>
                      Leave blank if there is no mmsi
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='uuid'>UUID</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='uuid'
                      onChange={this.handleChange}
                      value={this.state.uuid}
                    />
                    <FormText color='muted'>Ignored if MMSI is set</FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='draft'>Draft</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='draft'
                      onChange={this.handleChange}
                      value={this.state.draft}
                    />
                    <FormText color='muted'>
                      The maximum draft in meters of the vessel
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='length'>Length</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='length'
                      onChange={this.handleChange}
                      value={this.state.length}
                    />
                    <FormText color='muted'>
                      The overall length of the vessel in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='beam'>Beam</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='beam'
                      onChange={this.handleChange}
                      value={this.state.beam}
                    />
                    <FormText color='muted'>
                      The beam of the vessel in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='height'>Height</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='height'
                      onChange={this.handleChange}
                      value={this.state.height}
                    />
                    <FormText color='muted'>
                      The total height of the vessel in meters{' '}
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='gpsFromBow'>GPS Distance From Bow</Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='gpsFromBow'
                      onChange={this.handleChange}
                      value={this.state.gpsFromBow}
                    />
                    <FormText color='muted'>
                      The distance of the gps receiver from the bow in meters
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col md='2'>
                    <Label htmlFor='gpsFromCenter'>
                      GPS Distance From Center
                    </Label>
                  </Col>
                  <Col xs='12' md='4'>
                    <Input
                      type='text'
                      name='gpsFromCenter'
                      onChange={this.handleChange}
                      value={this.state.gpsFromCenter}
                    />
                    <FormText color='muted'>
                      The distance from the center of vessel of the gps receiver
                      in meters
                    </FormText>
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Button size='sm' color='primary' onClick={this.handleSaveVessel}>
                <i className='fa fa-dot-circle-o' /> Save
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

export default connect()(VesselConfiguration)
