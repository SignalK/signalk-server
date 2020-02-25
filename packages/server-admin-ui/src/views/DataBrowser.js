import React, { Component } from 'react'
import { connect } from 'react-redux'
import { keys } from 'lodash'
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
      data: {},
      context: 'none',
      search: ''
    }

    this.fetchRoot = fetchRoot.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleContextChange = this.handleContextChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
  }

  handleMessage(msg) {
    if ( msg.updates ) {
      const key = msg.context === this.state.webSocket.skSelf ? 'self' : msg.context

      let isNew = false
      if ( !this.state.data[key] ) {
        this.state.data[key] = {}
        isNew = true
      }

      //if ( this.state.context && this.state.context === key )
      {
        let context = this.state.data[key]
      
        msg.updates.forEach(update => {
          if ( update.values ) {
            update.values.forEach(vp => {
              /*if ( vp.path === '' ) {
                context = { ...context, ...vp.value }
                this.state.data[msg.context] = context
                } else*/
              if ( vp.path !== '' ) {
                context[vp.path + '$' + update['$source']] = {
                  path: vp.path,
                  source: update['$source'],
                  value: vp.value,
                  timestamp: update.timestamp
              }
              }
            })
          }
        })
      }
      if ( isNew || (this.state.context && this.state.context === key) ) {
        this.setState({...this.state, hasData:true, data: this.state.data })
      }
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
    //this.fetchRoot()
    this.subscribeToDataIfNeeded()
  }

  componentDidUpdate() {
    this.subscribeToDataIfNeeded()
  }
  
  componentWillUnmount () {
    this.unsubscribeToData()
  }

  handleContextChange(event) {
    this.setState({...this.state, context: event.target.value})
  }

  handleSearch(event) {
    this.setState({...this.state, search: event.target.value})
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
          <Col xs='6' md='6'>
          <Input
            type='select'
            value={this.state.context}
            name='context'
            onChange={this.handleContextChange}
          >
            <option value="none">Select a context</option>
            {keys(this.state.data).sort().map(key => {
              return (
                  <option key={key} value={key}>{key}</option>
              )
            })}
          </Input>
          </Col>
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
<FormGroup row>
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Search</Label>
          </Col>
          <Col xs='12' md='12'>
            <Input
              type='text'
              name='search'
              onChange={this.handleSearch}
              value={this.state.search}
            />
          </Col>
          </FormGroup>
          
          <Table hover responsive bordered striped size='sm'>
                <thead>
                  <tr>
                  <th>Path</th>
                  <th>Value</th>
                  <th>Timestamp</th>
                  <th>Source</th>
                  </tr>
                </thead>
          <tbody>

        {this.state.context && this.state.contect != 'none' && keys(this.state.data[this.state.context]).filter(key => { return !this.state.search || this.state.search.length === 0 || key.indexOf(this.state.search) !== -1 }).sort().map(key => {
          let data = this.state.data[this.state.context][key]
          return (
                 <tr key={key} >
                   <td>{data.path}</td>
                   <td><code>{JSON.stringify(data.value)}</code></td>
                   <td>{data.timestamp}</td>
                   <td>{data.source}</td>
                 </tr>
               )
        })}
        
          </tbody>
          </Table>
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
