import React, { Component } from 'react'
import { Alert, Button, Card, CardHeader, CardBody } from 'reactstrap'
import { connect } from 'react-redux'
import {withRouter} from "react-router-dom";
import ReactMarkdown from 'react-markdown'

class ServerUpdate extends Component {
  constructor (props) {
    super(props)
    this.state = {
      chanelog: null
    }

    this.handleUpdate = this.handleUpdate.bind(this)
    this.fetchChangelog = this.fetchChangelog.bind(this)
    this.fetchChangelog()
  }

  fetchChangelog (version) {
    fetch(`https://raw.githubusercontent.com/SignalK/signalk-server-node/master/CHANGELOG.md`)
      .then(response => response.text())
      .then(data => {
        this.setState({ changelog:data  })
    })
  }

  handleUpdate () {
    console.log('handleUpdate')
    if (confirm(`Are you sure you want to update the server?'`)) {
      this.props.history.push('/appstore/updates')
      fetch(`/appstore/install/signalk-server/${this.props.appStore.serverUpdate}`, {
        method: 'POST',
        credentials: 'include'
      }).then(() => {
        this.history.pushState(null, 'appstore/updates');
      })
    }
  }

  render () {
    let isInstalling = false
    let isInstalled = false
    let info = this.props.appStore.installing.find(p => p.name == 'signalk-server')
    if ( info ) {
      if ( info.isWaiting || info.isInstalling ) {
        isInstalling = true
      } else {
        isInstalled = true
      }
    }
    return (
       <div className='animated fadeIn'>
        {!this.props.appStore.canUpdateServer && (
          <Card className='border-warning'>
            <CardHeader>Server Update</CardHeader>
            <CardBody>
            This installation is not updatable.
            </CardBody>
          </Card>
        )}
      {this.props.appStore.canUpdateServer && this.props.appStore.serverUpdate && !isInstalling && !isInstalled  && (
        <Card>
            <CardHeader>Version {this.props.appStore.serverUpdate} is available <Button className="btn btn-danger float-right" size='sm' color='primary' onClick={this.handleUpdate}>Update</Button></CardHeader>
          <CardBody>
     
          <ReactMarkdown source={this.state.changelog} />
            </CardBody>
            </Card>
        
      )}
      {isInstalling && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>
            The update is being installed
          </CardBody>
         </Card>
      )}
      {isInstalled && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>
          The update has been installed, please reboot
          </CardBody>
         </Card>
      )}
      {this.props.appStore.canUpdateServer && !this.props.appStore.serverUpdate  && (
        <Card>
            <CardHeader>Server Update</CardHeader>
          <CardBody>
          Your server is up to date.
            </CardBody>
          </Card>
      )}
      </div>
    )
  }
}

export default connect(({ appStore }) => ({ appStore }))(withRouter(ServerUpdate))
