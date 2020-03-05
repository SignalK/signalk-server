import React, { Component } from 'react'
import { connect } from 'react-redux'
import { keys, get } from 'lodash'
import {
  Badge,
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

class Playground extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: true,
      data: [],
      input: localStorage.getItem('lastPlaygroundInput') || '',
      sendToServer: localStorage.getItem('lastPlaygroundSend') === 'true'
    }

    this.handleExecute = this.handleExecute.bind(this)
    this.handleInput = this.handleInput.bind(this)
    this.handleSendToServer = this.handleSendToServer.bind(this)
  }

  handleInput(event) {
    this.setState({...this.state, input: event.target.value})
    localStorage.setItem('lastPlaygroundInput', this.state.input)
  }

  handleSendToServer(event) {
    this.setState({...this.state, sendToServer: event.target.checked})
    localStorage.setItem('lastPlaygroundSend', event.target.checked)
  }

  handleExecute(event) {
    const body = { value: this.state.input, sendToServer: this.state.sendToServer }
    localStorage.setItem('lastPlaygroundInput', this.state.input)
    fetch(`/skServer/inputTest`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })
      .then(response => response.json())
      .then(data => {
        if ( data.error ) {
          this.setState({ ...this.state, data: [], error:data.error})
        } else {
          this.state.error = null
          this.setState(this.state)
          const values = []
          data.forEach(delta => {
            if ( !delta.context ) {
              delta.context = 'vessels.self'
            }
            if ( delta.updates ) {
              delta.updates.forEach(update => {
                if ( update.values ) {
                  update.values.forEach(vp => {
                    if ( vp.path === '' ) {
                      keys(vp.value).forEach(k => {
                        values.push({
                          path: k,
                          value: vp.value[k],
                          context: delta.context,
                          timestamp: update.timestamp
                        })
                      })
                    } else {
                      values.push({
                        path: vp.path,
                        value: vp.value,
                        context: delta.context,
                        timestamp: update.timestamp
                      })
                    }
                  })
                }
              })
            }
          })
          this.setState({ ...this.state, data: values})
        }
      })
    .catch(error => {
      console.error (error)
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
                onSubmit={e => { e.preventDefault()}}
          >

          <FormGroup row>
          <Col xs='8' md='4'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="SendToServer"
                                name='sendToServer'
                                className='switch-input'
                                onChange={this.handleSendToServer}
                                checked={this.state.sendToServer}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
                              </Label>{' '}Send To Server
          </Col>
          </FormGroup>
          <FormGroup row>
          <Col xs='3' md='2'>
          <Label htmlFor='select'>Input</Label>
          </Col>
          <Col xs='12' md='12'>
          <FormText color='muted'>
          You can enter multi-line raw NMEA 2000, NMEA 0183 or Signal K deltas (one delta or an array)
            </FormText>
            <Input
              type='textarea'
              name='input'
              rows='12'
              onChange={this.handleInput}
              value={this.state.input}
            />
          </Col>
              </FormGroup>

               
             </Form>
          </CardBody>
          <CardFooter>
            <Button size='sm' color='primary' onClick={this.handleExecute}>
              <i className='fa fa-plus-circle' /> Play
        </Button>{' '}
          {this.state.error && (
              <p className="text-danger float-right">{this.state.error}</p>
          )}
          </CardFooter>
          </Card>

        { this.state.data.length > 0 && (
          <Card>
          <CardBody>


            <Table responsive bordered striped size='sm'>
              <thead>
              <tr>
                <th>Path</th>
                <th>Value</th>
                <th>Context</th>
                <th>Timestamp</th>
              </tr>
              </thead >
              <tbody>

          {this.state.data.map(data => {
          const formatted = JSON.stringify(data.value, null, typeof data.value === 'object' && keys(data.value).length > 1 ? 2 : 0)
            const path = data.path
            const key = `${data.path}${data.context}`

          return (
                 <tr key={key} >
                   <td>{data.path}</td>
                   <td><pre className='text-primary' style={{"whiteSpace": "pre-wrap"}}>{formatted}</pre></td>
                   <td>{data.context}</td>
                   <td>{data.timestamp}</td>
                 </tr>
               )
          })}
       
          </tbody>
          </Table>
          </CardBody>
        </Card>
        )}        
        
        </div>
      )
    )
  }
}

export default connect(({}) => ({}))(Playground)
