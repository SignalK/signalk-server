import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Form,
  Col,
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
import classnames from 'classnames'
import moment from 'moment'
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
    <TabPane tabId={N2KJSON_TAB_ID}>
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
    </TabPane>
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

  const send = useCallback(
    (sendToServer: boolean, sendToN2K = false) => {
      const start = input.trim().charAt(0)
      if (start === '{' || start === '[') {
        try {
          jsonlint.parse(input)
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

      const body = { value: input, sendToServer, sendToN2K }
      localStorage.setItem(inputStorageKey, input)

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
                            timestamp: moment(update.timestamp).format(
                              timestampFormat
                            )
                          })
                        })
                      } else {
                        values.push({
                          path: vp.path,
                          value: vp.value,
                          context,
                          timestamp: moment(update.timestamp).format(
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
    [input, activeTab]
  )

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
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
    try {
      jsonlint.parse(input)
      const text = JSON.stringify(JSON.parse(input), null, 2)
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
  }, [input])

  useEffect(() => {
    if (input && input.length > 0) {
      send(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (tab: string) => {
    setActiveTab(tab)
  }

  return (
    <div className="animated fadeIn">
      <Row>
        <Col xs="12" md="6">
          <Card>
            <CardHeader>Input</CardHeader>
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
                  <Col xs="12" md="12">
                    <FormText color="muted">
                      You can enter multi-line raw NMEA 2000, NMEA 0183 or
                      Signal K deltas (one delta or an array). For sending PGNs
                      out over the servers NMEA 2000 connection, use one of the
                      formats{' '}
                      <a href="/documentation/develop/plugins/deltas.html?highlight=NMEA%202000%20json#sending-nmea-2000-data-from-a-plugin">
                        here
                      </a>
                    </FormText>
                    <Input
                      type="textarea"
                      name="input"
                      rows="15"
                      onChange={handleInput}
                      value={input}
                    />
                  </Col>
                </FormGroup>
              </Form>
            </CardBody>
            <CardFooter>
              <Row style={{ paddingBottom: '0.25rem' }}>
                <Col>
                  <Button
                    size="sm"
                    color="primary"
                    className="float-start"
                    disabled={!inputIsJson}
                    onClick={beautify}
                  >
                    <i className="fa fa-dot-circle-o" /> Beautify JSON
                  </Button>
                </Col>

                <Col>
                  <Button
                    size="sm"
                    color="primary"
                    onClick={handleExecute}
                    className="float-end"
                  >
                    <i
                      className={
                        sending ? 'fa fa-spinner fa-spin' : 'fa fa-dot-circle-o'
                      }
                    />{' '}
                    Send To Server
                  </Button>
                </Col>
              </Row>
              <Row style={{ paddingBottom: '0.25rem' }}>
                <Col className="text-end">
                  <Button
                    size="sm"
                    color="primary"
                    disabled={
                      !(n2kJson && n2kJson.length > 0 && n2kOutAvailable)
                    }
                    onClick={handleSendN2K}
                  >
                    <i
                      className={
                        sendingN2K
                          ? 'fa fa-spinner fa-spin'
                          : 'fa fa-dot-circle-o'
                      }
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
            </CardFooter>
          </Card>
        </Col>
        <Col xs="12" md="6">
          <Card>
            <CardHeader>Output</CardHeader>
            <CardBody>
              <Nav tabs>
                <NavItem>
                  <NavLink
                    className={classnames({
                      active: activeTab === DELTAS_TAB_ID
                    })}
                    onClick={() => toggle(DELTAS_TAB_ID)}
                  >
                    Deltas
                  </NavLink>
                </NavItem>
                {data.length > 0 && (
                  <NavItem>
                    <NavLink
                      className={classnames({
                        active: activeTab === PATHS_TAB_ID
                      })}
                      onClick={() => toggle(PATHS_TAB_ID)}
                    >
                      Paths
                    </NavLink>
                  </NavItem>
                )}

                {n2kJson && n2kJson.length > 0 && (
                  <NavItem>
                    <NavLink
                      className={classnames({
                        active: activeTab === N2KJSON_TAB_ID
                      })}
                      onClick={() => toggle(N2KJSON_TAB_ID)}
                    >
                      Decoded NMEA 2000
                    </NavLink>
                  </NavItem>
                )}
                {putResults && putResults.length > 0 && (
                  <NavItem>
                    <NavLink
                      className={classnames({
                        active: activeTab === PUTRESULTS_TAB_ID
                      })}
                      onClick={() => toggle(PUTRESULTS_TAB_ID)}
                    >
                      Put Results
                    </NavLink>
                  </NavItem>
                )}
                {jsonError && (
                  <NavItem>
                    <NavLink
                      className={classnames({
                        active: activeTab === LINT_ERROR_TAB_ID
                      })}
                      onClick={() => toggle(LINT_ERROR_TAB_ID)}
                    >
                      Json Lint Error
                    </NavLink>
                  </NavItem>
                )}
              </Nav>
              <TabContent activeTab={activeTab}>
                <TabPane tabId={DELTAS_TAB_ID}>
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
                </TabPane>

                {data.length > 0 && (
                  <TabPane tabId={PATHS_TAB_ID}>
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
                  </TabPane>
                )}

                {n2kJson && n2kJson.length > 0 && (
                  <N2kJsonPanel n2kData={n2kJson} />
                )}

                {putResults && putResults.length > 0 && (
                  <TabPane tabId={PUTRESULTS_TAB_ID}>
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
                  </TabPane>
                )}

                {jsonError && (
                  <TabPane tabId={LINT_ERROR_TAB_ID}>
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
                  </TabPane>
                )}
              </TabContent>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Playground
