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
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
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
  const [debugKeys, setDebugKeys] = useState<string[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)
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
  }, [pause, webSocket, isConnected])

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
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      backgroundColor: 'var(--sk-input-bg)',
                      borderColor: state.isFocused
                        ? 'var(--bs-primary)'
                        : 'var(--sk-input-border-color)',
                      boxShadow: state.isFocused
                        ? '0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.25)'
                        : 'none',
                      '&:hover': {
                        borderColor: 'var(--bs-primary)'
                      }
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      gap: '0.25rem'
                    }),
                    multiValue: (base) => ({
                      ...base,
                      backgroundColor: 'var(--bs-tertiary-bg)'
                    }),
                    multiValueLabel: (base) => ({
                      ...base,
                      color: 'var(--bs-body-color)'
                    }),
                    multiValueRemove: (base) => ({
                      ...base,
                      color: 'var(--bs-secondary-color)',
                      ':hover': {
                        backgroundColor: 'var(--bs-danger-bg-subtle)',
                        color: 'var(--bs-danger)'
                      }
                    }),
                    input: (base) => ({
                      ...base,
                      color: 'var(--bs-body-color)'
                    }),
                    placeholder: (base) => ({
                      ...base,
                      color: 'var(--bs-secondary-color)'
                    }),
                    menu: (base) => ({
                      ...base,
                      zIndex: 100,
                      backgroundColor: 'var(--bs-body-bg)',
                      border: '1px solid var(--sk-dropdown-border-color)'
                    }),
                    menuList: (base) => ({
                      ...base,
                      backgroundColor: 'var(--bs-body-bg)'
                    }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? 'var(--bs-primary)'
                        : state.isFocused
                          ? 'var(--bs-tertiary-bg)'
                          : 'transparent',
                      color: state.isSelected ? '#fff' : 'var(--bs-body-color)',
                      ':hover': {
                        backgroundColor: state.isSelected
                          ? 'var(--bs-primary)'
                          : 'var(--bs-tertiary-bg)'
                      }
                    })
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
