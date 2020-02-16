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
                onSubmit={e => { e.preventDefault()}}
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
               Enter the appropriate debug keys to enable debug logging. Multiple entries should be separated by a comma.
               For example: <code>signalk-server*,signalk-provider-tcp</code>
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

class LogList extends Component {
  componentDidMount() {
    this.end.scrollIntoView()
  }

  render() {
    return (
        <div style={{'overflowY': 'scroll', 'maxHeight': '60vh', border: '1px solid', padding: '5px', 'font-family': 'monospace'}} >
      {this.props.value.entries && this.props.value.entries.map((logEntry, index) => {
            return <PureLogRow key={logEntry.i} log={logEntry.d}/>
        })
       }
        <div ref={(el) => { this.end = el}}>&nbsp;</div>
      </div>
    )
  }
}

class PureLogRow extends React.PureComponent {
  render() {
    return <span>{ ReactHtmlParser(this.props.log) }<br/></span>
  }
}

export default connect(({log, webSocket}) => ({log, webSocket}))(ServerLogs)
