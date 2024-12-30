import React, { Component } from 'react'
import { connect } from 'react-redux'
import JSONTree from 'react-json-tree'
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  Table,
} from 'reactstrap'
import moment from 'moment'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import Meta from './Meta'

const timestampFormat = 'MM/DD HH:mm:ss'

const metaStorageKey = 'admin.v1.dataBrowser.meta'
const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'

function fetchSources() {
  fetch(`/signalk/v1/api/sources`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then((sources) => {
      Object.values(sources).forEach((source) => {
        if (source.type === 'NMEA2000') {
          Object.keys(source).forEach((key) => {
            let device = source[key]
            if (device.n2k && device.n2k.productName) {
              source[
                `${device.n2k.manufacturerName || ''} ${
                  device.n2k.productName
                } (${key})`
              ] = device
              delete source[key]
            }
          })
        }
      })
      this.setState({ ...this.state, sources: sources })
    })
}

class DataBrowser extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
      webSocket: null,
      didSubscribe: false,
      pause: localStorage.getItem(pauseStorageKey) === 'true',
      includeMeta: localStorage.getItem(metaStorageKey) === 'true',
      data: {},
      meta: {},
      context: localStorage.getItem(contextStorageKey) || 'self',
      search: localStorage.getItem(searchStorageKey) || '',
    }

    this.fetchSources = fetchSources.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleContextChange = this.handleContextChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
    this.toggleMeta = this.toggleMeta.bind(this)
  }

  handleMessage(msg) {
    if (this.state.pause) {
      return
    }

    if (msg.context && msg.updates) {
      const key =
        msg.context === this.state.webSocket.skSelf ? 'self' : msg.context

      let isNew = false
      if (!this.state.data[key]) {
        this.state.data[key] = {}
        isNew = true
      }

      if (!this.state.meta[key]) {
        this.state.meta[key] = {}
        isNew = true
      }

      let context = this.state.data[key]
      let contextMeta = this.state.meta[key]

      msg.updates.forEach((update) => {
        if (update.values) {
          let pgn =
            update.source && update.source.pgn && `(${update.source.pgn})`
          let sentence =
            update.source &&
            update.source.sentence &&
            `(${update.source.sentence})`
          update.values.forEach((vp) => {
            if (vp.path === '') {
              Object.keys(vp.value).forEach((k) => {
                context[k] = {
                  path: k,
                  value: vp.value[k],
                  $source: update.$source,
                  pgn,
                  sentence,
                  timestamp: moment(update.timestamp).format(timestampFormat),
                }
              })
            } else {
              context[vp.path + '$' + update['$source']] = {
                path: vp.path,
                $source: update.$source,
                value: vp.value,
                pgn,
                sentence,
                timestamp: moment(update.timestamp).format(timestampFormat),
              }
            }
          })
        }
        if (update.meta) {
          update.meta.forEach((vp) => {
            contextMeta[vp.path] = { ...contextMeta[vp.path], ...vp.value }
          })
        }
      })

      if (isNew || (this.state.context && this.state.context === key)) {
        this.setState({
          ...this.state,
          hasData: true,
          data: this.state.data,
          meta: this.state.meta,
        })
      }
    }
  }

  subscribeToDataIfNeeded() {
    if (
      !this.state.pause &&
      this.props.webSocket &&
      (this.props.webSocket != this.state.webSocket ||
        this.state.didSubscribe === false)
    ) {
      const sub = {
        context: '*',
        subscribe: [
          {
            path: '*',
            period: 2000,
          },
        ],
      }

      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubscribe = true
      this.state.webSocket.messageHandler = this.handleMessage
    }
  }

  unsubscribeToData() {
    if (this.props.webSocket) {
      const sub = {
        context: '*',
        unsubscribe: [
          {
            path: '*',
          },
        ],
      }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.didSubscribe = false
      this.props.webSocket.messageHandler = null
    }
  }

  componentDidMount() {
    this.fetchSources()
    this.subscribeToDataIfNeeded()
  }

  componentDidUpdate() {
    this.subscribeToDataIfNeeded()
  }

  componentWillUnmount() {
    this.unsubscribeToData()
  }

  handleContextChange(event) {
    this.setState({ ...this.state, context: event.target.value })
    localStorage.setItem(contextStorageKey, event.target.value)
  }

  handleSearch(event) {
    this.setState({ ...this.state, search: event.target.value })
    localStorage.setItem(searchStorageKey, event.target.value)
  }

  toggleMeta(event) {
    this.setState({ ...this.state, includeMeta: event.target.checked })
    localStorage.setItem(metaStorageKey, event.target.checked)
  }

  handlePause(event) {
    this.state.pause = event.target.checked
    this.setState(this.state)
    localStorage.setItem(pauseStorageKey, this.state.pause)
    if (this.state.pause) {
      this.unsubscribeToData()
    } else {
      this.fetchSources()
      this.subscribeToDataIfNeeded()
    }
  }

  render() {
    return (
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
                <Col xs="12" md="4">
                  <Input
                    type="select"
                    value={this.state.context}
                    name="context"
                    onChange={this.handleContextChange}
                  >
                    <option value="none">Select a context</option>
                    {Object.keys(this.state.data || {})
                      .sort()
                      .map((key) => {
                        return (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        )
                      })}
                  </Input>
                </Col>
                <Col xs="8" md="2">
                  <Label className="switch switch-text switch-primary">
                    <Input
                      type="checkbox"
                      id="Meta"
                      name="meta"
                      className="switch-input"
                      onChange={this.toggleMeta}
                      checked={this.state.includeMeta}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>{' '}
                  Meta Data
                </Col>
                <Col xs="8" md="2">
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
                  </Label>{' '}
                  Pause
                </Col>
              </FormGroup>
              {this.state.context && this.state.context !== 'none' && (
                <FormGroup row>
                  <Col xs="3" md="2">
                    <Label htmlFor="select">Search</Label>
                  </Col>
                  <Col xs="12" md="12">
                    <Input
                      type="text"
                      name="search"
                      onChange={this.handleSearch}
                      value={this.state.search}
                    />
                  </Col>
                </FormGroup>
              )}

              {!this.state.includeMeta &&
                this.state.context &&
                this.state.context !== 'none' && (
                  <Table responsive bordered striped size="sm">
                    <thead>
                      <tr>
                        <th>Path</th>
                        <th>Value</th>
                        <th>Units</th>
                        <th>Timestamp</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(this.state.data[this.state.context] || {})
                        .filter((key) => {
                          return (
                            !this.state.search ||
                            this.state.search.length === 0 ||
                            key
                              .toLowerCase()
                              .indexOf(this.state.search.toLowerCase()) !== -1
                          )
                        })
                        .sort()
                        .map((key) => {
                          const data = this.state.data[this.state.context][key]
                          const formatted = JSON.stringify(
                            data.value,
                            null,
                            typeof data.value === 'object' &&
                              Object.keys(data.value || {}).length > 1
                              ? 2
                              : 0
                          )
                          const meta =
                            this.state.meta[this.state.context][data.path]
                          const units = meta && meta.units ? meta.units : ''

                          return (
                            <tr key={key}>
                              <td>
                                <CopyToClipboardWithFade text={data.path}>
                                  <span>
                                    {data.path} <i className="far fa-copy"></i>
                                  </span>
                                </CopyToClipboardWithFade>
                              </td>
                              <td>
                                <pre
                                  className="text-primary"
                                  style={{ whiteSpace: 'pre-wrap' }}
                                >
                                  {formatted}
                                </pre>
                              </td>
                              <td>{units}</td>
                              <td>{data.timestamp}</td>
                              <td>
                                <CopyToClipboardWithFade text={data.path}>
                                  {data.$source} <i className="far fa-copy"></i>
                                </CopyToClipboardWithFade>{' '}
                                {data.pgn || ''}
                                {data.sentence || ''}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </Table>
                )}

              {this.state.includeMeta &&
                this.state.context &&
                this.state.context !== 'none' && (
                  <Table responsive bordered striped size="sm">
                    <thead>
                      <tr>
                        <th>Path</th>
                        <th>Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(this.state.data[this.state.context] || {})
                        .filter((key) => {
                          return (
                            !this.state.search ||
                            this.state.search.length === 0 ||
                            key
                              .toLowerCase()
                              .indexOf(this.state.search.toLowerCase()) !== -1
                          )
                        })
                        .map(
                          (key) => this.state.data[this.state.context][key].path
                        )
                        .filter((path, index, array) => {
                          //filter dups
                          return array.indexOf(path) === index
                        })
                        .sort()
                        .map((path) => {
                          const meta = this.state.meta[this.state.context][path]
                          return (
                            <tr key={path}>
                              <td>{path}</td>
                              <td>
                                <Meta meta={meta || {}} path={path} />
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </Table>
                )}
            </Form>
          </CardBody>
        </Card>

        {this.state.sources && (
          <Card>
            <CardHeader>Sources</CardHeader>
            <CardBody>
              <JSONTree
                data={this.state.sources}
                theme="default"
                sortObjectKeys
                hideRoot
              />
            </CardBody>
          </Card>
        )}
      </div>
    )
  }
}

class CopyToClipboardWithFade extends Component {
  constructor() {
    super()
    this.state = {
      opacity: 1,
    }
  }

  render() {
    const { opacity } = this.state
    const onCopy = function () {
      this.setState({ opacity: 0.5 })
      setTimeout(() => {
        this.setState({ opacity: 1 })
      }, 500)
    }.bind(this)
    return (
      <CopyToClipboard text={this.props.text} onCopy={onCopy}>
        <span style={{ opacity }}> {this.props.children}</span>
      </CopyToClipboard>
    )
  }
}

export default connect(({ webSocket }) => ({ webSocket }))(DataBrowser)
