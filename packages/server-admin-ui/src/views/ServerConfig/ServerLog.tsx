import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import parse from 'html-react-parser'
import { useLogEntries, useClearLogEntries } from '../../store'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import LogFiles from './Logging'
import Creatable from 'react-select/creatable'
import { useWebSocket, useDeltaMessages } from '../../hooks/useWebSocket'

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
  const clearLogEntries = useClearLogEntries()
  const { ws: webSocket, isConnected } = useWebSocket()

  const [pause, setPause] = useState(false)
  // Read when a clear settles, since the user may pause while it is pending.
  const pauseRef = useRef(false)
  const [debugKeys, setDebugKeys] = useState<string[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const unsubscribeRef = useRef<() => void>(() => {})

  // The server rejects a log subscription from a non-admin connection with a
  // bare { errorMessage } frame, which has no delta content to render. Without
  // this the log window would just stay empty with no explanation.
  useDeltaMessages(
    useCallback((message: unknown) => {
      const { errorMessage } = (message ?? {}) as { errorMessage?: unknown }
      if (typeof errorMessage === 'string') {
        setAccessError(errorMessage)
      }
    }, [])
  )

  const subscribeToLogsIfNeeded = useCallback(() => {
    if (
      !pause &&
      webSocket &&
      isConnected &&
      (webSocket !== webSocketRef.current || !didSubscribeRef.current)
    ) {
      // Every subscribe replays the server's whole buffer, so start empty to
      // avoid duplicates and drop lines cleared while this window was away.
      clearLogEntries()
      const sub = { context: 'vessels.self', subscribe: [{ path: 'log' }] }
      webSocket.send(JSON.stringify(sub))
      // A reconnect gets a fresh principal, so retry rather than keep showing
      // the refusal from the previous socket.
      if (webSocket !== webSocketRef.current) {
        setAccessError(null)
      }
      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket, isConnected, clearLogEntries])

  const unsubscribeToLogs = useCallback(() => {
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      const sub = { context: 'vessels.self', unsubscribe: [{ path: 'log' }] }
      webSocket.send(JSON.stringify(sub))
      didSubscribeRef.current = false
    }
  }, [webSocket])

  useEffect(() => {
    unsubscribeRef.current = unsubscribeToLogs
  })

  const fetchDebugKeys = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/debugKeys`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((keys) => {
        setDebugKeys(keys.sort())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchDebugKeys()
    return () => {
      unsubscribeRef.current()
      clearLogEntries()
    }
  }, [fetchDebugKeys, clearLogEntries])

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
    pauseRef.current = newPause
    if (newPause) {
      unsubscribeToLogs()
    } else {
      subscribeToLogsIfNeeded()
    }
  }

  const handleClearLog = () => {
    if (
      clearing ||
      !window.confirm(
        'Clear the server log? This empties it for every connected admin.'
      )
    ) {
      return
    }
    setClearError(null)
    setClearing(true)
    fetch(`${window.serverRoutesPrefix}/log`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        // A live window clears on the LOG_CLEARED broadcast; clearing here too
        // could drop lines that arrived after it. A paused one is unsubscribed.
        if (pauseRef.current) {
          clearLogEntries()
        }
      })
      .catch((err: Error) => {
        setClearError(`Failed to clear the server log: ${err.message}`)
      })
      .finally(() => {
        setClearing(false)
      })
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
            <LogList value={log} accessError={accessError} />
            <div style={{ marginTop: '10px' }}>
              <Button
                size="sm"
                variant="danger"
                onClick={handleClearLog}
                disabled={accessError !== null || clearing}
              >
                <FontAwesomeIcon icon={faTrash} /> Clear Server Log
              </Button>
              {clearError && (
                <span className="text-danger" style={{ marginLeft: '10px' }}>
                  {clearError}
                </span>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>
      <LogFiles />
    </div>
  )
}

interface LogListProps {
  value: LogState
  accessError: string | null
}

function LogList({ value, accessError }: LogListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [value.entries])

  return (
    <div
      ref={containerRef}
      style={{
        overflowY: 'scroll',
        height: '60vh',
        border: '1px solid',
        padding: '5px',
        fontFamily: 'monospace'
      }}
    >
      {accessError ? (
        <span className="text-danger">{accessError}</span>
      ) : value.entries.length === 0 ? (
        <span style={{ color: 'grey', fontStyle: 'italic' }}>
          Waiting for log entries...
        </span>
      ) : (
        value.entries.map((logEntry) => (
          <LogRow key={logEntry.i} log={logEntry.d} />
        ))
      )}
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
