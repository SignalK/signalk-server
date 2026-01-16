import React, { useState, useEffect, useRef, useCallback } from 'react'
import parse from 'html-react-parser'
import { useSelector } from 'react-redux'
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText
} from 'reactstrap'
import LogFiles from './Logging'
import Creatable from 'react-select/creatable'

const ServerLogs = () => {
  const log = useSelector((state) => state.log)
  const webSocket = useSelector((state) => state.webSocket)

  const [pause, setPause] = useState(false)
  const [debugKeys, setDebugKeys] = useState([])
  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef(null)

  const subscribeToLogsIfNeeded = useCallback(() => {
    if (
      !pause &&
      webSocket &&
      (webSocket !== webSocketRef.current || !didSubscribeRef.current)
    ) {
      const sub = { context: 'vessels.self', subscribe: [{ path: 'log' }] }
      webSocket.send(JSON.stringify(sub))
      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket])

  const unsubscribeToLogs = useCallback(() => {
    if (webSocket) {
      const sub = { context: 'vessels.self', unsubscribe: [{ path: 'log' }] }
      webSocket.send(JSON.stringify(sub))
      didSubscribeRef.current = false
    }
  }, [webSocket])

  const fetchDebugKeys = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/debugKeys`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((keys) => {
        setDebugKeys(keys.sort())
      })
  }, [])

  useEffect(() => {
    subscribeToLogsIfNeeded()
    fetchDebugKeys()
    return () => {
      unsubscribeToLogs()
    }
  }, [])

  useEffect(() => {
    subscribeToLogsIfNeeded()
  }, [subscribeToLogsIfNeeded])

  const doHandleDebug = (value) => {
    fetch(`${window.serverRoutesPrefix}/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value }),
      credentials: 'include'
    }).then((response) => response.text())
  }

  const handleRememberDebug = (event) => {
    fetch(`${window.serverRoutesPrefix}/rememberDebug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: event.target.checked }),
      credentials: 'include'
    }).then((response) => response.text())
  }

  const handlePause = (event) => {
    const newPause = event.target.checked
    setPause(newPause)
    if (newPause) {
      unsubscribeToLogs()
    } else {
      subscribeToLogsIfNeeded()
    }
  }

  return (
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
                  options={debugKeys.map((key) => ({
                    label: key,
                    value: key
                  }))}
                  value={
                    log.debugEnabled
                      ? log.debugEnabled
                          .split(',')
                          .map((value) => ({ label: value, value }))
                      : null
                  }
                  onChange={(v) => {
                    const value =
                      v !== null ? v.map(({ value }) => value).join(',') : ''
                    doHandleDebug(value)
                  }}
                />
                <FormText color="muted" style={{ marginBottom: '15px' }}>
                  Select the appropriate debug keys to activate debug logging
                  for various components on the server.
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
                    onChange={handleRememberDebug}
                    checked={log.rememberDebug}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
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
                    onChange={handlePause}
                    checked={pause}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>
              </Col>
            </FormGroup>
            <LogList value={log} />
          </Form>
        </CardBody>
      </Card>
      <LogFiles />
    </div>
  )
}

// Keep LogList as class component since it uses componentDidMount for scrolling
class LogList extends React.Component {
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
          fontFamily: 'monospace'
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
        {parse(this.props.log)}
        <br />
      </span>
    )
  }
}

export default ServerLogs
