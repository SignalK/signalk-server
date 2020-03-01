import React, { Component } from 'react'
import { connect } from 'react-redux'
import { keys, get } from 'lodash'
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
      this.setState({ ...this.state, sources: data.sources, full: data})
    })
}


class DataBrowser extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false,
      webSocket: null,
      didSubscribe: false,
      pause: false,
      includeMeta: false,
      data: {},
      context: 'none',
      search: ''
    }

    this.fetchRoot = fetchRoot.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleContextChange = this.handleContextChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
    this.handleMeta = this.handleMeta.bind(this)
  }

  handleMessage(msg) {

    if ( this.state.pause ) {
      return
    }
    
    if ( msg.context && msg.updates ) {
      const key = msg.context === this.state.webSocket.skSelf ? 'self' : msg.context

      let isNew = false
      if ( !this.state.data[key] ) {
        this.state.data[key] = {}
        isNew = true
      }

      let context = this.state.data[key]
      
      msg.updates.forEach(update => {
        if ( update.values ) {
          update.values.forEach(vp => {
            if ( vp.path === '' ) {
              keys(vp.value).forEach(k => {
                context[k] = {
                  path: k,
                  value: vp.value[k],
                  source: update['$source'],
                  timestamp: update.timestamp
                }
              })
            } else {
              context[vp.path + '$' + update['$source']] = {
                path: vp.path,
                source: update['$source'],
                value: vp.value,
                timestamp: update.timestamp
              }
              
              const metaKey = vp.path + '.meta'
              if ( !context[metaKey] ) {
                const idx = msg.context.indexOf('.')
                const rootKey = msg.context.substring(0, idx)
                let urn = msg.context.substring(idx+1)
                if ( this.state.full &&
                     this.state.full[rootKey] &&
                     this.state.full[rootKey][urn] ) {
                  const meta = get(this.state.full[rootKey][urn], metaKey)
                  if ( meta ) {
                    context[metaKey] = {
                      path: metaKey,
                      value: meta
                      }
                  }
                }
              }
            }
          })
        }
      })
      
      if ( isNew || (this.state.context && this.state.context === key) ) {
        this.setState({...this.state, hasData:true, data: this.state.data })
      }
    }
  }

  subscribeToDataIfNeeded() {
    if ( !this.state.pause && this.props.webSocket && (this.props.webSocket != this.state.webSocket ||  this.state.didSubscribe === false) ) {

      const sub = {
        context: '*',
        subscribe: [{
          path: "*",
          period: 2000
        }]
      }
      
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubscribe = true
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
      this.state.didSubscribe = false
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

  handleContextChange(event) {
    this.setState({...this.state, context: event.target.value})
  }

  handleSearch(event) {
    this.setState({...this.state, search: event.target.value})
  }

  handleMeta(event) {
    this.setState({...this.state, includeMeta: event.target.checked})
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
          <Col xs='12' md='4'>
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
          <Col xs='8' md='2'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Meta"
                                name='meta'
                                className='switch-input'
                                onChange={this.handleMeta}
                                checked={this.state.includeMeta}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
                              </Label>{' '}Meta Data
          </Col>
          <Col xs='8' md='2'>
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
          </Label>{' '}Pause
          </Col>
          </FormGroup>
          { this.state.context && this.state.context !== 'none' &&  (
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
          )}

        { !this.state.includeMeta && this.state.context && this.state.context !== 'none' && (
            <Table responsive bordered striped size='sm'>
              <thead>
              <tr>
                <th>Path</th>
                <th>Value</th>
                <th>Units</th>
                <th>Timestamp</th>
                <th>Source</th>
              </tr>
              </thead >
              <tbody>

          {keys(this.state.data[this.state.context]).filter(key => { return !this.state.search || this.state.search.length === 0 || key.indexOf(this.state.search) !== -1 }).filter(key => { return !key.endsWith('.meta') }).sort().map(key => {
          const data = this.state.data[this.state.context][key]
          const formatted = JSON.stringify(data.value, null, typeof data.value === 'object' && keys(data.value).length > 1 ? 2 : 0)
          const meta = this.state.data[this.state.context][data.path + '.meta']
          const units = meta && meta.value.units ? meta.value.units : ''
          const path = key.substring(0, key.lastIndexOf('.'))

          return (
                 <tr key={key} >
                   <td>{data.path}</td>
                   <td><pre className='text-primary' style={{"whiteSpace": "pre-wrap"}}>{formatted}</pre></td>
                   <td>{units}</td>
                   <td>{data.timestamp}</td>
                   <td>{data.source}</td>
                 </tr>
               )
          })}
       
          </tbody>
          </Table>

        )}
        
        {this.state.includeMeta && this.state.context && this.state.context !== 'none' && (
          <Table responsive bordered striped size='sm'>
            <thead>
              <tr>
              <th>Path</th>
              <th>Meta</th>
              </tr>
            </thead>
            <tbody>
            {keys(this.state.data[this.state.context]).filter(key => { return key.endsWith('.meta') && ( !this.state.search || this.state.search.length === 0 || key.indexOf(this.state.search) !== -1) }).sort().map(key => {
          const data = this.state.data[this.state.context][key]
          const formatted = JSON.stringify(data.value, null, 2)
          const path = data.path.substring(0, key.lastIndexOf('.'))
          return (
                 <tr key={path} >
                   <td>{path}</td>
              <td><pre className='text-primary' style={{"whiteSpace": "pre-wrap"}}>{formatted}</pre></td>
                 </tr>
               )
            })}
          </tbody>
            </Table>
          )}
         
             </Form>
            </CardBody>
          </Card>

          <Card>
          <CardHeader>Sources</CardHeader>
          <CardBody>

          <JSONTree data={this.state.sources} theme="default" sortObjectKeys hideRoot="true" />

          </CardBody>
        </Card>
        </div>
      )
    )
  }
}

export default connect(({webSocket}) => ({webSocket}))(DataBrowser)
