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

export default class PluginConfigurationList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      plugins: [],
      search: localStorage.getItem(searchStorageKey) || '',
      searchResults: null,
      selectedPlugin: null
    }
    this.lastOpenedPlugin = '--'
    this.handleSearch = this.handleSearch.bind(this)
    this.selectPlugin = this.selectPlugin.bind(this)
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

  handleSearch(event) {
    let searchResults = null
    const search = event.target.value
    if (search.length !== 0) {
      searchResults = this.searchPlugins(this.state.plugins, search)
    }

    this.setState({ search, searchResults })
    localStorage.setItem(searchStorageKey, event.target.value)
  }

  selectPlugin(plugin) {
    const selectedPluginId = plugin ? plugin.id : null
    const openedPluginId =
      this.props.match.params.pluginid === selectedPluginId
        ? '-'
        : selectedPluginId || '-'

    if (
      selectedPluginId &&
      this.props.match.params.pluginid !== selectedPluginId
    ) {
      localStorage.setItem(openPluginStorageKey, selectedPluginId)
      this.setState({ selectedPlugin: plugin })
    } else {
      localStorage.removeItem(openPluginStorageKey)
      this.setState({ selectedPlugin: null })
    }
    this.props.history.replace(`/serverConfiguration/plugins/${openedPluginId}`)
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
        let searchResults
        if (this.state.search.length > 0) {
          searchResults = this.searchPlugins(plugins, this.state.search)
        }

        // Set initial selected plugin from URL
        const currentPluginId = this.props.match.params.pluginid
        let selectedPlugin = null
        if (currentPluginId && currentPluginId !== '-') {
          selectedPlugin = plugins.find(
            (plugin) => plugin.id === currentPluginId
          )
        }

        this.setState({ plugins, searchResults, selectedPlugin })
      })
      .catch((error) => {
        console.error(error)
        alert('Could not fetch plugins list')
      })
  }

  render() {
    const pluginList = this.state.searchResults || this.state.plugins
    const selectedPluginId = this.props.match.params.pluginid

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
                  <Label htmlFor="select">Search</Label>
                </Col>
                <Col xs="12" md="4">
                  <Input
                    type="text"
                    name="search"
                    onChange={this.handleSearch}
                    value={this.state.search}
                  />
                </Col>
              </FormGroup>
            </Form>

            <div
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
                  {pluginList.map((plugin, i) => {
                    const isSelected = selectedPluginId === plugin.id
                    const configurationRequired =
                      plugin.schema &&
                      plugin.schema.properties &&
                      Object.keys(plugin.schema?.properties).length != 0 &&
                      plugin.data.configuration == null

                    return (
                      <tr
                        key={i}
                        onClick={() =>
                          this.selectPlugin(isSelected ? null : plugin)
                        }
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
          className="mt-3"
          ref={(card) => {
            this.configCard = card
          }}
        >
          <CardHeader>
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
