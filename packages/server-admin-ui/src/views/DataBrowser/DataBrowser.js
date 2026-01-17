import React, { Component } from 'react'
import { connect } from 'react-redux'
import { JSONTree } from 'react-json-tree'
import Select from 'react-select'
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
  Button,
  ButtonGroup
} from 'reactstrap'
import moment from 'moment'
import { getCompiledFormula } from '../../utils/unitConversion'
import Meta from './Meta'
import store from './ValueEmittingStore'
import VirtualizedDataTable from './VirtualizedDataTable'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey } from './pathUtils'

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const metaStorageKey = 'admin.v1.dataBrowser.meta'
const presetStorageKey = 'admin.v1.dataBrowser.preset'

// Default unit preferences presets (fallback if fetch fails)
const DEFAULT_PRESETS = [
  { value: 'metric', label: 'Metric (SI)' },
  { value: 'imperial-us', label: 'Imperial (US)' },
  { value: 'imperial-uk', label: 'Imperial (UK)' }
]

// Fetch all presets (built-in + custom)
async function fetchPresets() {
  try {
    const response = await fetch('/signalk/v1/unitpreferences/presets', {
      credentials: 'include'
    })
    if (response.ok) {
      const data = await response.json()
      const presets = []
      // Add built-in presets
      if (data.builtIn) {
        data.builtIn.forEach(p => {
          presets.push({
            value: typeof p === 'object' ? p.name : p,
            label: typeof p === 'object' ? (p.displayName || p.name) : p,
            isCustom: false
          })
        })
      }
      // Add custom presets
      if (data.custom) {
        data.custom.forEach(p => {
          presets.push({
            value: typeof p === 'object' ? p.name : p,
            label: typeof p === 'object' ? (p.displayName || p.name) : p,
            isCustom: true
          })
        })
      }
      return presets.length > 0 ? presets : DEFAULT_PRESETS
    }
  } catch (e) {
    console.error('Failed to fetch presets:', e)
  }
  return DEFAULT_PRESETS
}

// Fetch and set active preset
async function fetchActivePreset() {
  try {
    const response = await fetch('/signalk/v1/unitpreferences/config', {
      credentials: 'include'
    })
    if (response.ok) {
      const config = await response.json()
      return config.activePreset || 'metric'
    }
  } catch (e) {
    console.error('Failed to fetch unit preferences:', e)
  }
  return 'metric'
}

async function setActivePreset(preset) {
  try {
    await fetch('/signalk/v1/unitpreferences/config', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activePreset: preset })
    })
  } catch (e) {
    console.error('Failed to set unit preferences:', e)
  }
}
const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const rawStorageKey = 'admin.v1.dataBrowser.v1.raw'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const selectedSourcesStorageKey = 'admin.v1.dataBrowser.selectedSources'
const sourceFilterActiveStorageKey = 'admin.v1.dataBrowser.sourceFilterActive'

function fetchSources() {
  fetch(`/signalk/v1/api/sources`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((sources) => {
      Object.values(sources).forEach((source) => {
        if (source.type === 'NMEA2000') {
          Object.keys(source).forEach((key) => {
            let device = source[key]
            if (device.n2k && device.n2k.modelId) {
              source[
                `${device.n2k.manufacturerCode || ''} ${
                  device.n2k.modelId
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
      raw: localStorage.getItem(rawStorageKey) === 'true',
      context: localStorage.getItem(contextStorageKey) || 'self',
      search: localStorage.getItem(searchStorageKey) || '',
      selectedSources: new Set(
        JSON.parse(localStorage.getItem(selectedSourcesStorageKey) || '[]')
      ),
      sourceFilterActive:
        localStorage.getItem(sourceFilterActiveStorageKey) === 'true',
      // For forcing re-renders when store updates
      storeVersion: 0,
      path$SourceKeys: [],
      activePreset: 'metric', // Will be fetched from server in componentDidMount
      presets: DEFAULT_PRESETS,
      unitDefinitions: null, // Loaded from server for conversion formulas
      presetDetails: null // Details of active preset with target units
    }

    this.fetchSources = fetchSources.bind(this)
    this.handlePause = this.handlePause.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleContextChange = this.handleContextChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
    this.toggleMeta = this.toggleMeta.bind(this)
    this.toggleRaw = this.toggleRaw.bind(this)
    this.toggleSourceSelection = this.toggleSourceSelection.bind(this)
    this.toggleSourceFilter = this.toggleSourceFilter.bind(this)
    this.updatePath$SourceKeys = this.updatePath$SourceKeys.bind(this)
    this.handlePresetChange = this.handlePresetChange.bind(this)
  }

  async handlePresetChange(preset) {
    await setActivePreset(preset)
    // Also fetch preset details for conversion
    try {
      const res = await fetch(`/signalk/v1/unitpreferences/presets/${preset}`, { credentials: 'include' })
      if (res.ok) {
        const presetDetails = await res.json()
        this.setState({ ...this.state, activePreset: preset, presetDetails })
        return
      }
    } catch (e) {
      console.error('Failed to fetch preset details:', e)
    }
    this.setState({ ...this.state, activePreset: preset })
  }

  // Convert a value from SI unit to display unit based on category and active preset
  convertValue(value, siUnit, category) {
    const { unitDefinitions, presetDetails } = this.state

    // Need numeric value + category + definitions + preset
    if (typeof value !== 'number' || !category || !unitDefinitions || !presetDetails) {
      return { value, unit: siUnit }
    }

    // Get target unit for this category from preset
    const targetConfig = presetDetails.categories?.[category]
    if (!targetConfig?.targetUnit) {
      return { value, unit: siUnit }
    }

    const targetUnit = targetConfig.targetUnit

    // If target is same as SI unit, no conversion needed
    if (targetUnit === siUnit) {
      return { value, unit: siUnit }
    }

    // Get conversion formula from definitions
    const formula = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.formula
    const symbol = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.symbol || targetUnit

    if (!formula) {
      return { value, unit: siUnit }
    }

    // Evaluate formula using cached compiled expression
    try {
      const compiled = getCompiledFormula(formula)
      const converted = compiled.evaluate({ value })
      return { value: converted, unit: symbol }
    } catch (e) {
      console.error('Formula evaluation failed:', e)
      return { value, unit: siUnit }
    }
  }

  handleMessage(msg) {
    if (this.state.pause) {
      return
    }

    if (msg.context && msg.updates) {
      const key =
        msg.context === this.state.webSocket.skSelf ? 'self' : msg.context

      let isNew = false

      msg.updates.forEach((update) => {
        if (update.values) {
          let pgn =
            update.source && update.source.pgn && `(${update.source.pgn})`
          let sentence =
            update.source &&
            update.source.sentence &&
            `(${update.source.sentence})`
          update.values.forEach((vp) => {
            const timestamp = moment(update.timestamp)
            const formattedTimestamp = timestamp.isSame(moment(), 'day')
              ? timestamp.format(TIME_ONLY_FORMAT)
              : timestamp.format(TIMESTAMP_FORMAT)

            if (vp.path === '') {
              Object.keys(vp.value).forEach((k) => {
                const pathData = {
                  path: k,
                  value: vp.value[k],
                  $source: update.$source,
                  pgn,
                  sentence,
                  timestamp: formattedTimestamp
                }
                const wasNew = !store.getPathData(key, k)
                store.updatePath(key, k, pathData)
                if (wasNew) isNew = true
              })
            } else {
              const path$SourceKey = getPath$SourceKey(vp.path, update.$source)
              const pathData = {
                path: vp.path,
                $source: update.$source,
                value: vp.value,
                pgn,
                sentence,
                timestamp: formattedTimestamp
              }
              const wasNew = !store.getPathData(key, path$SourceKey)
              store.updatePath(key, path$SourceKey, pathData)
              if (wasNew) isNew = true
            }
          })
        }
        if (update.meta) {
          update.meta.forEach((vp) => {
            store.updateMeta(key, vp.path, vp.value)
          })
        }
      })

      // Update path keys if new paths were added or if this is the selected context
      if (isNew || (this.state.context && this.state.context === key)) {
        this.updatePath$SourceKeys()
        if (!this.state.hasData) {
          this.setState({ hasData: true })
        }
      }
    }
  }

  updatePath$SourceKeys() {
    const allKeys = store.getPath$SourceKeys(this.state.context)

    const filtered = allKeys.filter((key) => {
      // Search filter
      if (this.state.search && this.state.search.length > 0) {
        if (key.toLowerCase().indexOf(this.state.search.toLowerCase()) === -1) {
          return false
        }
      }

      // Source filter
      if (
        this.state.sourceFilterActive &&
        this.state.selectedSources.size > 0
      ) {
        const data = store.getPathData(this.state.context, key)
        if (data && !this.state.selectedSources.has(data.$source)) {
          return false
        }
      }

      return true
    })

    filtered.sort()

    this.setState({
      path$SourceKeys: filtered,
      storeVersion: store.version
    })
  }

  subscribeToDataIfNeeded() {
    if (
      !this.state.pause &&
      this.props.webSocket &&
      (this.props.webSocket !== this.state.webSocket ||
        this.state.didSubscribe === false)
    ) {
      // Initialize granular subscription manager
      granularSubscriptionManager.setWebSocket(this.props.webSocket)
      granularSubscriptionManager.setMessageHandler(this.handleMessage)
      granularSubscriptionManager.startDiscovery()

      this.state.webSocket = this.props.webSocket
      this.state.didSubscribe = true
      this.state.webSocket.messageHandler = this.handleMessage
    }
  }

  unsubscribeToData() {
    granularSubscriptionManager.unsubscribeAll()
    this.state.didSubscribe = false
    if (this.props.webSocket) {
      this.props.webSocket.messageHandler = null
    }
  }

  async componentDidMount() {
    this.fetchSources()
    this.subscribeToDataIfNeeded()

    // Subscribe to store structure changes (debounced to avoid React render conflicts)
    this.unsubscribeStore = store.subscribeToStructure(() => {
      // Use setTimeout to defer state update and avoid "setState during render" error
      if (this.updatePath$SourceKeysTimeout) {
        clearTimeout(this.updatePath$SourceKeysTimeout)
      }
      this.updatePath$SourceKeysTimeout = setTimeout(() => {
        this.updatePath$SourceKeys()
      }, 50)
    })

    // Fetch presets (including custom ones)
    const presets = await fetchPresets()
    const activePreset = await fetchActivePreset()

    // Fetch unit definitions for conversion formulas
    let unitDefinitions = null
    try {
      const res = await fetch('/signalk/v1/unitpreferences/definitions', { credentials: 'include' })
      if (res.ok) {
        unitDefinitions = await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch unit definitions:', e)
    }

    // Fetch details of active preset
    let presetDetails = null
    try {
      const res = await fetch(`/signalk/v1/unitpreferences/presets/${activePreset}`, { credentials: 'include' })
      if (res.ok) {
        presetDetails = await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch preset details:', e)
    }

    this.setState({ presets, activePreset, unitDefinitions, presetDetails })
  }

  componentDidUpdate() {
    this.subscribeToDataIfNeeded()
  }

  componentWillUnmount() {
    this.unsubscribeToData()
    if (this.unsubscribeStore) {
      this.unsubscribeStore()
    }
    if (this.updatePath$SourceKeysTimeout) {
      clearTimeout(this.updatePath$SourceKeysTimeout)
    }
    granularSubscriptionManager.unsubscribeAll()
  }

  handleContextChange(selectedOption) {
    const value = selectedOption ? selectedOption.value : 'none'

    localStorage.setItem(selectedSourcesStorageKey, JSON.stringify([]))
    localStorage.setItem(sourceFilterActiveStorageKey, false)

    // Restart discovery for new context
    granularSubscriptionManager.cancelPending()
    granularSubscriptionManager.startDiscovery()

    this.setState(
      {
        ...this.state,
        context: value,
        selectedSources: new Set(),
        sourceFilterActive: false
      },
      () => {
        this.updatePath$SourceKeys()
      }
    )
    localStorage.setItem(contextStorageKey, value)
  }

  getContextLabel(contextKey) {
    const contextData = store.getPathData(contextKey, 'name')
    const contextName = contextData?.value
    return `${contextName || ''} ${contextKey}`
  }

  getContextOptions() {
    const contexts = store.getContexts().sort()

    const options = []

    if (contexts.includes('self')) {
      const selfLabel = this.getContextLabel('self')
      options.push({ value: 'self', label: selfLabel })
    }

    contexts.forEach((key) => {
      if (key !== 'self') {
        const contextLabel = this.getContextLabel(key)
        options.push({ value: key, label: contextLabel })
      }
    })

    return options
  }

  getCurrentContextValue() {
    const options = this.getContextOptions()
    return options.find((option) => option.value === this.state.context) || null
  }

  handleSearch(event) {
    this.setState({ ...this.state, search: event.target.value }, () => {
      this.updatePath$SourceKeys()
    })
    localStorage.setItem(searchStorageKey, event.target.value)
  }

  toggleMeta(event) {
    this.setState({ ...this.state, includeMeta: event.target.checked })
    localStorage.setItem(metaStorageKey, event.target.checked)
  }

  toggleRaw(event) {
    this.setState({ ...this.state, raw: event.target.checked })
    localStorage.setItem(rawStorageKey, event.target.checked)
  }

  handlePause(event) {
    this.state.pause = event.target.checked
    this.setState(this.state)
    localStorage.setItem(pauseStorageKey, this.state.pause)
    if (this.state.pause) {
      this.unsubscribeToData()
      granularSubscriptionManager.unsubscribeAll()
    } else {
      this.fetchSources()
      this.subscribeToDataIfNeeded()
    }
  }

  toggleSourceSelection(source) {
    const newSelectedSources = new Set(this.state.selectedSources)
    const wasEmpty = newSelectedSources.size === 0

    if (newSelectedSources.has(source)) {
      newSelectedSources.delete(source)
    } else {
      newSelectedSources.add(source)
    }

    const shouldActivateFilter = wasEmpty && newSelectedSources.size === 1
    const shouldDeactivateFilter = newSelectedSources.size === 0

    const newSourceFilterActive = shouldActivateFilter
      ? true
      : shouldDeactivateFilter
        ? false
        : this.state.sourceFilterActive

    localStorage.setItem(
      selectedSourcesStorageKey,
      JSON.stringify([...newSelectedSources])
    )
    localStorage.setItem(sourceFilterActiveStorageKey, newSourceFilterActive)

    this.setState(
      {
        ...this.state,
        selectedSources: newSelectedSources,
        sourceFilterActive: newSourceFilterActive
      },
      () => {
        this.updatePath$SourceKeys()
      }
    )
  }

  toggleSourceFilter(event) {
    const newSourceFilterActive = event.target.checked
    localStorage.setItem(sourceFilterActiveStorageKey, newSourceFilterActive)

    this.setState(
      {
        ...this.state,
        sourceFilterActive: newSourceFilterActive
      },
      () => {
        this.updatePath$SourceKeys()
      }
    )
  }

  render() {
    const contextOptions = this.getContextOptions()
    const currentContext = this.getCurrentContextValue()

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
                  <Select
                    value={currentContext}
                    onChange={this.handleContextChange}
                    options={contextOptions}
                    placeholder="Select a context"
                    isSearchable={true}
                    isClearable={true}
                    noOptionsMessage={() => 'No contexts available'}
                    menuPortalTarget={document.body}
                    styles={{
                      menuPortal: (base) => ({ ...base, zIndex: 9999 })
                    }}
                  />
                </Col>
                <Col xs="6" md="2">
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
                  <span style={{ whiteSpace: 'nowrap' }}>Meta data</span>
                </Col>
                <Col xs="6" md="2">
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
                <Col xs="6" md="2">
                  <Label className="switch switch-text switch-primary">
                    <Input
                      type="checkbox"
                      id="Raw"
                      name="raw"
                      className="switch-input"
                      onChange={this.toggleRaw}
                      checked={this.state.raw}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>{' '}
                  <span style={{ whiteSpace: 'nowrap' }}>Raw Values</span>
                </Col>
              </FormGroup>
              {this.state.includeMeta && (
                <FormGroup row>
                  <Col xs="12" md="12" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '500', marginRight: '5px' }}>Preset:</span>
                    {this.state.presets.map((preset, index) => {
                      const isActive = this.state.activePreset === preset.value
                      const colors = ['#28a745', '#007bff', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c']
                      const baseColor = colors[index % colors.length]
                      return (
                        <span
                          key={preset.value}
                          onClick={() => this.handlePresetChange(preset.value)}
                          style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: isActive ? baseColor : 'transparent',
                            color: isActive ? 'white' : baseColor,
                            border: `2px solid ${baseColor}`,
                            opacity: isActive ? 1 : 0.7
                          }}
                        >
                          {preset.label}
                        </span>
                      )
                    })}
                  </Col>
                </FormGroup>
              )}
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

              {/* Data Values View - Virtualized */}
              {!this.state.includeMeta &&
                this.state.context &&
                this.state.context !== 'none' && (
                  <VirtualizedDataTable
                    path$SourceKeys={this.state.path$SourceKeys}
                    context={this.state.context}
                    raw={this.state.raw}
                    isPaused={this.state.pause}
                    onToggleSource={this.toggleSourceSelection}
                    selectedSources={this.state.selectedSources}
                    onToggleSourceFilter={this.toggleSourceFilter}
                    sourceFilterActive={this.state.sourceFilterActive}
                    convertValue={this.convertValue}
                    activePreset={this.state.activePreset}
                    unitDefinitions={this.state.unitDefinitions}
                    presetDetails={this.state.presetDetails}
                  />
                )}

              {/* Meta View - Keep original table for now */}
              {this.state.includeMeta &&
                this.state.context &&
                this.state.context !== 'none' && (
                  <Table responsive size="sm" style={{ borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                    <thead>
                      <tr>
                        <th colSpan="3">Path Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {this.getUniquePathsForMeta()
                        .filter((path, index, array) => {
                          return array.indexOf(path) === index
                        })
                        .sort()
                        .map((path) => {
                          const meta = store.getMeta(this.state.context, path)
                          const category = meta?.displayUnits?.category || ''
                          // Find a current value for this path
                          const dataKeys = Object.keys(this.state.data?.[this.state.context] || {})
                          const matchingKey = dataKeys.find(k => this.state.data[this.state.context][k].path === path)
                          const currentValue = matchingKey ? this.state.data[this.state.context][matchingKey].value : undefined
                          return (
                            <tr key={path}>
                              <td colSpan="3">
                                {!path.startsWith('notifications') && (
                                  <Meta
                                    meta={meta || {}}
                                    path={path}
                                    currentValue={currentValue}
                                    activePreset={this.state.activePreset}
                                    presetDetails={this.state.presetDetails}
                                    unitDefinitions={this.state.unitDefinitions}
                                  />
                                )}
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
                invertTheme={true}
                sortObjectKeys
                hideRoot
              />
            </CardBody>
          </Card>
        )}
      </div>
    )
  }

  getUniquePathsForMeta() {
    const allKeys = store.getPath$SourceKeys(this.state.context)

    // Filter by search
    const filtered = allKeys.filter((key) => {
      if (!this.state.search || this.state.search.length === 0) {
        return true
      }
      return key.toLowerCase().indexOf(this.state.search.toLowerCase()) !== -1
    })

    // Extract unique paths (remove source suffix)
    const paths = filtered.map((key) => {
      const data = store.getPathData(this.state.context, key)
      return data?.path || key
    })

    // Dedupe and sort
    return [...new Set(paths)].sort()
  }
}

export default connect(({ webSocket }) => ({ webSocket }))(DataBrowser)
