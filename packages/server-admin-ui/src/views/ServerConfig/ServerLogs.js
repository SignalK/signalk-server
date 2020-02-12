import React, { Component } from 'react'
import ReactHtmlParser from 'react-html-parser'
import { connect } from 'react-redux'
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

class ServerLogs extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: true,
      webSocket: null,
      didSubScribe: false
    }

    this.handleDebug = this.handleDebug.bind(this)
  }

  subscribeToLogsIfNeeded() {
     if ( this.props.webSocket && (this.props.webSocket != this.state.webSocket ||  this.state.didSubScribe === false) ) {
      const sub = { "context": "vessels.self", "subscribe": [ { "path": "log" } ] }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubScribe = true
    }
  }

  componentDidMount() {
    this.subscribeToLogsIfNeeded()
  }

  componentDidUpdate() {
    this.subscribeToLogsIfNeeded()
  }
  
  componentWillUnmount () {
    if ( this.props.webSocket ) {
      const sub = { "context": "vessels.self", "unsubscribe": [ { "path": "log" } ] }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.didSubScribe = false
    }
  }

  handleDebug (event) {
    fetch(`${window.serverRoutesPrefix}/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: event.target.value }),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        //this.props.log.debugEnabled = event.target.value
      })
  }

  handleRememberDebug (event) {
    fetch(`${window.serverRoutesPrefix}/rememberDebug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: event.target.checked }),
      credentials: 'include'
    })
      .then(response => response.text())
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
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Debug</Label>
          </Col>
          <Col xs='12' md='12'>
            <Input
              type='text'
              name='debug'
              onChange={this.handleDebug}
                value={this.props.log.debugEnabled}
            />
            <FormText color='muted'>
               Enter the name of the component to debug. Mulitple entries should be separated by a comma.
               For example: signalk-server*,signalk-provider-tcp
            </FormText>
          </Col>
          </FormGroup>
<FormGroup row>
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Remember Debug</Label>
          </Col>
          <Col xs='6' md='3'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Enabled"
                                name='debug'
                                className='switch-input'
                                onChange={this.handleRememberDebug}
                                checked={this.props.log.rememberDebug}
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
          
          <LogList value={this.props.log} />
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

class LogListX extends Component {
  render() {
    return (
      <Table hover responsive bordered striped size="sm">
            <thead>
                <tr>
                <th>Log</th>
              </tr>
            </thead>
            <tbody>

      {this.props.value.entries && this.props.value.entries.map((log, index) => {
            return (
                <tr key={index}>
                <td>{ ReactHtmlParser(log) }</td>
                </tr>
            )
            })
            }
      
            </tbody>
          </Table>
    )
  }
}

class LogList extends Component {
  componentDidMount() {
    this.end.scrollIntoView({ behavior: "smooth" })
  }

  render() {
    return (
        <div style={{'overflow-y': 'scroll', 'maxHeight': '60vh'}} >
      {this.props.value.entries && this.props.value.entries.map((log, index) => {
            return ReactHtmlParser(log + '</br>') 
        })
       }
        <div ref={(el) => { this.end = el}}></div>
      </div>
    )
  }
}

export default connect(({log, webSocket}) => ({log, webSocket}))(ServerLogs)
