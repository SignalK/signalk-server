import React, { Component } from 'react'
import { connect } from 'react-redux'
import classnames from 'classnames'
import {
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
  Table,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Row
} from 'reactstrap'

import BasicProvider from './BasicProvider'
import { set } from 'lodash'

function fetchProviders () {
  fetch(`/providers`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState({ providers: data })
    })
}

function onRowSelect (row, isSelected, e) {
  // if column index is 2, will not trigger selection
  if (e.target.cellIndex === 2) return false
}

class ProvidersConfiguration extends Component {
  constructor (props) {
    super(props)
    this.state = {
      activeTab: '1',
      providers: []
    }

    this.fetchProviders = fetchProviders.bind(this)
    this.handleProviderChange = this.handleProviderChange.bind(this)
    this.handleAddProvider = this.handleAddProvider.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.toggle = this.toggle.bind(this)
    this.handleApply = this.handleApply.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleDelete = this.handleDelete.bind(this)
  }

  componentDidMount () {
    this.fetchProviders()
  }

  handleProviderChange (event, type) {
    console.log(
      `handleProviderChange: ${event.target.type} ${event.target.checked}`
    )
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

  handleAddProvider (event) {
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

  handleApply (event) {
    var isNew = this.state.selectedProvider.isNew

    var provider = this.state.selectedProvider
    delete this.state.selectedProvider.json

    var id = this.state.selectedProvider.originalId 

    fetch(`/providers/${id || ''}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.state.selectedProvider),
      credentials: 'include'
    })
      .then(response => {
        if ( response.ok ) {
          var provider = JSON.parse(JSON.stringify(this.state.selectedProvider))
          delete provider.isNew
          delete this.state.selectedProvider.isNew
          if (isNew) {
            this.state.providers.push(provider)
          } else {
          this.state.providers[this.state.selectedIndex] = provider
          }
          this.setState({
            providers: this.state.providers,
            selectedProvider: null,
            selectedIndex: -1
          })
        }
        return response.text()
      })
      .then(text => {
        alert(text)
      })
  }

  handleCancel (event) {
    this.setState({ selectedProvider: null })
  }

  handleDelete (event) {
    fetch(`/providers/${this.state.selectedProvider.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        this.state.providers.splice(this.state.selectedIndex, 1)
        this.setState({
          providers: this.state.providers,
          selectedProvider: null,
          selectedIndex: -1
        })
        alert(response)
      })
  }

  providerClicked (provider, index) {
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

  toggle (tab) {
    if (this.state.activeTab !== tab) {
      this.setState({
        activeTab: tab
      })
    }
  }

  render () {
    return (
      <div className='animated fadeIn'>
        <Card>
          <CardBody>
            <Table hover responsive bordered striped size='sm'>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Input Type</th>
                  <th>Enabled</th>
                  <th>Logging</th>
                </tr>
              </thead>
              <tbody>
                {(this.state.providers || []).map((provider, index) => {
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
                })}
              </tbody>
            </Table>
          </CardBody>
          <CardFooter>
            <Button size='sm' color='primary' onClick={this.handleAddProvider}>
              <i className='fa fa-plus-circle' /> Add
            </Button>
          </CardFooter>
        </Card>

        {this.state.selectedProvider && (
          <div ref='selectedProvider'>
            <Card>
              <CardBody>
                {this.state.selectedProvider.editable ? (
                  <BasicProvider
                    value={this.state.selectedProvider}
                    onChange={this.handleProviderChange}
                    key={Date.now()}
                  />
                ) : (
                  <Input
                    type='textarea'
                    name='json'
                    id='json'
                    rows='20'
                    value={this.state.selectedProvider.json}
                    readOnly='true'
                  />
                )}
              </CardBody>
              <CardFooter>
                {this.state.selectedProvider.editable ? (
                  <Row>
                    <Col xs='4' md='1'>
                      <Button
                        size='sm'
                        color='primary'
                        onClick={this.handleApply}
                      >
                        <i className='fa fa-dot-circle-o' /> Apply
                      </Button>
                    </Col>
                    <Col xs='4' md='1'>
                      <Button
                        size='sm'
                        color='secondary'
                        onClick={this.handleCancel}
                      >
                        <i className='fa fa-ban' /> Cancel
                      </Button>
                    </Col>
                    <Col xs='4' md='10' className='text-right'>
                      <Button
                        size='sm'
                        color='danger'
                        onClick={this.handleDelete}
                      >
                        <i className='fa fa-ban' /> Delete
                      </Button>
                    </Col>
                  </Row>
                ) : (
                  <Row>
                    <Col xs='4' md='12' className='text-right'>
                      <Button
                        size='sm'
                        color='danger'
                        onClick={this.handleDelete}
                      >
                        <i className='fa fa-ban' /> Delete
                      </Button>
                    </Col>
                  </Row>
                )}
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    )
  }
}

const ApplicableStatus = props => (
  <div>{props.applicable ? (props.toggle ? 'Yes' : 'No') : 'N/A'}</div>
)

const ProviderType = props => (
  <div>
    {props.provider.type}
    {props.provider.type === 'FileStream'
      ? `/${props.provider.options.dataType}`
      : ''}
  </div>
)

export default connect()(ProvidersConfiguration)
