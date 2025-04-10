import React, { Component } from 'react'
import ReactHtmlParser from 'react-html-parser'
import { connect } from 'react-redux'
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
} from 'reactstrap'
import LogFiles from './Logging.js'
import Creatable from 'react-select/creatable/dist/react-select.esm.js'
import remove from 'lodash.remove'

class ServerLogs extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: true,
      webSocket: null,
      didSubScribe: false,
      pause: false,
      debugKeys: [],
    }

    this.handleDebug = this.handleDebug.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.fetchDebugKeys = this.fetchDebugKeys.bind(this)
  }

  subscribeToLogsIfNeeded() {
    if (
      !this.state.pause &&
      this.props.webSocket &&
      (this.props.webSocket != this.state.webSocket ||
        this.state.didSubScribe === false)
    ) {
      const sub = { context: 'vessels.self', subscribe: [{ path: 'log' }] }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubScribe = true
    }
  }

  unsubscribeToLogs() {
    if (this.props.webSocket) {
      const sub = { context: 'vessels.self', unsubscribe: [{ path: 'log' }] }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.didSubScribe = false
    }
  }

  fetchDebugKeys() {
    fetch(`${window.serverRoutesPrefix}/debugKeys`, {
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((debugKeys) => {
        this.setState({ debugKeys: debugKeys.sort() })
      })
  }

  componentDidMount() {
    this.subscribeToLogsIfNeeded()
    this.fetchDebugKeys()
  }

  componentDidUpdate() {
    this.subscribeToLogsIfNeeded()
  }

  componentWillUnmount() {
    this.unsubscribeToLogs()
  }

  handleDebug(event) {
    this.doHandleDebug(event.target.value)
  }

  handleDebugCheckbox(value, enabled) {
    const keysToSend =
      this.props.log.debugEnabled.length > 0
        ? this.props.log.debugEnabled.split(',')
        : []
    if (enabled) {
      keysToSend.push(value)
    } else {
      remove(keysToSend, (v) => v === value)
    }
    this.doHandleDebug(keysToSend.toString())
  }

  doHandleDebug(value) {
    fetch(`${window.serverRoutesPrefix}/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
      credentials: 'include',
    }).then((response) => response.text())
  }

  handleRememberDebug(event) {
    fetch(`${window.serverRoutesPrefix}/rememberDebug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: event.target.checked }),
      credentials: 'include',
    }).then((response) => response.text())
  }

  handlePause(event) {
    this.state.pause = event.target.checked
    this.setState(this.state)
    if (this.state.pause) {
      this.unsubscribeToLogs()
    } else {
      this.subscribeToLogsIfNeeded()
    }
  }

  render() {
    return (
      this.state.hasData && (
        <div className="animated fadeIn">
          <Card>
            <CardHeader>
              <i className="fa fa-align-justify" />
              <strong>Server Log</strong>
            </CardHeader>

            <CardBody>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
                onSubmit={(e) => {
                  e.preventDefault()
                }}
              >
                <FormGroup row>
                  <Col>
                    <Creatable
                      isMulti
                      options={this.state.debugKeys.map((key) => ({
                        label: key,
                        value: key,
                      }))}
                      value={
                        this.props.log.debugEnabled
                          ? this.props.log.debugEnabled
                              .split(',')
                              .map((value) => ({ label: value, value }))
                          : null
                      }
                      onChange={(v) => {
                        const value =
                          v !== null
                            ? v.map(({ value }) => value).join(',')
                            : ''
                        this.doHandleDebug(value)
                      }}
                    />
                    <FormText color="muted" style={{ marginBottom: '15px' }}>
                      Select the appropriate debug keys to activate debug
                      logging for various components on the server.
                    </FormText>
                  </Col>
                </FormGroup>
                <FormGroup row>
                  <Col xs="6" md="6">
                    Persist debug settings over server restarts{' '}
                    <Label className="switch switch-text switch-primary">
                      <Input
                        type="checkbox"
                        id="Enabled"
                        name="debug"
                        className="switch-input"
                        onChange={this.handleRememberDebug}
                        checked={this.props.log.rememberDebug}
                      />
                      <span
                        className="switch-label"
                        data-on="Yes"
                        data-off="No"
                      />
                      <span className="switch-handle" />
                    </Label>
                  </Col>
                  <Col xs="6" md="6">
                    Pause the log window{' '}
                    <Label className="switch switch-text switch-primary">
                      <Input
                        type="checkbox"
                        id="Pause"
                        name="pause"
                        className="switch-input"
                        onChange={this.handlePause}
                        checked={this.state.pause}
                      />
                      <span
                        className="switch-label"
                        data-on="Yes"
                        data-off="No"
                      />
                      <span className="switch-handle" />
                    </Label>
                  </Col>
                </FormGroup>
                <LogList value={this.props.log} />
              </Form>
            </CardBody>
          </Card>
          <LogFiles />
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
      <div
        style={{
          overflowY: 'scroll',
          maxHeight: '60vh',
          border: '1px solid',
          padding: '5px',
          fontFamily: 'monospace',
        }}
      >
        {this.props.value.entries &&
          this.props.value.entries.map((logEntry) => {
            return <PureLogRow key={logEntry.i} log={logEntry.d} />
          })}
        <div
          ref={(el) => {
            this.end = el
          }}
        >
          &nbsp;
        </div>
      </div>
    )
  }
}

class PureLogRow extends React.PureComponent {
  render() {
    return (
      <span>
        {ReactHtmlParser(this.props.log)}
        <br />
      </span>
    )
  }
}

export default connect(({ log, webSocket }) => ({ log, webSocket }))(ServerLogs)
