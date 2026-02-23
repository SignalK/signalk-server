import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import parse from 'html-react-parser'
import { useLogEntries } from '../../store'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import LogFiles from './Logging'
import Creatable from 'react-select/creatable'
import { useWebSocket } from '../../hooks/useWebSocket'

interface LogEntry {
  i: number
  d: string
}

interface LogState {
  entries: LogEntry[]
  debugEnabled?: string
  rememberDebug?: boolean
}

interface SelectOption {
  label: string
  value: string
}

export default function ServerLogs() {
  const log = useLogEntries()
  const { ws: webSocket } = useWebSocket()

  const [pause, setPause] = useState(false)
  const [debugKeys, setDebugKeys] = useState<string[]>([])
  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)

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
  }, [subscribeToLogsIfNeeded, fetchDebugKeys, unsubscribeToLogs])

  useEffect(() => {
    subscribeToLogsIfNeeded()
  }, [subscribeToLogsIfNeeded])

  const doHandleDebug = (value: string) => {
    fetch(`${window.serverRoutesPrefix}/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value }),
      credentials: 'include'
    }).then((response) => response.text())
  }

  const handleRememberDebug = (event: ChangeEvent<HTMLInputElement>) => {
    fetch(`${window.serverRoutesPrefix}/rememberDebug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: event.target.checked }),
      credentials: 'include'
    }).then((response) => response.text())
  }

  const handlePause = (event: ChangeEvent<HTMLInputElement>) => {
    const newPause = event.target.checked
    setPause(newPause)
    if (newPause) {
      unsubscribeToLogs()
    } else {
      subscribeToLogsIfNeeded()
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Header>
          <FontAwesomeIcon icon={faAlignJustify} /> <strong>Server Log</strong>
        </Card.Header>

        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={handleSubmit}
          >
            <Form.Group as={Row}>
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
                      v !== null
                        ? (v as SelectOption[])
                            .map(({ value }) => value)
                            .join(',')
                        : ''
                    doHandleDebug(value)
                  }}
                />
                <Form.Text
                  className="text-muted"
                  style={{ marginBottom: '15px' }}
                >
                  Select the appropriate debug keys to activate debug logging
                  for various components on the server.
                </Form.Text>
              </Col>
            </Form.Group>
            <Form.Group as={Row}>
              <Col xs="6" md="6">
                Persist debug settings over server restarts{' '}
                <Form.Label className="switch switch-text switch-primary">
                  <Form.Control
                    type="checkbox"
                    id="Enabled"
                    name="debug"
                    className="switch-input"
                    onChange={handleRememberDebug}
                    checked={log.rememberDebug}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Form.Label>
              </Col>
              <Col xs="6" md="6">
                Pause the log window{' '}
                <Form.Label className="switch switch-text switch-primary">
                  <Form.Control
                    type="checkbox"
                    id="Pause"
                    name="pause"
                    className="switch-input"
                    onChange={handlePause}
                    checked={pause}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Form.Label>
              </Col>
            </Form.Group>
            <LogList value={log} />
          </Form>
        </Card.Body>
      </Card>
      <LogFiles />
    </div>
  )
}

interface LogListProps {
  value: LogState
}

function LogList({ value }: LogListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [])

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
      {value.entries &&
        value.entries.map((logEntry) => (
          <LogRow key={logEntry.i} log={logEntry.d} />
        ))}
      <div ref={endRef}>&nbsp;</div>
    </div>
  )
}

interface LogRowProps {
  log: string
}

function LogRow({ log }: LogRowProps) {
  return (
    <span>
      {parse(log)}
      <br />
    </span>
  )
}
