import React, { Component } from 'react'
import { connect } from 'react-redux'
import JSONTree from 'react-json-tree'
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

function fetchRoot () {
  fetch(`/signalk/v1/api/`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      let self
      if ( data.self ) {
        self = data.self.substring('vessels.'.length)
        if ( data.vessels[self] ) {
          data.vessels.self = data.vessels[self]
          delete data.vessels[self]
          delete data.self
        }
      }
      delete data.version
      this.setState({ data: data, self:self, hasData: true })
    })
}


class DataBrowser extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false,
      webSocket: null,
      didSubScribe: false,
      pause: false,
      data: {}
    }

    this.fetchRoot = fetchRoot.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleRememberDebug = this.handleRememberDebug.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
  }

  handleMessagex(msg) {
    this.state.data.hello = "world"
    this.setState({...this.state, data: this.state.data})
  }
  
  handleMessage(msg) {
    if ( msg.updates ) {
      const idx = msg.context.indexOf('.')
      const rootKey = msg.context.substring(0, idx)
      let urn = msg.context.substring(idx+1)
      let root

      let isSelf = false
      if ( rootKey === 'vessels' && urn === this.state.self ) {
        isSelf = true
        urn = 'self'
      }
      
      if ( !this.state.data[rootKey] ) {
        this.state.data[rootKey] = {}
      } else {
        this.state.data[rootKey] = { ...this.state.data[rootKey] }
      }

      if ( !this.state.data[rootKey][urn] ) {
        root = {}
        this.state.data[rootKey][urn] = root
      } else {
        this.state.data[rootKey][urn] = { ...this.state.data[rootKey][urn] }
        root = this.state.data[rootKey][urn]
      }
      
      msg.updates.forEach(update => {
        if ( update.values ) {
          update.values.forEach(vp => {
            if ( vp.path === '' ) {
              root = { ...root, ...vp.value }
              this.state.data[rootKey][urn] = root
            } else {
              const parts = vp.path.split('.')
              let last = root
              for (const i in parts) {
                const p = parts[i]
                
                if (typeof last[p] === 'undefined') {
                  last[p] = {}
                } else {
                  last[p] = { ...last[p] }
                }
                last = last[p]
              }
              if ( last.values ||
                   (last['$source'] &&
                    update['$source'] &&
                    last['$source'] != update['$source']) ) {
                if ( !last.values ) {
                  last.values = {}
                } else {
                  last.values = { ...last.values }
                }
                last.values[update['$source']] = {
                  value: vp.value,
                  timestamp: update.timestamp
                }
              }

              last.value = vp.value
              last.timestamp = update.timestamp
              last['$source'] = update['$source']
            }
          })
        }
      })
      this.setState({...this.state, hasData:true, data: { ...this.state.data } })
    }
  }

  subscribeToDataIfNeeded() {
    if ( !this.state.pause && this.props.webSocket && (this.props.webSocket != this.state.webSocket ||  this.state.didSubScribe === false) ) {

      const sub = {
        context: '*',
        subscribe: [{
          path: "*",
          period: 2000
        }]
      }
      
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubScribe = true
      this.state.webSocket.messageHandler = this.handleMessage
    }
  }

  unsubscribeToData() {
    if ( this.props.webSocket ) {
      const sub = {
        context: '*',
        unsubscribe: [{
          path: "*"
        }]
      }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.didSubScribe = false
      this.state.webSocket.messageHandler = null
    }
  }
  
  componentDidMount() {
    this.fetchRoot()
    this.subscribeToDataIfNeeded()
  }

  componentDidUpdate() {
    this.subscribeToDataIfNeeded()
  }
  
  componentWillUnmount () {
    this.unsubscribeToData()
  }

  handleRememberDebug (event) {
    this.fetchRoot()
  }

  handlePause (event) {
    this.state.pause = event.target.checked
    this.setState(this.state)
    if ( this.state.pause ) {
      this.unsubscribeToData()
    } else {
      this.fetchRoot()
      this.subscribeToDataIfNeeded()
    }
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
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Pause</Label>
          </Col>
          <Col xs='6' md='3'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Pause"
                                name='pause'
                                className='switch-input'
                                onChange={this.handlePause}
                                checked={this.state.pause}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
                              </Label>
          </Col>
          </FormGroup>

          <JSONTree data={this.state.data} theme="default" hideRoot sortObjectKeys />
        
              </Form>
            </CardBody>
            <CardFooter>
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

export default connect(({webSocket}) => ({webSocket}))(DataBrowser)
