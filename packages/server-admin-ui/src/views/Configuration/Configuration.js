import React, { Component } from 'react'
import PluginConfigurationForm from './../ServerConfig/PluginConfigurationForm'
import {
  Button,
  Container,
  Card,
  CardBody,
  CardHeader,
  Row,
  Col,
  Input,
  Label,
  Form,
  FormGroup,
} from 'reactstrap'
import EmbeddedPluginConfigurationForm from './EmbeddedPluginConfigurationForm'
import { Fragment } from 'react'

const searchStorageKey = 'admin.v1.plugins.search'
const openPluginStorageKey = 'admin.v1.plugins.openPlugin'

export default class PluginConfigurationList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      plugins: [],
      search: localStorage.getItem(searchStorageKey) || '',
      searchResults: null,
    }
    this.lastOpenedPlugin = '--'
    this.handleSearch = this.handleSearch.bind(this)
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

  toggleForm(clickedIndex, id) {
    const openedPluginId = this.props.match.params.pluginid === id ? '-' : id
    if (this.props.match.params.pluginid === id) {
      localStorage.removeItem(openPluginStorageKey)
    } else {
      localStorage.setItem(openPluginStorageKey, openedPluginId)
    }
    this.props.history.replace(`/serverConfiguration/plugins/${openedPluginId}`)
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/plugins`, {
      credentials: 'same-origin',
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
        this.setState({ plugins, searchResults })
      })
      .catch((error) => {
        console.error(error)
        alert('Could not fetch plugins list')
      })
  }

  render() {
    return (
      <Container>
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
        {(this.state.searchResults || this.state.plugins).map((plugin, i) => {
          //const isOpen = this.props.match.params.pluginid === plugin.id
          const isOpen =
            localStorage.getItem(openPluginStorageKey) === plugin.id
          return (
            <PluginCard
              plugin={plugin}
              isConfigurator={isConfigurator(plugin)}
              key={i}
              isOpen={isOpen}
              toggleForm={this.toggleForm.bind(this, i, plugin.id)}
              saveData={(data) => {
                if (plugin.data.configuration === undefined) {
                  data.enabled = true
                }
                this.props.history.replace(`/serverConfiguration/plugins/-`)
                this.saveData(plugin.id, data, i)
              }}
            />
          )
        })}
      </Container>
    )
  }

  saveData(id, data, i) {
    fetch(`${window.serverRoutesPrefix}/plugins/${id}/config`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: new Headers({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
    }).then((response) => {
      if (response.status != 200) {
        console.error(response)
        alert('Saving plugin settings failed')
      } else {
        const plugins = [...this.state.plugins]
        plugins[i].data = data
        this.setState({ plugins })
      }
    })
  }
}

const isConfigurator = (pluginData) =>
  pluginData.keywords.includes('signalk-plugin-configurator')

class PluginCard extends Component {
  render() {
    const labelStyle = { marginLeft: '10px', marginBottom: '0px' }
    const { schema } = this.props.plugin
    const noConfigurationRequired =
      schema &&
      schema.properties &&
      Object.keys(this.props.plugin.schema.properties).length == 0
    const canbeEnabled =
      this.props.plugin.data.configuration || noConfigurationRequired
    return (
      <div
        ref={(card) => {
          this.card = card
        }}
      >
        <Card>
          <CardHeader>
            <Row>
              <Col xs={4} onClick={this.props.toggleForm}>
                <i
                  style={{ marginRight: '10px' }}
                  className={
                    'fa fa-chevron-' + (this.props.isOpen ? 'down' : 'right')
                  }
                />
                {this.props.plugin.name}
              </Col>
              {!this.props.plugin.data.configuration && !this.props.isOpen && (
                <Col xs="2">
                  <Button
                    size="sm"
                    color="primary"
                    style={{ width: '100%' }}
                    onClick={this.props.toggleForm}
                  >
                    Configure
                  </Button>
                </Col>
              )}
              {canbeEnabled && (
                <Fragment>
                  <Col xs="2">
                    Enabled
                    <Label
                      style={labelStyle}
                      className="switch switch-text switch-primary"
                    >
                      <Input
                        type="checkbox"
                        name="enabled"
                        className="switch-input"
                        onChange={(e) => {
                          this.props.saveData({
                            ...this.props.plugin.data,
                            enabled: !this.props.plugin.data.enabled,
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
                  </Col>
                  <Col xs="3">
                    Data Logging
                    <Label
                      style={labelStyle}
                      className="switch switch-text switch-primary"
                    >
                      <Input
                        type="checkbox"
                        name="enableLogging"
                        className="switch-input"
                        onChange={(e) => {
                          this.props.saveData({
                            ...this.props.plugin.data,
                            enableLogging:
                              !this.props.plugin.data.enableLogging,
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
                  </Col>
                  <Col xs="3">
                    Enable debug log
                    <Label
                      style={labelStyle}
                      className="switch switch-text switch-primary"
                    >
                      <Input
                        type="checkbox"
                        name="enableDebug"
                        className="switch-input"
                        onChange={(e) => {
                          this.props.saveData({
                            ...this.props.plugin.data,
                            enableDebug: !this.props.plugin.data.enableDebug,
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
                  </Col>
                </Fragment>
              )}
            </Row>
          </CardHeader>
          {this.props.isOpen && (
            <CardBody>
              {!this.props.isConfigurator && (
                <PluginConfigurationForm
                  plugin={this.props.plugin}
                  onSubmit={this.props.saveData}
                />
              )}
              {this.props.isConfigurator && (
                <EmbeddedPluginConfigurationForm {...this.props} />
              )}
            </CardBody>
          )}
        </Card>
      </div>
    )
  }

  componentDidMount() {
    if (this.props.isOpen) {
      window.scrollTo({ top: this.card.offsetTop - 54, behavior: 'smooth' })
    }
  }
}
