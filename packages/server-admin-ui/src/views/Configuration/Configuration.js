import React, { Component } from 'react'
import PluginConfigurationForm from './../ServerConfig/PluginConfigurationForm'
import { Button, Container, Card, CardBody, CardHeader, Row, Col, Input, Label } from 'reactstrap'
import EmbeddedPluginConfigurationForm from './EmbeddedPluginConfigurationForm'
import { Fragment } from 'react'

export default class PluginConfigurationList extends Component {
  constructor() {
    super()
    this.state = {
      plugins: []
    }
    this.lastOpenedPlugin = '--'
  }

  toggleForm(clickedIndex, id) {
    const openedPluginId = this.props.match.params.pluginid === id ? '-' : id
    this.props.history.replace(`/serverConfiguration/plugins/${openedPluginId}`)
  }

  componentDidMount() {
    fetch(`${window.serverRoutesPrefix}/plugins`, {credentials: 'same-origin'}).then((response) => {
      if (response.status == 200) {
        return response.json()
      } else {
        throw new Error('/plugins request failed:' + response.status)
      }
    }).then(plugins => this.setState({plugins}))
    .catch(error => {
      console.error (error)
      alert('Could not fetch plugins list')
    })
  }

  render () {
    return (
      <Container>
        {this.state.plugins.map((plugin, i) => {
          const isOpen = this.props.match.params.pluginid === plugin.id
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
              }}/>
        )})}
      </Container>
    )
  }

  saveData(id, data, i) {
    fetch(`${window.serverRoutesPrefix}/plugins/${id}/config`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: new Headers({'Content-Type': 'application/json'}),
      credentials: 'same-origin'
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

const isConfigurator = (pluginData) => pluginData.keywords.includes('signalk-plugin-configurator')

class PluginCard extends Component {
  render() {
    const labelStyle = {marginLeft: '10px', marginBottom: '0px'}
    return (
    <div ref={(card) => { this.card = card }}>
    <Card>
      <CardHeader >
        <Row>
          <Col xs={4} onClick={this.props.toggleForm}>
            <i style={{marginRight: '10px'}} className={'fa fa-chevron-' + (this.props.isOpen ? 'down' : 'right')} />
            {this.props.plugin.name}
          </Col>
              {!this.props.plugin.data.configuration &&  !this.props.isOpen && (
                <Col xs='2'>
                <Button
                  size='sm'
                  color='primary'
                  style={{width: '100%'}}
                  onClick={this.props.toggleForm}
                >
                  Configure
                </Button>
                </Col>
              )}
          {this.props.plugin.data.configuration &&  (
            <Fragment>
              <Col xs='2'>
                  Enabled
                  <Label style={labelStyle} className='switch switch-text switch-primary'>
                    <Input
                      type='checkbox'
                      name='enabled'
                      className='switch-input'
                      onChange={(e) => {
                        this.props.saveData({...this.props.plugin.data, enabled: !this.props.plugin.data.enabled})
                      }}
                      checked={this.props.plugin.data.enabled}
                    />
                    <span className='switch-label' data-on='Yes' data-off='No' />
                    <span className='switch-handle' />
                  </Label>
              </Col>
              <Col xs='3'>
                Log plugin output
                  <Label style={labelStyle} className='switch switch-text switch-primary'>
                    <Input
                      type='checkbox'
                      name='enableLogging'
                      className='switch-input'
                      onChange={(e) => {
                        this.props.saveData({...this.props.plugin.data, enableLogging: !this.props.plugin.data.enableLogging})
                      }}
                      checked={this.props.plugin.data.enableLogging}
                    />
                    <span className='switch-label' data-on='Yes' data-off='No' />
                    <span className='switch-handle' />
                  </Label>
              </Col>
              <Col xs='3'>
                Enable debug log
                  <Label style={labelStyle} className='switch switch-text switch-primary'>
                    <Input
                      type='checkbox'
                      name='enableDebug'
                      className='switch-input'
                      onChange={(e) => {
                        this.props.saveData({...this.props.plugin.data, enableDebug: !this.props.plugin.data.enableDebug})
                      }}
                      checked={this.props.plugin.data.enableDebug}
                    />
                    <span className='switch-label' data-on='Yes' data-off='No' />
                    <span className='switch-handle' />
                  </Label>
              </Col>
            </Fragment>
          )}
        </Row>
      </CardHeader>
      {  this.props.isOpen &&
      <CardBody>
        {!this.props.isConfigurator && <PluginConfigurationForm
          plugin={this.props.plugin}
          onSubmit={this.props.saveData}/>}
        {this.props.isConfigurator && <EmbeddedPluginConfigurationForm {...this.props}/>}
      </CardBody>
      }
  </Card>
  </div>
    )
  }

  componentDidMount() {
    if (this.props.isOpen) {
      window.scrollTo({top: this.card.offsetTop -54, behavior: 'smooth'})
    }
  }
}
