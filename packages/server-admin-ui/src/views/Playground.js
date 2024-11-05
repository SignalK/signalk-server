import React, { Component } from 'react'
import { connect } from 'react-redux'
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
  NavLink,
} from 'reactstrap'
import classnames from 'classnames'
//import { Tabs, Tab, TabList, TabPanel } from 'react-tabs'
//import 'react-tabs/style/react-tabs.css';

import moment from 'moment'
import jsonlint from 'jsonlint-mod'

const timestampFormat = 'MM/DD HH:mm:ss'
const inputStorageKey = 'admin.v1.playground.input'

const DELTAS_TAB_ID = 'deltas'
const PATHS_TAB_ID = 'paths'
const N2KJSON_TAB_ID = 'n2kjson'
const PUTRESULTS_TAB_ID = 'putresults'
const LINT_ERROR_TAB_ID = 'lintErrors'

class Playground extends Component {
  constructor(props) {
    super(props)
    const input = localStorage.getItem(inputStorageKey) || ''
    this.state = {
      hasData: true,
      data: [],
      deltas: [],
      n2kJson: [],
      n2kOutAvailable: false,
      input,
      inputIsJson: isJson(input),
      sending: false,
      sendingN2K: false,
      activeTab: DELTAS_TAB_ID,
    }

    this.handleExecute = this.handleExecute.bind(this)
    this.handleSendN2K = this.handleSendN2K.bind(this)
    this.handleInput = this.handleInput.bind(this)
    this.send = this.send.bind(this)
    this.beautify = this.beautify.bind(this)
  }

  handleInput(event) {
    this.setState({
      ...this.state,
      input: event.target.value,
      inputIsJson: isJson(event.target.value),
    })
    localStorage.setItem(inputStorageKey, event.target.value)
    if (this.inputWaitTimeout) {
      clearTimeout(this.inputWaitTimeout)
    }
    this.inputWaitTimeout = setTimeout(() => {
      if (this.state.input.length > 0) {
        this.send(false)
      }
    }, 500)
  }

  handleExecute() {
    this.send(true)
  }

  handleSendN2K() {
    this.send(false, true)
  }

  componentDidMount() {
    if (this.state.input && this.state.input.length > 0) {
      this.send(false)
    }
  }

  beautify() {
    try {
      jsonlint.parse(this.state.input)
      const text = JSON.stringify(JSON.parse(this.state.input), null, 2)
      this.setState({ ...this.state, input: text, jsonError: null })
    } catch (error) {
      this.setState({
        ...this.state,
        data: [],
        deltas: [],
        putResults: [],
        n2kJson: [],
        n2kOutAvailable: false,
        error: 'invalid json',
        jsonError: error.message,
        activeTab: LINT_ERROR_TAB_ID,
      })
    }
  }

  send(sendToServer, sendToN2K) {
    let start = this.state.input.trim().charAt(0)
    if (start === '{' || start === '[') {
      try {
        jsonlint.parse(this.state.input)
        if (this.state.activeTab === LINT_ERROR_TAB_ID) {
          this.setState({ ...this.state, activeTab: DELTAS_TAB_ID })
        }
      } catch (error) {
        this.setState({
          ...this.state,
          data: [],
          deltas: [],
          putResults: [],
          n2kJson: [],
          n2kOutAvailable: false,
          error: 'invalid json',
          jsonError: error.message,
          activeTab: LINT_ERROR_TAB_ID,
        })
        return
      }
    }

    const body = { value: this.state.input, sendToServer, sendToN2K }
    localStorage.setItem(inputStorageKey, this.state.input)
    if (sendToServer) {
      this.setState({ ...this.state, sending: true })
    }
    if (sendToN2K) {
      this.setState({ ...this.state, sendingN2K: true })
    }
    fetch(`${window.serverRoutesPrefix}/inputTest`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then((response) => response.json())
      .then((data) => {
        if (sendToServer || sendToN2K) {
          setTimeout(() => {
            this.setState({ ...this.state, sending: false, sendingN2K: false })
          }, 1000)
        }
        if (data.error) {
          this.setState({
            ...this.state,
            data: [],
            deltas: [],
            putResults: [],
            n2kJson: [],
            n2kOutAvailable: false,
            jsonError: null,
            error: data.error,
          })
        } else {
          this.state.error = null
          this.setState(this.state)
          const values = []
          data.deltas.forEach((delta) => {
            if (!delta.context) {
              delta.context = 'vessels.self'
            }
            if (delta.updates) {
              delta.updates.forEach((update) => {
                if (update.values) {
                  update.values.forEach((vp) => {
                    if (vp.path === '') {
                      Object.keys(vp.value).forEach((k) => {
                        values.push({
                          path: k,
                          value: vp.value[k],
                          context: delta.context,
                          timestamp: moment(update.timestamp).format(
                            timestampFormat
                          ),
                        })
                      })
                    } else {
                      values.push({
                        path: vp.path,
                        value: vp.value,
                        context: delta.context,
                        timestamp: moment(update.timestamp).format(
                          timestampFormat
                        ),
                      })
                    }
                  })
                }
              })
            }
          })
          this.setState({
            ...this.state,
            data: values,
            deltas: data.deltas,
            n2kJson: data.n2kJson,
            n2kOutAvailable: data.n2kOutAvailable,
            putResults: data.putResults,
            jsonError: null,
          })
        }
      })
      .catch((error) => {
        console.error(error)
        this.setState({
          ...this.state,
          data: [],
          deltas: [],
          putResults: [],
          n2kJson: [],
          n2kOutAvailable: false,
          error: error.message,
          jsonError: null,
        })
        if (sendToServer || sendToN2K) {
          this.setState({ ...this.state, sending: false, sendingN2K: false })
        }
      })
  }

  render() {
    const toggle = (tab) => {
      this.setState({ ...this.state, activeTab: tab })
    }
    return (
      this.state.hasData && (
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
                          Signal K deltas (one delta or an array). For sending
                          PGNs out over the servers NMEA 2000 connection, use
                          one of the formats{' '}
                          <a href="/documentation/develop/plugins/deltas.html?highlight=NMEA%202000%20json#sending-nmea-2000-data-from-a-plugin">
                            here
                          </a>
                        </FormText>
                        <Input
                          type="textarea"
                          name="input"
                          rows="15"
                          onChange={this.handleInput}
                          value={this.state.input}
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
                        className="float-left"
                        disabled={!this.state.inputIsJson}
                        onClick={this.beautify}
                      >
                        <i className="fa fa-dot-circle-o" /> Beautify JSON
                      </Button>
                    </Col>

                    <Col>
                      <Button
                        size="sm"
                        color="primary"
                        onClick={this.handleExecute}
                        className="float-right"
                      >
                        <i
                          className={
                            this.state.sending
                              ? 'fa fa-spinner fa-spin'
                              : 'fa fa-dot-circle-o'
                          }
                        />{' '}
                        Send To Server
                      </Button>
                    </Col>
                  </Row>
                  <Row style={{ paddingBottom: '0.25rem' }}>
                    <Col className="text-right">
                      <Button
                        size="sm"
                        color="primary"
                        disabled={
                          !(
                            this.state.n2kJson &&
                            this.state.n2kJson.length > 0 &&
                            this.state.n2kOutAvailable
                          )
                        }
                        onClick={this.handleSendN2K}
                      >
                        <i
                          className={
                            this.state.sendingN2K
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
                      <span className="float-right">
                        {this.state.error && (
                          <p className="text-danger">{this.state.error}</p>
                        )}
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
                          active: this.state.activeTab === DELTAS_TAB_ID,
                        })}
                        onClick={() => {
                          toggle(DELTAS_TAB_ID)
                        }}
                      >
                        Deltas
                      </NavLink>
                    </NavItem>
                    {this.state.data.length > 0 && (
                      <NavItem>
                        <NavLink
                          className={classnames({
                            active: this.state.activeTab === PATHS_TAB_ID,
                          })}
                          onClick={() => {
                            toggle(PATHS_TAB_ID)
                          }}
                        >
                          Paths
                        </NavLink>
                      </NavItem>
                    )}

                    {this.state.n2kJson && this.state.n2kJson.length > 0 && (
                      <NavItem>
                        <NavLink
                          className={classnames({
                            active: this.state.activeTab === N2KJSON_TAB_ID,
                          })}
                          onClick={() => {
                            toggle(N2KJSON_TAB_ID)
                          }}
                        >
                          Decoded NMEA 2000
                        </NavLink>
                      </NavItem>
                    )}
                    {this.state.putResults &&
                      this.state.putResults.length > 0 && (
                        <NavItem>
                          <NavLink
                            className={classnames({
                              active:
                                this.state.activeTab === PUTRESULTS_TAB_ID,
                            })}
                            onClick={() => {
                              toggle(PUTRESULTS_TAB_ID)
                            }}
                          >
                            Put Results
                          </NavLink>
                        </NavItem>
                      )}
                    {this.state.jsonError && (
                      <NavItem>
                        <NavLink
                          className={classnames({
                            active: this.state.activeTab === LINT_ERROR_TAB_ID,
                          })}
                          onClick={() => {
                            toggle(LINT_ERROR_TAB_ID)
                          }}
                        >
                          Json Lint Error
                        </NavLink>
                      </NavItem>
                    )}
                  </Nav>
                  <TabContent activeTab={this.state.activeTab}>
                    <TabPane tabId={DELTAS_TAB_ID}>
                      {this.state.deltas.length > 0 && (
                        <div
                          style={{
                            overflowY: 'scroll',
                            maxHeight: '60vh',
                            border: '1px solid',
                            padding: '5px',
                          }}
                        >
                          <pre>
                            {JSON.stringify(this.state.deltas, null, 2)}
                          </pre>
                        </div>
                      )}
                    </TabPane>

                    {this.state.data.length > 0 && (
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
                              {this.state.data.map((data) => {
                                const formatted = JSON.stringify(
                                  data.value,
                                  null,
                                  typeof data.value === 'object' &&
                                    data.value !== null &&
                                    Object.keys(data.value).length > 1
                                    ? 2
                                    : 0
                                )
                                const key = `${data.path}${data.context}`

                                return (
                                  <tr key={key}>
                                    <td>{data.path}</td>
                                    <td>
                                      <pre
                                        className="text-primary"
                                        style={{ whiteSpace: 'pre-wrap' }}
                                      >
                                        {formatted}
                                      </pre>
                                    </td>
                                    <td>{data.context}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </Table>
                        </div>
                      </TabPane>
                    )}

                    {this.state.n2kJson &&
                      this.state.n2kJson.length > 0 &&
                      n2kJsonPanel(this.state.n2kJson)}

                    {this.state.putResults &&
                      this.state.putResults.length > 0 && (
                        <TabPane tabId={PUTRESULTS_TAB_ID}>
                          <div
                            style={{
                              overflowY: 'scroll',
                              maxHeight: '60vh',
                              border: '1px solid',
                              padding: '5px',
                            }}
                          >
                            <pre>
                              {JSON.stringify(this.state.putResults, null, 2)}
                            </pre>
                          </div>
                        </TabPane>
                      )}

                    {this.state.jsonError && (
                      <TabPane tabId={LINT_ERROR_TAB_ID}>
                        <div
                          style={{
                            overflowY: 'scroll',
                            maxHeight: '60vh',
                            border: '1px solid',
                            padding: '5px',
                          }}
                        >
                          <pre>{this.state.jsonError}</pre>
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
    )
  }
}

function n2kJsonPanel(n2kData) {
  return (
    <TabPane tabId={N2KJSON_TAB_ID}>
      <div
        style={{
          overflowY: 'scroll',
          maxHeight: '60vh',
          border: '1px solid',
          padding: '5px',
        }}
      >
        <pre>{JSON.stringify(n2kData, null, 2)}</pre>
      </div>
    </TabPane>
  )
}

function isJson(input) {
  let inputIsJson = false
  try {
    JSON.parse(input)
    inputIsJson = true
  } catch (e) {
    /* empty */
  }
  return inputIsJson
}

export default connect(({ webSocket }) => ({ webSocket }))(Playground)
