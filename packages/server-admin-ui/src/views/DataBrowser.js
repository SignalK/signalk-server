import React, { Component } from 'react'
import { connect } from 'react-redux'
import get from 'lodash.get'
import {JSONPath} from 'jsonpath-plus'
import JSONTree from 'react-json-tree'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  InputGroup,
  InputGroupAddon,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Table
} from 'reactstrap'
import moment from 'moment'

const timestampFormat = 'MM/DD HH:mm:ss'

const metaStorageKey = 'admin.v1.dataBrowser.meta'
const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const editStorageKey = 'admin.v1.dataBrowser.edit'

function fetchSources () {
  fetch(`/signalk/v1/api/sources`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(sources => {
      Object.values(sources).forEach(source => {
        if ( source.type === "NMEA2000" ) {
          Object.keys(source).forEach(key => {
            let device = source[key]
            if ( device.n2k && device.n2k.productName ) {
              source[`${device.n2k.manufacturerName || ''} ${device.n2k.productName} (${key})`] = device
                delete source[key]
            }
          })
        }
      })
      this.setState({ ...this.state, sources: sources})
    })
}

function fetchBaseDeltas() {
  fetch(`/skServer/baseDeltas`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  })
    .then(response => response.json())
    .then(response => {
    this.setState({ ...this.state, baseDeltas: response })
    this.fetchUnit(response)
  })

}

function fetchUnitList() {
  fetch(`/skServer/listUnits`, {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(response => {
    this.setState({...this.state, unitList: response})
  })
}


class DataBrowser extends Component {
  constructor (props) {
    super(props)
    this.state = {
      edit: localStorage.getItem(editStorageKey) === 'true',
      hasData: false,
      webSocket: null,
      didSubscribe: false,
      pause: localStorage.getItem(pauseStorageKey) === 'true',
      includeMeta: localStorage.getItem(metaStorageKey) === 'true',
      data: {},
      unit: [],
      meta: {},
      baseDeltas: {},
      unitList: {},
      context: localStorage.getItem(contextStorageKey) || 'self',
      search: localStorage.getItem(searchStorageKey) || ''
    }

    this.fetchSources = fetchSources.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleContextChange = this.handleContextChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
    this.handleMeta = this.handleMeta.bind(this)
    this.handleUnitChange = this.handleUnitChange.bind(this)
    this.handleEdit = this.handleEdit.bind(this)
    this.handleSave = this.handleSave.bind(this)
    this.fetchUnit = this.fetchUnit.bind(this)
    this.fetchBaseDeltas = fetchBaseDeltas.bind(this)
    this.fetchUnitList = fetchUnitList.bind(this)
  }

  handleMessage(msg) {

    if ( this.state.pause ) {
      return
    }

    if ( msg.context && msg.updates ) {
      const key = msg.context === this.state.webSocket.skSelf ? 'self' : msg.context

      let isNew = false
      if ( !this.state.data[key] ) {
        this.state.data[key] = {}
        isNew = true
      }

      if ( !this.state.meta[key] ) {
        this.state.meta[key] = {}
        isNew = true
      }

      let context = this.state.data[key]
      let contextMeta = this.state.meta[key]

      msg.updates.forEach(update => {
        if ( update.values ) {
          let pgn = update.source && update.source.pgn && `(${update.source.pgn})`
          let sentence = update.source && update.source.sentence && `(${update.source.sentence})`
          update.values.forEach(vp => {
            if ( vp.path === '' ) {
              Object.keys(vp.value).forEach(k => {
                context[k] = {
                  path: k,
                  value: vp.value[k],
                  $source: update.$source,
                  pgn,
                  sentence,
                  timestamp: moment(update.timestamp).format(timestampFormat)
                }
              })
            } else {
              context[vp.path + '$' + update['$source']] = {
                path: vp.path,
                $source: update.$source,
                value: vp.value,
                pgn,
                sentence,
                timestamp: moment(update.timestamp).format(timestampFormat)
              }
            }
          })
        }
        if ( update.meta ) {
          update.meta.forEach(vp => {
            contextMeta[vp.path] = { ...contextMeta[vp.path], ...vp.value }
          })
        }
      })

      if ( isNew || (this.state.context && this.state.context === key) ) {
        this.setState({...this.state, hasData:true, data: this.state.data, meta: this.state.meta  })
      }
    }
  }

  subscribeToDataIfNeeded() {
    if ( !this.state.pause && this.props.webSocket && (this.props.webSocket != this.state.webSocket ||  this.state.didSubscribe === false) ) {

      const sub = {
        context: '*',
        subscribe: [{
          path: "*",
          period: 2000
        }]
      }

      this.props.webSocket.send(JSON.stringify(sub))
      this.state.webSocket = this.props.webSocket
      this.state.didSubscribe = true
      this.state.webSocket.messageHandler = this.handleMessage
    }
  }

  unsubscribeToData() {
    if ( this.props.webSocket ) {
      const sub = {
        context: '*',
        unsubscribe: [{
          path: "*"
        }]
      }
      this.props.webSocket.send(JSON.stringify(sub))
      this.state.didSubscribe = false
      this.props.webSocket.messageHandler = null
    }
  }

  componentDidMount() {
    this.fetchSources()
    this.subscribeToDataIfNeeded()
    this.fetchBaseDeltas()
    this.fetchUnitList()
  }

  componentDidUpdate() {
    this.subscribeToDataIfNeeded()
  }

  componentWillUnmount () {
    this.unsubscribeToData()
  }

  handleContextChange(event) {
    this.setState({...this.state, context: event.target.value})
    localStorage.setItem(contextStorageKey, event.target.value)
  }

  handleSearch(event) {
    this.setState({...this.state, search: event.target.value})
    localStorage.setItem(searchStorageKey, event.target.value)
  }

  handleMeta(event) {
    this.setState({...this.state, includeMeta: event.target.checked})
    localStorage.setItem(metaStorageKey, event.target.checked)
  }

  handleEdit(event) {
    this.setState({...this.state, edit: event.target.checked})
    localStorage.setItem(editStorageKey, event.target.checked)
  }

  fetchUnit(basedeltas){
    basedeltas.map((resArray) => { //context also?
      resArray.updates.map((update) => {
        if (update.meta){
          update.meta.map((metas, index) => {
            if (metas.path && metas.value.units) {
              let units = this.state.unit
              units[metas.path] = metas.value.units
              this.setState({...this.state, unit: units})
            }
          })
        }
      })
    })
  }

  handleUnitChange(event, key) {
    let stateUnitTemp = this.state.unit

    stateUnitTemp[key.split('$')[0]] = event.target.value
    this.setState({
      ...this.state, unit: stateUnitTemp
    })


    const changedObject = {
      "context": 'vessels.' + this.state.context, //@TODO shouldn't this.state.context be vessels.*?
      "updates": [
        {
          "meta": [
            {
              "path": key.split('$')[0],
              "value": {
                "units": event.target.value
              }
            }
          ]
        }
      ]
    }

    let baseDeltaTemp = this.state.baseDeltas

    const path = JSONPath({json:baseDeltaTemp, path:'$[*].updates[*].meta[*].path',resultType:"all"});
    if(Array.isArray(path) && path.length){
      for ( const pth in path){
        const nPath = path[pth].pointer.split('/')
        nPath.shift()
        if (nPath.length == 6){
          if (baseDeltaTemp[nPath[0]].context == 'vessels.self'){
            if (path[pth].value == key.split('$')[0]){
              baseDeltaTemp[nPath[0]][nPath[1]][nPath[2]][nPath[3]][nPath[4]].value.units = event.target.value
              this.setState({
                ...this.state, baseDeltas : baseDeltaTemp
              })
              this.handleSave()
              break
            } else if (pth == path.length - 1){
              baseDeltaTemp[nPath[0]][nPath[1]][nPath[2]][nPath[3]].push(changedObject.updates[0].meta[0])
              this.setState({
                ...this.state, baseDeltas : baseDeltaTemp
              })
              this.handleSave()
            }
          }
        }
      }
    } else {
      const sPath = JSONPath({json:baseDeltaTemp, path:'$[*].updates[*]', resultType:"all"});
      if(Array.isArray(sPath) && sPath.length){
        for ( const pth in sPath){
          const nPath = sPath[pth].pointer.split('/')
          nPath.shift()
          if (nPath.length == 4){
            if (baseDeltaTemp[nPath[0]].context == 'vessels.self'){
              baseDeltaTemp[nPath[0]][nPath[1]].push(changedObject.updates[0]);
              this.setState({
                ...this.state, baseDeltas : baseDeltaTemp
              })
              this.handleSave()
              break
            }
          } else {
            baseDeltaTemp.push(changedObject)
            this.setState({
              ...this.state, baseDeltas : baseDeltaTemp
            })
            this.handleSave()
          }
        }
      }
    }
  }

  handleSave () {

    var payload = {
    }
    fetch(`${window.serverRoutesPrefix}/baseDeltas`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state.baseDeltas),
      credentials: 'include'
    })
  }

  handlePause (event) {
    this.state.pause = event.target.checked
    this.setState(this.state)
    localStorage.setItem(pauseStorageKey, this.state.pause)
    if ( this.state.pause ) {
      this.unsubscribeToData()
    } else {
      this.fetchSources()
      this.subscribeToDataIfNeeded()
    }
  }

  render () {
    return (
        <div className='animated fadeIn'>
          <Card>
            <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
                onSubmit={e => { e.preventDefault()}}
          >

          <FormGroup row>
          <Col xs='12' md='4'>
          <Input
            type='select'
            value={this.state.context}
            name='context'
            onChange={this.handleContextChange}
          >
            <option value="none">Select a context</option>
            {Object.keys(this.state.data || {}).sort().map(key => {
              return (
                  <option key={key} value={key}>{key}</option>
              )
            })}
          </Input>
          </Col>
          <Col xs='8' md='2'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Meta"
                                name='meta'
                                className='switch-input'
                                onChange={this.handleMeta}
                                checked={this.state.includeMeta}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
                              </Label>{' '}Meta Data
          </Col>
          <Col xs='8' md='2'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Pause"
                                name='pause'
                                className='switch-input'
                                onChange={this.handlePause}
                                checked={this.state.pause}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
          </Label>{' '}Pause
          </Col>
          <Col xs='8' md='2'>
          <Label className='switch switch-text switch-primary'>
                              <Input
                                type='checkbox'
                                id="Edit"
                                name='edit'
                                className='switch-input'
                                onChange={this.handleEdit}
                                checked={this.state.edit}
                              />
                              <span
                                className='switch-label'
                                data-on='Yes'
                                data-off='No'
                              />
                              <span className='switch-handle' />
          </Label>{' '}Edit units
          </Col>
          </FormGroup>
          { this.state.context && this.state.context !== 'none' &&  (
          <FormGroup row>
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Search</Label>
          </Col>
          <Col xs='12' md='12'>
            <Input
              type='text'
              name='search'
              onChange={this.handleSearch}
              value={this.state.search}
            />
          </Col>
              </FormGroup>
          )}

        { !this.state.includeMeta && this.state.context && this.state.context !== 'none' && (
            <Table responsive bordered striped size='sm'>
              <thead>
              <tr>
                <th>Path</th>
                <th>Value</th>
                <th>Units</th>
                <th>Timestamp</th>
                <th>Source</th>
              </tr>
              </thead >
              <tbody>

          { Object.keys(this.state.data[this.state.context] || {})
              .filter( key => {
                return !this.state.search ||
                  this.state.search.length === 0 ||
                  key.toLowerCase().indexOf(this.state.search.toLowerCase()) !== -1
                })
              .sort()
              .map(key => {
                const data = this.state.data[this.state.context][key]
                const formatted = JSON.stringify(
                  data.value,
                  null,
                  typeof data.value === 'object' && Object.keys(data.value || {}).length > 1 ? 2 : 0)
                const meta = this.state.meta[this.state.context][data.path]
                const valueIsNumber = typeof data.value === 'number' ? true : false //do not show or edit units for objects
                var unitFromUser = this.state.unit[key.split('$')[0]]?true:false
                const userUnit = typeof this.state.unit[key.split('$')[0]] == 'string' ? this.state.unit[key.split('$')[0]] : ''
                  const units = meta && meta.units && !unitFromUser  ? meta.units : !valueIsNumber || !this.state.edit? userUnit : <Input
                  type='select'
                      name='unit'
                      value={this.state.unit[key.split('$')[0]]}
                      onChange={(e) => {this.handleUnitChange(e, key);}}
                      >
                      <option value=''>no unit</option>

                      {Object.keys(this.state.unitList.properties || {}).sort().map(key => {
                        if (key != 'deg'){
                        return (
                            <option key={key} value={key}>{key}: { this.state.unitList.properties[key].quantity }</option>
                        )}
                    })}
                      </Input>

                const path = key.substring(0, key.lastIndexOf('.'))

                return (
                  <tr key={key} >
                    <td>{data.path}</td>
                    <td><pre className='text-primary' style={{"whiteSpace": "pre-wrap"}}>{formatted}</pre></td>
                    <td>{units}</td>
                    <td>{data.timestamp}</td>
                    <td>{data.$source} {data.pgn || ''}{data.sentence || ''}</td>
                  </tr>
                )
              })
          }
          </tbody>
          </Table>

        )}

        {this.state.includeMeta && this.state.context && this.state.context !== 'none' && (
          <Table responsive bordered striped size='sm'>
            <thead>
              <tr>
              <th>Path</th>
              <th>Meta</th>
              </tr>
            </thead>
            <tbody>
            {Object.keys(this.state.meta[this.state.context] || {}).filter(key => { return  !this.state.search || this.state.search.length === 0 || key.indexOf(this.state.search) !== -1 }).sort().map(key => {
          const meta = this.state.meta[this.state.context][key]
          const formatted = JSON.stringify(meta, null, 2)
          const path = key
          return (
                 <tr key={path} >
                   <td>{path}</td>
              <td><pre className='text-primary' style={{"whiteSpace": "pre-wrap"}}>{formatted}</pre></td>
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

          <JSONTree data={this.state.sources} theme="default" sortObjectKeys hideRoot />

          </CardBody>
            </Card>
        )}
        </div>

      )

  }
}

export default connect(({webSocket}) => ({webSocket}))(DataBrowser)
