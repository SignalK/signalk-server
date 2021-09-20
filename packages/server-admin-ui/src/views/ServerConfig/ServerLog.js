import React, { Component } from 'react'
import ReactHtmlParser from 'react-html-parser'
import { connect } from 'react-redux'
import {
  Card,
  CardBody,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
} from 'reactstrap'

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
      _.remove(keysToSend, (v) => v === value)
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
    const activeDebugKeys = this.props.log.debugEnabled.split(',')
    return (
      this.state.hasData && (
        <div className="animated fadeIn">
          <Card>
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
                  <Col xs="1" md="1">
                    <Label htmlFor="select">Debug</Label>
                  </Col>

                  <Col xs="6" md="6">
                    <Input
                      type="text"
                      name="debug"
                      onChange={this.handleDebug}
                      value={this.props.log.debugEnabled}
                    />
                    <FormText color="muted" style={{ marginBottom: '15px' }}>
                      Enter the appropriate debug keys to enable debug logging.
                      Multiple entries should be separated by a comma. For
                      example: <code>signalk-server*,signalk-provider-tcp</code>
                      . You can also activate individual debug keys on the
                      right.
                    </FormText>
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
                    </Label>{' '}
                    Remember debug setting
                  </Col>

                  <Col xs="5" md="5">
                    <div
                      style={{
                        overflow: 'scroll',
                        maxHeight: '30vh',
                        borderStyle: 'solid',
                        borderWidth: '0.5px',
                        borderColor: 'lightgray',
                        padding: '8px',
                      }}
                    >
                      {this.state.debugKeys.map((key, i) => (
                        <div key={i}>
                          <Label className="switch switch-text switch-primary">
                            <Input
                              type="checkbox"
                              id={key}
                              name={key}
                              className="switch-input"
                              onChange={(e) => {
                                this.handleDebugCheckbox(
                                  key,
                                  activeDebugKeys.indexOf(key) === -1
                                )
                              }}
                              checked={activeDebugKeys.indexOf(key) >= 0}
                            />
                            <span
                              className="switch-label"
                              data-on="Yes"
                              data-off="No"
                            />
                            <span className="switch-handle" />
                          </Label>{' '}
                          {key}
                        </div>
                      ))}
                    </div>
                  </Col>
                </FormGroup>

                <div>
                  Pause the log window
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
                </div>

                <LogList value={this.props.log} />
              </Form>
            </CardBody>
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
          this.props.value.entries.map((logEntry, index) => {
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
