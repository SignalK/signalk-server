import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Col,
  Table,
  Row
} from 'reactstrap'

import BasicProvider from './BasicProvider'
import SourcePriorities from './SourcePriorities'
import set from 'lodash.set'

function fetchProviders() {
  fetch(`${window.serverRoutesPrefix}/providers`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((data) => {
      let selectedProvider = undefined
      let selectedIndex = undefined
      if (this.state.selectedProviderId) {
        selectedProvider = data.find(
          (provider) => provider.id === this.state.selectedProviderId
        )
        selectedIndex = data.findIndex(
          (provider) => provider.id === this.state.selectedProviderId
        )
      }
      if (selectedProvider) {
        selectedProvider.originalId = selectedProvider.id
      }
      this.setState({
        providers: data,
        selectedProvider: selectedProvider
          ? JSON.parse(JSON.stringify(selectedProvider))
          : undefined,
        selectedIndex: selectedIndex
      })
    })
}

function runDiscovery() {
  fetch(`${window.serverRoutesPrefix}/runDiscovery`, {
    method: 'PUT',
    credentials: 'include'
  })
}

class ProvidersConfiguration extends Component {
  constructor(props) {
    super(props)
    this.state = {
      activeTab: '1',
      providers: [],
      selectedProviderId: this.props.match.params.providerId
    }

    this.fetchProviders = fetchProviders.bind(this)
    this.runDiscovery = runDiscovery.bind(this)
    this.handleProviderChange = this.handleProviderChange.bind(this)
    this.handleProviderPropChange = this.handleProviderChange.bind(this)
    this.handleAddProvider = this.handleAddProvider.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.toggle = this.toggle.bind(this)
    this.handleApply = this.handleApply.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleDelete = this.handleDelete.bind(this)
  }

  componentDidMount() {
    this.fetchProviders()
    this.runDiscovery()
  }

  handleProviderChange(event, type) {
    var value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    if (type === 'number') {
      value = Number(value)
    }
    set(this.state.selectedProvider, event.target.name, value)
    this.setState({
      selectedProvider: this.state.selectedProvider
    })
  }

  handleProviderPropChange() {
    this.setState({
      selectedProvider: this.state.selectedProvider
    })
  }

  handleAddProvider() {
    var newProvider = {
      type: 'NMEA2000',
      logging: false,
      isNew: true,
      id: '',
      enabled: true,
      options: {},
      editable: true
    }
    this.setState(
      {
        selectedProvider: JSON.parse(JSON.stringify(newProvider)),
        selectedIndex: this.state.providers.length - 1
      },
      () => {
        this.refs['selectedProvider'].scrollIntoView()
      }
    )
  }

  handleApply() {
    var isNew = this.state.selectedProvider.isNew
    var wasDiscovered = this.state.selectedProvider.wasDiscovered

    delete this.state.selectedProvider.json

    var id = this.state.selectedProvider.originalId

    fetch(`${window.serverRoutesPrefix}/providers/${id && !isNew ? id : ''}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state.selectedProvider),
      credentials: 'include'
    })
      .then((response) => {
        if (response.ok) {
          var provider = JSON.parse(JSON.stringify(this.state.selectedProvider))
          delete provider.isNew
          delete provider.wasDiscovered
          delete this.state.selectedProvider.isNew
          if (isNew) {
            this.state.providers.push(provider)
          } else {
            this.state.providers[this.state.selectedIndex] = provider
          }
          if (wasDiscovered) {
            this.props.discoveredProviders.splice(this.state.selectedIndex, 1)
          }
          this.setState(
            {
              providers: this.state.providers,
              //discoveredProviders: this.state.discoveredProviders,
              selectedProvider: null,
              selectedIndex: -1
            },
            () => {
              this.props.history.push('/serverConfiguration/connections/-')
            }
          )
        }
        return response.text()
      })
      .then((text) => {
        alert(text)
      })
  }

  handleCancel() {
    this.setState({ selectedProvider: null })
  }

  handleDelete() {
    fetch(
      `${window.serverRoutesPrefix}/providers/${this.state.selectedProvider.id}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
      .then((response) => response.text())
      .then((response) => {
        this.state.providers.splice(this.state.selectedIndex, 1)
        this.setState({
          providers: this.state.providers,
          selectedProvider: null,
          selectedIndex: -1
        })
        alert(response)
      })
  }

  providerClicked(provider, index) {
    this.setState(
      {
        selectedProvider: {
          ...JSON.parse(JSON.stringify(provider)),
          originalId: provider.id
        },
        selectedIndex: index
      },
      () => {
        this.refs['selectedProvider'].scrollIntoView()
      }
    )
  }

  toggle(tab) {
    if (this.state.activeTab !== tab) {
      this.setState({
        activeTab: tab
      })
    }
  }

  render() {
    return (
      <div className="animated fadeIn">
        {this.props.discoveredProviders &&
          this.props.discoveredProviders.length > 0 && (
            <Card>
              <CardHeader>Discovered Connections</CardHeader>
              <CardBody>
                <Table hover responsive bordered striped size="sm">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Data Type</th>
                      <th>Enabled</th>
                      <th>Data Logging</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(this.props.discoveredProviders || []).map(
                      (provider, index) => {
                        return (
                          <tr
                            onClick={this.providerClicked.bind(
                              this,
                              provider,
                              index
                            )}
                            key={provider.id}
                          >
                            <td>{provider.id}</td>
                            <td>
                              <ProviderType provider={provider} />
                            </td>
                            <td>
                              <ApplicableStatus
                                applicable={provider.editable}
                                toggle={provider.enabled}
                              />
                            </td>
                            <td>
                              <ApplicableStatus
                                applicable={provider.editable}
                                toggle={provider.logging}
                              />
                            </td>
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        <Card>
          <CardHeader>Connections</CardHeader>
          <CardBody>
            <Table hover responsive bordered striped size="sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data Type</th>
                  <th>Enabled</th>
                  <th>Data Logging</th>
                </tr>
              </thead>
              <tbody>
                {(this.state.providers || []).map((provider, index) => {
                  return (
                    <tr
                      onClick={this.providerClicked.bind(this, provider, index)}
                      key={provider.id}
                    >
                      <td>{provider.id}</td>
                      <td>
                        <ProviderType provider={provider} />
                      </td>
                      <td>
                        <ApplicableStatus
                          applicable={provider.editable}
                          toggle={provider.enabled}
                        />
                      </td>
                      <td>
                        <ApplicableStatus
                          applicable={provider.editable}
                          toggle={provider.logging}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </CardBody>
          <CardFooter>
            <Button size="sm" color="primary" onClick={this.handleAddProvider}>
              <i className="fa fa-plus-circle" /> Add
            </Button>
          </CardFooter>
        </Card>

        {this.state.selectedProvider && (
          <div ref="selectedProvider" style={{ scrollMarginTop: '54px' }}>
            <Card>
              <CardBody>
                {this.state.selectedProvider.editable ? (
                  <BasicProvider
                    value={this.state.selectedProvider}
                    onChange={this.handleProviderChange}
                    onPropChange={this.handleProviderPropChange}
                  />
                ) : (
                  <Input
                    type="textarea"
                    name="json"
                    id="json"
                    rows="20"
                    value={this.state.selectedProvider.json}
                    readOnly="true"
                  />
                )}
              </CardBody>
              <CardFooter>
                {this.state.selectedProvider.editable ? (
                  <Row>
                    <Col xs="4" md="1">
                      <Button
                        size="sm"
                        color="primary"
                        onClick={this.handleApply}
                      >
                        <i className="fa fa-dot-circle-o" /> Apply
                      </Button>
                    </Col>
                    <Col xs="4" md="1">
                      <Button
                        size="sm"
                        color="secondary"
                        onClick={this.handleCancel}
                      >
                        <i className="fa fa-ban" /> Cancel
                      </Button>
                    </Col>
                    <Col xs="4" md="10" className="text-right">
                      <Button
                        size="sm"
                        color="danger"
                        onClick={this.handleDelete}
                      >
                        <i className="fa fa-ban" /> Delete
                      </Button>
                    </Col>
                  </Row>
                ) : (
                  <Row>
                    <Col xs="4" md="12" className="text-right">
                      <Button
                        size="sm"
                        color="danger"
                        onClick={this.handleDelete}
                      >
                        <i className="fa fa-ban" /> Delete
                      </Button>
                    </Col>
                  </Row>
                )}
              </CardFooter>
            </Card>
          </div>
        )}

        <SourcePriorities />
      </div>
    )
  }
}

const ApplicableStatus = (props) => (
  <div>{props.applicable ? (props.toggle ? 'Yes' : 'No') : 'N/A'}</div>
)

const ProviderType = (props) => (
  <div>
    {props.provider.type}
    {props.provider.type === 'FileStream'
      ? `/${props.provider.options.dataType}`
      : ''}
  </div>
)
const mapStateToProps = ({ discoveredProviders }) => ({ discoveredProviders })

export default connect(mapStateToProps)(ProvidersConfiguration)
