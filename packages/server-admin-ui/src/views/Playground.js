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
  Table,
  Row
} from 'reactstrap'
import moment from 'moment'

const timestampFormat = 'MM/DD HH:mm:ss'
const inputStorageKey = 'admin.v1.playground.input'

class Playground extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: true,
      data: [],
      deltas: [],
      n2kJson: [],
      input: localStorage.getItem(inputStorageKey) || '',
      sending: false
    }

    this.handleExecute = this.handleExecute.bind(this)
    this.handleInput = this.handleInput.bind(this)
    this.send = this.send.bind(this)
    this.beautify = this.beautify.bind(this)
  }

  handleInput(event) {
    this.setState({...this.state, input: event.target.value})
    localStorage.setItem(inputStorageKey, this.state.input)
    if ( this.inputWaitTimeout ) {
      clearTimeout(this.inputWaitTimeout)
    }
    this.inputWaitTimeout = setTimeout(() => {
      if ( this.state.input.length > 0 ) {
        this.send(false)
      }
    }, 2000)
  }

  handleExecute(event) {
    this.send(true)
  }

  componentDidMount() {
    if ( this.state.input && this.state.input.length > 0 ) {
      this.send(false)
    }
  }

  beautify() {
    const text = JSON.stringify(JSON.parse(this.state.input), null, 2)
    this.setState({...this.state, input: text})
  }

  send(sendToServer) {
    const body = { value: this.state.input, sendToServer }
    localStorage.setItem(inputStorageKey, this.state.input)
    if ( sendToServer ) {
      this.setState({...this.state, sending: true})
    }
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
        if ( sendToServer ) {
          setTimeout(() => {
            this.setState({ ...this.state, sending:false })
          }, 1000)
        }
        if ( data.error ) {
          this.setState({ ...this.state, data: [], deltas:[], n2kJson: [], error:data.error})
        } else {
          this.state.error = null
          this.setState(this.state)
          const values = []
          data.deltas.forEach(delta => {
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
                          timestamp: moment(update.timestamp).format(timestampFormat)
                        })
                      })
                    } else {
                      values.push({
                        path: vp.path,
                        value: vp.value,
                        context: delta.context,
                        timestamp: moment(update.timestamp).format(timestampFormat)
                      })
                    }
                  })
                }
              })
            }
          })
          this.setState({ ...this.state, data: values, deltas: data.deltas, n2kJson: data.n2kJson })
        }
      })
    .catch(error => {
      console.error (error)
      this.setState({ ...this.state, data: [], deltas:[], n2kJson: [], error:error.message})
      if ( sendToServer ) {
          this.setState({ ...this.state, sending:false })
        }
    })
  }

  render () {
    return (
      this.state.hasData && (
        <div className='animated fadeIn'>
          <Card>
          <CardBody>
          <Row>
          <Col xs='12' md='6'>
          <Card>
          <CardHeader>Input<p className="float-right">
        <Button size='sm' color='primary' onClick={this.handleExecute}>
          <i className={ this.state.sending ? 'fa fa-spinner fa-spin' : 'fa fa-dot-circle-o'} /> Send To Server
        </Button>{' '}
                <Button size='sm' color='primary' onClick={this.beautify}>
          <i className="fa fa-dot-circle-o" /> Beautify JSON
        </Button>
          </p>
        </CardHeader>
           <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
                onSubmit={e => { e.preventDefault()}}
          >

          <FormGroup row>
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
          </Card>
          </Col>
          <Col xs='12' md='6'>
        { this.state.data.length > 0 && (        
          <Card>
           <CardHeader>Deltas</CardHeader>
           <CardBody>
           <pre>{JSON.stringify(this.state.deltas, null, 2)}</pre>
           </CardBody>
         </Card>
        )}
        </Col>
        
          </Row>
          </CardBody>
          <CardFooter>
            
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

        { this.state.n2kJson && this.state.n2kJson.length > 0 && (
         <Card>
           <CardHeader>N2K Json</CardHeader>
           <CardBody>
           <pre>{JSON.stringify(this.state.n2kJson, null, 2)}</pre>
           </CardBody>
         </Card>
        )}
          
        </div>
      )
    )
  }
}

export default connect(({}) => ({}))(Playground)
