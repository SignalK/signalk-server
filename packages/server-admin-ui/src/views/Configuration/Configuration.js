import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import { connect } from 'react-redux'
import PluginConfigurationForm from './../ServerConfig/PluginConfigurationForm'
import {Button, Card, CardBody, CardHeader, Collapse} from 'reactstrap'

class Dashboard extends Component {
  constructor(props) {
    super()
    this.state = {
      plugins: []
    }
    this.lastOpenedPlugin = '--'
  }

  toggleForm(clickedIndex, id) {
    const openedPluginId = this.props.match.params.pluginid === id ? '-' : id
    this.props.history.push(`/serverConfiguration/plugins/${openedPluginId}`)
  }

  componentDidMount() {
    fetch(`/plugins`, {credentials: 'same-origin'}).then((response) => {
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

  shouldComponentUpdate(nextProps, nextState) {
    const shouldUpdate = this.lastOpenedPlugin !== this.props.match.params.pluginid || this.state.plugins.length != nextState.plugins.length
    this.lastOpenedPlugin = this.props.match.params.pluginid

    return shouldUpdate
  }

  render () {
    return (
      <div>
        {this.state.plugins.map((plugin, i) => {
          const isOpen = this.props.match.params.pluginid === plugin.id
          return (
            <PluginCard
              plugin={plugin}
              key={i}
              isOpen={isOpen}
              toggleForm={this.toggleForm.bind(this, i, plugin.id)}
              saveData={saveData.bind(null, plugin.id)}/>
        )})}
      </div>
    )
  }
}

function saveData(id, data) {
  fetch('/plugins/' + id + "/config", {
    method: 'POST',
    body: JSON.stringify(data),
    headers: new Headers({'Content-Type': 'application/json'}),
    credentials: 'same-origin'
  }).then((response) => {
    if (response.status != 200) {
      console.error(response)
      alert('Saving plugin settings failed')
    }
  })
}


class PluginCard extends Component {
  render() {
    return (
    <div ref={(card) => { this.card = card }}>
    <Card key={this.props.i}>
    <CardHeader onClick={this.props.toggleForm}>
      <i className={'fa fa-chevron-' + (this.props.isOpen ? 'down':'right')}/>
      {this.props.plugin.name}
    </CardHeader>
    <Collapse isOpen={this.props.isOpen}>
      <CardBody>
        <PluginConfigurationForm plugin={this.props.plugin} onSubmit={this.props.saveData}/>
      </CardBody>
    </Collapse>
  </Card>
  </div>
    )
  }

  componentDidMount() {
    if (this.props.isOpen) {
      // ReactDOM.findDOMNode(this.card).scrollIntoView()
      window.scrollTo({top: this.card.offsetTop -54})
    }
  }
}


export default connect(({ serverStatistics }) => ({ serverStatistics }))(
  Dashboard
)
