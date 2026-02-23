import React, { useState, useEffect, useRef, useCallback } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Nav from 'react-bootstrap/Nav'
import Row from 'react-bootstrap/Row'
import Tab from 'react-bootstrap/Tab'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleDot } from '@fortawesome/free-regular-svg-icons/faCircleDot'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import dayjs from 'dayjs'
import jsonlint from 'jsonlint-mod'

const timestampFormat = 'MM/DD HH:mm:ss'
const inputStorageKey = 'admin.v1.playground.input'

const DELTAS_TAB_ID = 'deltas'
const PATHS_TAB_ID = 'paths'
const N2KJSON_TAB_ID = 'n2kjson'
const PUTRESULTS_TAB_ID = 'putresults'
const LINT_ERROR_TAB_ID = 'lintErrors'

interface PathData {
  path: string
  value: unknown
  context: string
  timestamp: string
}

interface Delta {
  context?: string
  updates?: Array<{
    timestamp: string
    values?: Array<{
      path: string
      value: unknown
    }>
  }>
}

interface SendResponse {
  error?: string
  deltas: Delta[]
  n2kJson: unknown[]
  n2kOutAvailable: boolean
  putResults: unknown[]
}

function isJson(input: string): boolean {
  try {
    JSON.parse(input)
    return true
  } catch {
    return false
  }
}

function N2kJsonPanel({ n2kData }: { n2kData: unknown[] }) {
  return (
    <Tab.Pane eventKey={N2KJSON_TAB_ID}>
      <div
        style={{
          overflowY: 'scroll',
          maxHeight: '60vh',
          border: '1px solid',
          padding: '5px'
        }}
      >
        <pre>{JSON.stringify(n2kData, null, 2)}</pre>
      </div>
    </Tab.Pane>
  )
}

const Playground: React.FC = () => {
  const [data, setData] = useState<PathData[]>([])
  const [deltas, setDeltas] = useState<Delta[]>([])
  const [n2kJson, setN2kJson] = useState<unknown[]>([])
  const [n2kOutAvailable, setN2kOutAvailable] = useState(false)
  const [input, setInput] = useState(
    () => localStorage.getItem(inputStorageKey) || ''
  )
  const [inputIsJson, setInputIsJson] = useState(() =>
    isJson(localStorage.getItem(inputStorageKey) || '')
  )
  const [sending, setSending] = useState(false)
  const [sendingN2K, setSendingN2K] = useState(false)
  const [activeTab, setActiveTab] = useState(DELTAS_TAB_ID)
  const [error, setError] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [putResults, setPutResults] = useState<unknown[]>([])

  const inputWaitTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track if initial auto-send has been scheduled
  const initialSendScheduledRef = useRef(false)
  const inputRef = useRef(input)
  useEffect(() => {
    inputRef.current = input
  }, [input])

  const send = useCallback(
    (sendToServer: boolean, sendToN2K = false) => {
      const currentInput = inputRef.current
      const start = currentInput.trim().charAt(0)
      if (start === '{' || start === '[') {
        try {
          jsonlint.parse(currentInput)
          if (activeTab === LINT_ERROR_TAB_ID) {
            setActiveTab(DELTAS_TAB_ID)
          }
        } catch (err) {
          setData([])
          setDeltas([])
          setPutResults([])
          setN2kJson([])
          setN2kOutAvailable(false)
          setError('invalid json')
          setJsonError((err as Error).message)
          setActiveTab(LINT_ERROR_TAB_ID)
          return
        }
      }

      const body = { value: currentInput, sendToServer, sendToN2K }
      localStorage.setItem(inputStorageKey, currentInput)

      if (sendToServer) {
        setSending(true)
      }
      if (sendToN2K) {
        setSendingN2K(true)
      }

      fetch(`${window.serverRoutesPrefix}/inputTest`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
        .then((response) => response.json())
        .then((responseData: SendResponse) => {
          if (sendToServer || sendToN2K) {
            setTimeout(() => {
              setSending(false)
              setSendingN2K(false)
            }, 1000)
          }

          if (responseData.error) {
            setData([])
            setDeltas([])
            setPutResults([])
            setN2kJson([])
            setN2kOutAvailable(false)
            setJsonError(null)
            setError(responseData.error)
          } else {
            setError(null)
            const values: PathData[] = []

            responseData.deltas.forEach((delta) => {
              const context = delta.context || 'vessels.self'
              if (delta.updates) {
                delta.updates.forEach((update) => {
                  if (update.values) {
                    update.values.forEach((vp) => {
                      if (vp.path === '') {
                        Object.keys(vp.value as object).forEach((k) => {
                          values.push({
                            path: k,
                            value: (vp.value as Record<string, unknown>)[k],
                            context,
                            timestamp: dayjs(update.timestamp).format(
                              timestampFormat
                            )
                          })
                        })
                      } else {
                        values.push({
                          path: vp.path,
                          value: vp.value,
                          context,
                          timestamp: dayjs(update.timestamp).format(
                            timestampFormat
                          )
                        })
                      }
                    })
                  }
                })
              }
            })

            setData(values)
            setDeltas(responseData.deltas)
            setN2kJson(responseData.n2kJson)
            setN2kOutAvailable(responseData.n2kOutAvailable)
            setPutResults(responseData.putResults)
            setJsonError(null)
          }
        })
        .catch((err) => {
          console.error(err)
          setData([])
          setDeltas([])
          setPutResults([])
          setN2kJson([])
          setN2kOutAvailable(false)
          setError((err as Error).message)
          setJsonError(null)
          if (sendToServer || sendToN2K) {
            setSending(false)
            setSendingN2K(false)
          }
        })
    },
    [activeTab]
  )

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value
      setInput(value)
      setInputIsJson(isJson(value))
      localStorage.setItem(inputStorageKey, value)

      if (inputWaitTimeoutRef.current) {
        clearTimeout(inputWaitTimeoutRef.current)
      }

      inputWaitTimeoutRef.current = setTimeout(() => {
        if (value.length > 0) {
          send(false)
        }
      }, 500)
    },
    [send]
  )

  const handleExecute = useCallback(() => {
    send(true)
  }, [send])

  const handleSendN2K = useCallback(() => {
    send(false, true)
  }, [send])

  const beautify = useCallback(() => {
    const currentInput = inputRef.current
    try {
      jsonlint.parse(currentInput)
      const text = JSON.stringify(JSON.parse(currentInput), null, 2)
      setInput(text)
      setJsonError(null)
    } catch (err) {
      setData([])
      setDeltas([])
      setPutResults([])
      setN2kJson([])
      setN2kOutAvailable(false)
      setError('invalid json')
      setJsonError((err as Error).message)
      setActiveTab(LINT_ERROR_TAB_ID)
    }
  }, [])

  // Auto-send on mount if there's saved input
  // The ref is only read when scheduling the initial send, never during render
  useEffect(() => {
    if (input && input.length > 0 && !initialSendScheduledRef.current) {
      initialSendScheduledRef.current = true
      // Use setTimeout to schedule send as a callback, not synchronously
      const timeoutId = setTimeout(() => send(false), 0)
      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [input, send])

  return (
    <div className="animated fadeIn">
      <Row>
        <Col xs={12} md={6}>
          <Card>
            <Card.Header>Input</Card.Header>
            <Card.Body>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
                onSubmit={(e) => {
                  e.preventDefault()
                }}
              >
                <Form.Group as={Row}>
                  <Col xs={12} md={12}>
                    <Form.Text muted>
                      You can enter multi-line raw NMEA 2000, NMEA 0183 or
                      Signal K deltas (one delta or an array). For sending PGNs
                      out over the servers NMEA 2000 connection, use one of the
                      formats{' '}
                      <a href="/documentation/develop/plugins/deltas.html?highlight=NMEA%202000%20json#sending-nmea-2000-data-from-a-plugin">
                        here
                      </a>
                    </Form.Text>
                    <Form.Control
                      as="textarea"
                      name="input"
                      rows={15}
                      onChange={handleInput}
                      value={input}
                    />
                  </Col>
                </Form.Group>
              </Form>
            </Card.Body>
            <Card.Footer>
              <Row style={{ paddingBottom: '0.25rem' }}>
                <Col>
                  <Button
                    size="sm"
                    variant="primary"
                    className="float-start"
                    disabled={!inputIsJson}
                    onClick={beautify}
                  >
                    <FontAwesomeIcon icon={faCircleDot} /> Beautify JSON
                  </Button>
                </Col>

                <Col>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleExecute}
                    className="float-end"
                  >
                    <FontAwesomeIcon
                      icon={sending ? faSpinner : faCircleDot}
                      spin={sending}
                    />{' '}
                    Send To Server
                  </Button>
                </Col>
              </Row>
              <Row style={{ paddingBottom: '0.25rem' }}>
                <Col className="text-end">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={
                      !(n2kJson && n2kJson.length > 0 && n2kOutAvailable)
                    }
                    onClick={handleSendN2K}
                  >
                    <FontAwesomeIcon
                      icon={sendingN2K ? faSpinner : faCircleDot}
                      spin={sendingN2K}
                    />{' '}
                    Send as PGN to server&apos;s NMEA2000 connection
                  </Button>
                </Col>
              </Row>
              <Row>
                <Col>
                  <span className="float-end">
                    {error && <p className="text-danger">{error}</p>}
                  </span>
                </Col>
              </Row>
            </Card.Footer>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Card.Header>Output</Card.Header>
            <Card.Body>
              <Tab.Container
                activeKey={activeTab}
                onSelect={(k) => k && setActiveTab(k)}
              >
                <Nav variant="tabs">
                  <Nav.Item>
                    <Nav.Link eventKey={DELTAS_TAB_ID}>Deltas</Nav.Link>
                  </Nav.Item>
                  {data.length > 0 && (
                    <Nav.Item>
                      <Nav.Link eventKey={PATHS_TAB_ID}>Paths</Nav.Link>
                    </Nav.Item>
                  )}

                  {n2kJson && n2kJson.length > 0 && (
                    <Nav.Item>
                      <Nav.Link eventKey={N2KJSON_TAB_ID}>
                        Decoded NMEA 2000
                      </Nav.Link>
                    </Nav.Item>
                  )}
                  {putResults && putResults.length > 0 && (
                    <Nav.Item>
                      <Nav.Link eventKey={PUTRESULTS_TAB_ID}>
                        Put Results
                      </Nav.Link>
                    </Nav.Item>
                  )}
                  {jsonError && (
                    <Nav.Item>
                      <Nav.Link eventKey={LINT_ERROR_TAB_ID}>
                        Json Lint Error
                      </Nav.Link>
                    </Nav.Item>
                  )}
                </Nav>
                <Tab.Content>
                  <Tab.Pane eventKey={DELTAS_TAB_ID}>
                    {deltas.length > 0 && (
                      <div
                        style={{
                          overflowY: 'scroll',
                          maxHeight: '60vh',
                          border: '1px solid',
                          padding: '5px'
                        }}
                      >
                        <pre>{JSON.stringify(deltas, null, 2)}</pre>
                      </div>
                    )}
                  </Tab.Pane>

                  {data.length > 0 && (
                    <Tab.Pane eventKey={PATHS_TAB_ID}>
                      <div style={{ overflowY: 'scroll', maxHeight: '60vh' }}>
                        <Table responsive bordered striped size="sm">
                          <thead>
                            <tr>
                              <th>Path</th>
                              <th>Value</th>
                              <th>Context</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.map((item) => {
                              const formatted = JSON.stringify(
                                item.value,
                                null,
                                typeof item.value === 'object' &&
                                  item.value !== null &&
                                  Object.keys(item.value).length > 1
                                  ? 2
                                  : 0
                              )
                              const key = `${item.path}${item.context}`

                              return (
                                <tr key={key}>
                                  <td>{item.path}</td>
                                  <td>
                                    <pre
                                      className="text-primary"
                                      style={{ whiteSpace: 'pre-wrap' }}
                                    >
                                      {formatted}
                                    </pre>
                                  </td>
                                  <td>{item.context}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </Table>
                      </div>
                    </Tab.Pane>
                  )}

                  {n2kJson && n2kJson.length > 0 && (
                    <N2kJsonPanel n2kData={n2kJson} />
                  )}

                  {putResults && putResults.length > 0 && (
                    <Tab.Pane eventKey={PUTRESULTS_TAB_ID}>
                      <div
                        style={{
                          overflowY: 'scroll',
                          maxHeight: '60vh',
                          border: '1px solid',
                          padding: '5px'
                        }}
                      >
                        <pre>{JSON.stringify(putResults, null, 2)}</pre>
                      </div>
                    </Tab.Pane>
                  )}

                  {jsonError && (
                    <Tab.Pane eventKey={LINT_ERROR_TAB_ID}>
                      <div
                        style={{
                          overflowY: 'scroll',
                          maxHeight: '60vh',
                          border: '1px solid',
                          padding: '5px'
                        }}
                      >
                        <pre>{jsonError}</pre>
                      </div>
                    </Tab.Pane>
                  )}
                </Tab.Content>
              </Tab.Container>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Playground
