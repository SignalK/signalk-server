import React, { Component, useState } from 'react'
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
  Row,
  TabContent,
  TabPane,
  Nav,
  NavItem,
  NavLink
} from 'reactstrap'
import classnames from 'classnames';
//import { Tabs, Tab, TabList, TabPanel } from 'react-tabs'
//import 'react-tabs/style/react-tabs.css';

import moment from 'moment'
import jsonlint from 'jsonlint-mod'

const timestampFormat = 'MM/DD HH:mm:ss'
const inputStorageKey = 'admin.v1.playground.input'

class Playground extends Component {
  constructor (props) {
    super(props)
    const input = localStorage.getItem(inputStorageKey) || ''
    this.state = {
      hasData: true,
      data: [],
      deltas: [],
      n2kJson: [],
      input,
      inputIsJson: isJson(input),
      sending: false,
      activeTab: '1'
    }

    this.handleExecute = this.handleExecute.bind(this)
    this.handleInput = this.handleInput.bind(this)
    this.send = this.send.bind(this)
    this.beautify = this.beautify.bind(this)
  }

  handleInput(event) {
    this.setState({
      ...this.state,
      input: event.target.value,
      inputIsJson: isJson(event.target.value)
    })
    localStorage.setItem(inputStorageKey, event.target.value)
    if ( this.inputWaitTimeout ) {
      clearTimeout(this.inputWaitTimeout)
    }
    this.inputWaitTimeout = setTimeout(() => {
      if ( this.state.input.length > 0 ) {
        this.send(false)
      }
    }, 500)
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
    try {
      jsonlint.parse(this.state.input)
      const text = JSON.stringify(JSON.parse(this.state.input), null, 2)
      this.setState({...this.state, input: text, jsonError: null})
    } catch (error) {
      this.setState({ ...this.state, data: [], deltas:[], putResults: [], n2kJson: [], jsonError: null, error: 'invalid json', jsonError: error.message, activeTab: '5'})
    }
  }

  send(sendToServer) {
    let start =  this.state.input.trim().charAt(0)
    if ( start === '{' || start === '[' ) {
      try {
        jsonlint.parse(this.state.input)
      } catch (error) {
        this.setState({ ...this.state, data: [], deltas:[], putResults: [], n2kJson: [], error: 'invalid json', jsonError: error.message, activeTab: '5'})
      return
      }
    }
    
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
          this.setState({ ...this.state, data: [], deltas:[], putResults: [], n2kJson: [], jsonError: null, error:data.error})
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
          this.setState({ ...this.state, data: values, deltas: data.deltas, n2kJson: data.n2kJson, putResults:data.putResults, jsonError: null })
        }
      })
    .catch(error => {
      console.error (error)
      this.setState({ ...this.state, data: [], deltas:[], putResults:[], n2kJson: [], error:error.message, jsonError: null})
      if ( sendToServer ) {
          this.setState({ ...this.state, sending:false })
        }
    })
  }

  render () {
    const toggle = (tab) => {
      this.setState({...this.state, activeTab: tab})
    }
    return (
      this.state.hasData && (
        <div className='animated fadeIn'>
          <Row>
          <Col xs='12' md='6'>
          <Card>
          <CardHeader>Input</CardHeader>
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
              rows='15'
              onChange={this.handleInput}
              value={this.state.input}
            />
          </Col>
              </FormGroup>

               
          </Form>
          </CardBody>
          <CardFooter>
        <Button
          size='sm'
          color='primary'
          className='float-left'
          disabled={!this.state.inputIsJson}
          onClick={this.beautify}>
          <i className="fa fa-dot-circle-o" /> Beautify JSON
        </Button>
        <span className='float-left' style={{paddingLeft: '10px', paddingTop: '0.25rem'}}>        {this.state.error && (
              <p className="text-danger">{this.state.error}</p>
          )}
</span>
{' '}
        <Button size='sm' color='primary' onClick={this.handleExecute} className='float-right'>
          <i className={ this.state.sending ? 'fa fa-spinner fa-spin' : 'fa fa-dot-circle-o'} /> Send To Server
        </Button>
          </CardFooter>
          </Card>
          </Col>
          <Col xs='12' md='6'>
          <Card>
          <CardHeader>Output</CardHeader>
          <CardBody>
          <Nav tabs>
           <NavItem>
          <NavLink
            className={classnames({ active: this.state.activeTab === '1' })}
            onClick={() => { toggle('1'); }}
          >
          Deltas
           </NavLink>
          </NavItem>
          { this.state.data.length > 0 && (
          <NavItem>
          <NavLink
            className={classnames({ active: this.state.activeTab === '2' })}
            onClick={() => { toggle('2'); }}
          >
              Paths
            </NavLink>
           </NavItem>
          )}
        { this.state.n2kJson && this.state.n2kJson.length > 0 && (
          <NavItem>
          <NavLink
            className={classnames({ active: this.state.activeTab === '3' })}
            onClick={() => { toggle('3'); }}
          >
            Decoded NMEA 2000
          </NavLink>
          </NavItem>
        )}
        { this.state.putResults && this.state.putResults.length > 0 && (
          <NavItem>
          <NavLink
            className={classnames({ active: this.state.activeTab === '4' })}
            onClick={() => { toggle('4'); }}
          >
            Put Results
          </NavLink>
          </NavItem>
        )}
        { this.state.jsonError && (
          <NavItem>
          <NavLink
            className={classnames({ active: this.state.activeTab === '5' })}
            onClick={() => { toggle('5'); }}
          >
            Json Lint Error
          </NavLink>
          </NavItem>
        )}
        </Nav>
        <TabContent activeTab={this.state.activeTab}>
        <TabPane tabId="1">
        { this.state.deltas.length > 0 && (
            <div style={{'overflowY': 'scroll', 'maxHeight': '60vh', border: '1px solid', padding: '5px'}} >
          <pre>{JSON.stringify(this.state.deltas, null, 2)}</pre>
          </div>
        )}
        </TabPane>

        { this.state.data.length > 0 && (
          <TabPane tabId="2">
          <div style={{'overflowY': 'scroll', 'maxHeight': '60vh'}} >
            <Table responsive bordered striped size='sm'>
              <thead>
              <tr>
                <th>Path</th>
                <th>Value</th>
                <th>Context</th>
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
                 </tr>
               )
          })}
       
          </tbody>
          </Table>
          </div>
          </TabPane>
        )}        

        { this.state.n2kJson && this.state.n2kJson.length > 0 && n2kJsonPanel(this.state.n2kJson)}

        { this.state.putResults && this.state.putResults.length > 0 && (
          <TabPane tabId="4">
            <div style={{'overflowY': 'scroll', 'maxHeight': '60vh', border: '1px solid', padding: '5px'}} >
            <pre>{JSON.stringify(this.state.putResults, null, 2)}</pre>
            </div>
          </TabPane>
        )}

        { this.state.jsonError && (
          <TabPane tabId="5">
          <div style={{'overflowY': 'scroll', 'maxHeight': '60vh', border: '1px solid', padding: '5px'}} >
            <pre>{this.state.jsonError}</pre>
            </div>
          </TabPane>
      )}        
        </TabContent>
        </CardBody>
        </Card>
        </Col>
        
          </Row>
        </div>
      )
    )
  }
}

function n2kJsonPanel(n2kData) {
  return (
    <TabPane tabId="3">
      <div style={{'overflowY': 'scroll', 'maxHeight': '60vh', border: '1px solid', padding: '5px'}} >
      <pre>{JSON.stringify(n2kData, null, 2)}</pre>
      </div>
    </TabPane>
  )
}

function isJson(input) {
  let inputIsJson = false
  try {
    JSON.parse(input)
    inputIsJson = true
  } catch (e) {}
  return inputIsJson
}

export default connect(({webSocket}) => ({webSocket}))(Playground)
