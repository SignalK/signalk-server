import React, { Component } from 'react'
import PluginConfigurationForm from './../ServerConfig/PluginConfigurationForm'
import {
  Card,
  CardBody,
  CardHeader,
  Row,
  Col,
  Input,
  Label,
  Form,
  FormGroup,
  Table
} from 'reactstrap'
import EmbeddedPluginConfigurationForm from './EmbeddedPluginConfigurationForm'

const searchStorageKey = 'admin.v1.plugins.search'
const openPluginStorageKey = 'admin.v1.plugins.openPlugin'
const statusFilterStorageKey = 'admin.v1.plugins.statusFilter'

export default class PluginConfigurationList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      plugins: [],
      search: localStorage.getItem(searchStorageKey) || '',
      statusFilter: localStorage.getItem(statusFilterStorageKey) || 'all',
      searchResults: null,
      selectedPlugin: null
    }
    this.lastOpenedPlugin = '--'
    this.handleSearch = this.handleSearch.bind(this)
    this.handleStatusFilter = this.handleStatusFilter.bind(this)
    this.selectPlugin = this.selectPlugin.bind(this)
    this.handlePluginClick = this.handlePluginClick.bind(this)
  }

  searchPlugins(plugins, searchString) {
    const lowerCase = searchString.toLowerCase()
    return plugins.filter((plugin) => {
      return (
        plugin.id.toLowerCase().includes(lowerCase) ||
        plugin.packageName.toLowerCase().includes(lowerCase) ||
        (plugin.description &&
          plugin.description.toLowerCase().includes(lowerCase)) ||
        plugin.name.toLowerCase().includes(lowerCase)
      )
    })
  }

  filterPluginsByStatus(plugins, statusFilter) {
    if (statusFilter === 'all') {
      return plugins
    }

    return plugins.filter((plugin) => {
      const configurationRequired =
        plugin.schema &&
        plugin.schema.properties &&
        Object.keys(plugin.schema?.properties).length != 0 &&
        plugin.data.configuration == null

      switch (statusFilter) {
        case 'enabled':
          return !configurationRequired && plugin.data.enabled
        case 'disabled':
          return !configurationRequired && !plugin.data.enabled
        case 'config-required':
          return configurationRequired
        default:
          return true
      }
    })
  }

  getFilteredPlugins() {
    // Temporarily disable caching to see if it's causing re-renders
    let filtered = this.state.plugins

    // Apply status filter
    filtered = this.filterPluginsByStatus(filtered, this.state.statusFilter)

    // Apply search filter
    if (this.state.search.length > 0) {
      filtered = this.searchPlugins(filtered, this.state.search)
    }

    return filtered
  }

  handleSearch(event) {
    const search = event.target.value
    this.setState({ search })
    localStorage.setItem(searchStorageKey, search)
  }

  handleStatusFilter(event) {
    const statusFilter = event.target.value
    this.setState({ statusFilter })
    localStorage.setItem(statusFilterStorageKey, statusFilter)
  }

  handlePluginClick(event) {
    const pluginId = event.currentTarget.getAttribute('data-plugin-id')
    const plugin = this.state.plugins.find(p => p.id === pluginId)
    
    if (plugin) {
      const currentlySelected = this.state.selectedPlugin && this.state.selectedPlugin.id === plugin.id
      this.selectPlugin(currentlySelected ? null : plugin)
    }
  }

  selectPlugin(plugin) {
    const selectedPluginId = plugin ? plugin.id : null

    // Update localStorage and state only - keep URL static for best performance
    if (selectedPluginId) {
      localStorage.setItem(openPluginStorageKey, selectedPluginId)
      this.setState({ selectedPlugin: plugin }, () => {
        // Scroll to the configuration card after it's rendered
        requestAnimationFrame(() => {
          this.scrollToConfiguration()
        })
      })
    } else {
      localStorage.removeItem(openPluginStorageKey)
      this.setState({ selectedPlugin: null })
    }
  }

  scrollToConfiguration() {
    // Find the configuration card header and scroll to show it at the top
    const configHeader = document.querySelector('#plugin-config-header')
    if (configHeader) {
      // Get the header's position and scroll with offset to show it clearly
      const headerRect = configHeader.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const targetPosition = headerRect.top + scrollTop - 60 // 60px offset from top of viewport
      
      window.scrollTo({
        top: Math.max(0, targetPosition), // Don't scroll past the top of the page
        behavior: 'smooth'
      })
    }
  }

  scrollToSelectedPlugin(selectedPluginId) {
    if (!this.tableContainer || !selectedPluginId) return
    
    // Use a more efficient approach that doesn't cause re-renders
    const selectedRow = this.tableContainer.querySelector(`[data-plugin-id="${selectedPluginId}"]`)
    if (!selectedRow) return
    
    const containerRect = this.tableContainer.getBoundingClientRect()
    const rowRect = selectedRow.getBoundingClientRect()
    
    // Check if the row is outside the visible area
    if (rowRect.bottom > containerRect.bottom || rowRect.top < containerRect.top) {
      // Calculate the scroll position to center the selected row
      const rowOffsetTop = selectedRow.offsetTop
      const containerHeight = this.tableContainer.clientHeight
      const rowHeight = selectedRow.clientHeight
      
      const targetScrollTop = rowOffsetTop - (containerHeight / 2) + (rowHeight / 2)
      
      this.tableContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      })
    }
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/plugins`, {
      credentials: 'same-origin'
    })
      .then((response) => {
        if (response.status == 200) {
          return response.json()
        } else {
          throw new Error('/plugins request failed:' + response.status)
        }
      })
      .then((plugins) => {
        // Set initial selected plugin from URL
        const currentPluginId = this.props.match.params.pluginid
        let selectedPlugin = null
        if (currentPluginId && currentPluginId !== '-') {
          selectedPlugin = plugins.find(
            (plugin) => plugin.id === currentPluginId
          )
        }

        this.setState({ plugins, selectedPlugin })
        
        // Scroll to the initially selected plugin if one exists (from URL/bookmark)
        if (selectedPlugin) {
          requestAnimationFrame(() => {
            this.scrollToSelectedPlugin(selectedPlugin.id)
          })
        }
      })
      .catch((error) => {
        console.error(error)
        alert('Could not fetch plugins list')
      })
  }

  render() {
    const pluginList = this.getFilteredPlugins()
    const selectedPluginId = this.state.selectedPlugin ? this.state.selectedPlugin.id : null

    return (
      <div>
        <Card>
          <CardHeader>
            <i className="fa fa-align-justify" />
            <strong>Plugin Configuration</strong>
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
                <Col xs="3" md="1" className={'col-form-label'}>
                  <Label htmlFor="search">Search</Label>
                </Col>
                <Col xs="12" md="4">
                  <Input
                    type="text"
                    name="search"
                    id="search"
                    onChange={this.handleSearch}
                    value={this.state.search}
                    placeholder="Search plugins..."
                  />
                </Col>
                <Col xs="3" md="2" className={'col-form-label'}>
                  <Label htmlFor="statusFilter">Filter by Status</Label>
                </Col>
                <Col xs="12" md="3">
                  <Input
                    type="select"
                    name="statusFilter"
                    id="statusFilter"
                    onChange={this.handleStatusFilter}
                    value={this.state.statusFilter}
                  >
                    <option value="all">All Plugins</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                    <option value="config-required">Config Required</option>
                  </Input>
                </Col>
              </FormGroup>
            </Form>

            <div
              ref={(container) => { this.tableContainer = container }}
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #dee2e6'
              }}
            >
              <Table
                responsive
                bordered
                striped
                size="sm"
                hover
                className="mb-0"
              >
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 1
                  }}
                >
                  <tr>
                    <th style={{ width: '25%' }}>Plugin Name</th>
                    <th style={{ width: '25%' }}>Package Name</th>
                    <th style={{ width: '35%' }}>Description</th>
                    <th style={{ width: '15%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pluginList.map((plugin) => {
                    const isSelected = selectedPluginId === plugin.id
                    const configurationRequired =
                      plugin.schema &&
                      plugin.schema.properties &&
                      Object.keys(plugin.schema?.properties).length != 0 &&
                      plugin.data.configuration == null

                    return (
                      <tr
                        key={plugin.id}
                        data-plugin-id={plugin.id}
                        onClick={this.handlePluginClick}
                        style={{ cursor: 'pointer' }}
                        className={isSelected ? 'table-active' : ''}
                      >
                        <td>
                          <strong>{plugin.name}</strong>
                        </td>
                        <td>
                          <small className="text-muted">
                            {plugin.packageName}
                          </small>
                        </td>
                        <td>
                          <small>
                            {plugin.description || 'No description available'}
                          </small>
                        </td>
                        <td>
                          {configurationRequired ? (
                            <div className="badge badge-warning">
                              <i className="fa fa-exclamation-triangle"></i>{' '}
                              Config Required
                            </div>
                          ) : (
                            <div className="d-flex align-items-center">
                              <div
                                className={`badge ${plugin.data.enabled ? 'badge-success' : 'badge-secondary'}`}
                              >
                                {plugin.data.enabled ? 'Enabled' : 'Disabled'}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          </CardBody>
        </Card>

        {this.state.selectedPlugin && (
          <PluginConfigCard
            plugin={this.state.selectedPlugin}
            isConfigurator={isConfigurator(this.state.selectedPlugin)}
            history={this.props.history}
            onClose={() => this.selectPlugin(null)}
            saveData={(data) => {
              if (this.state.selectedPlugin.data.configuration === undefined) {
                data.enabled = true
              }
              return this.saveData(this.state.selectedPlugin.id, data)
            }}
          />
        )}
      </div>
    )
  }

  saveData(id, data) {
    return fetch(`${window.serverRoutesPrefix}/plugins/${id}/config`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: new Headers({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin'
    }).then((response) => {
      if (response.status != 200) {
        console.error(response)
        alert('Saving plugin settings failed')
        throw new Error('Save failed')
      } else {
        const plugins = [...this.state.plugins]
        const pluginIndex = plugins.findIndex((plugin) => plugin.id === id)
        if (pluginIndex !== -1) {
          plugins[pluginIndex].data = data

          // Update selected plugin if it's the one being saved
          const selectedPlugin =
            this.state.selectedPlugin && this.state.selectedPlugin.id === id
              ? { ...this.state.selectedPlugin, data }
              : this.state.selectedPlugin

          this.setState({ plugins, selectedPlugin })
        }
        return true // Success
      }
    })
  }
}

const isConfigurator = (pluginData) =>
  pluginData.keywords.includes('signalk-plugin-configurator')

class PluginConfigCard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      showSaveSuccess: false
    }
  }

  showSuccessMessage = () => {
    this.setState({ showSaveSuccess: true })
    setTimeout(() => {
      this.setState({ showSaveSuccess: false })
    }, 3000) // Hide after 3 seconds
  }

  render() {
    const labelStyle = { marginLeft: '10px', marginBottom: '0px' }
    const { schema } = this.props.plugin
    const configurationRequired =
      schema &&
      schema.properties &&
      Object.keys(schema?.properties).length != 0 &&
      this.props.plugin.data.configuration == null

    return (
      <div>
        {this.state.showSaveSuccess && (
          <div
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              zIndex: 9999,
              maxWidth: '300px'
            }}
          >
            <div
              className="alert alert-success mb-0"
              role="alert"
              style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
            >
              <i className="fa fa-check"></i> Configuration saved successfully!
            </div>
          </div>
        )}
        <Card
          className="mt-3 plugin-config-card"
          ref={(card) => {
            this.configCard = card
          }}
        >
          <CardHeader id="plugin-config-header">
            <Row className="mb-2">
              <Col className={'align-self-center'}>
                <h5 className="mb-0">
                  <i className="fa fa-cog" style={{ marginRight: '10px' }} />
                  Configure: {this.props.plugin.name}
                </h5>
                <small className="text-muted">
                  {this.props.plugin.packageName}
                </small>
              </Col>
            </Row>
            {!configurationRequired && (
              <Row>
                <Col lg={4} className={'mt-2 mt-lg-0'}>
                  <Label
                    style={labelStyle}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      name="enabled"
                      className="switch-input"
                      onChange={() => {
                        this.props.saveData({
                          ...this.props.plugin.data,
                          enabled: !this.props.plugin.data.enabled
                        })
                      }}
                      checked={this.props.plugin.data.enabled}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                  <span className="ml-1">Enabled</span>
                </Col>
                <Col lg={4} className={'mt-2 mt-lg-0'}>
                  <Label
                    style={labelStyle}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      name="enableLogging"
                      className="switch-input"
                      onChange={() => {
                        this.props.saveData({
                          ...this.props.plugin.data,
                          enableLogging: !this.props.plugin.data.enableLogging
                        })
                      }}
                      checked={this.props.plugin.data.enableLogging}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                  <span className="ml-1">Data logging</span>
                </Col>
                <Col lg={4} className={'mt-2 mt-lg-0'}>
                  <Label
                    style={labelStyle}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      name="enableDebug"
                      className="switch-input "
                      onChange={() => {
                        this.props.saveData({
                          ...this.props.plugin.data,
                          enableDebug: !this.props.plugin.data.enableDebug
                        })
                      }}
                      checked={this.props.plugin.data.enableDebug}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                  <span className="ml-1">Enable debug log</span>
                </Col>
              </Row>
            )}
          </CardHeader>
          <CardBody>
            {!this.props.isConfigurator && (
              <div>
                <PluginConfigurationForm
                  plugin={this.props.plugin}
                  onSubmit={(data) => {
                    this.props
                      .saveData(data)
                      .then(() => {
                        this.showSuccessMessage()
                      })
                      .catch(() => {
                        // Error is already handled in saveData with alert
                      })
                  }}
                />
                {/* Sticky submit button */}
                <div
                  style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 1000,
                    backgroundColor: '#fff',
                    padding: '10px',
                    borderRadius: '5px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    border: '1px solid #dee2e6'
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      // Find and trigger the form's submit button
                      const formSubmitBtn = document.querySelector('.plugin-config-card form button[type="submit"]')
                      if (formSubmitBtn) {
                        formSubmitBtn.click()
                      }
                    }}
                    style={{ minWidth: '100px' }}
                  >
                    <i className="fa fa-save" style={{ marginRight: '8px' }}></i>
                    Submit
                  </button>
                </div>
              </div>
            )}
            {this.props.isConfigurator && (
              <EmbeddedPluginConfigurationForm {...this.props} />
            )}
          </CardBody>
        </Card>
      </div>
    )
  }
}
