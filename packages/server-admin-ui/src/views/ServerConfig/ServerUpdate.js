import React, { Component } from 'react'
import { Alert, Button, Card, CardHeader, CardBody } from 'reactstrap'
import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'

class ServerUpdate extends Component {
  constructor(props) {
    super(props)
    this.state = {
      chanelog: null,
    }

    this.handleUpdate = this.handleUpdate.bind(this)
    this.fetchChangelog = this.fetchChangelog.bind(this)
    this.fetchChangelog()
  }

  fetchChangelog(version) {
    fetch(
      `https://raw.githubusercontent.com/SignalK/signalk-server-node/master/CHANGELOG.md`
    )
      .then((response) => response.text())
      .then((data) => {
        this.setState({ changelog: data })
      })
  }

  handleUpdate() {
    console.log('handleUpdate')
    if (confirm(`Are you sure you want to update the server?'`)) {
      this.props.history.push('/appstore/updates')
      fetch(
        `${window.serverRoutesPrefix}/appstore/install/signalk-server/${this.props.appStore.serverUpdate}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      ).then(() => {
        this.history.pushState(null, 'appstore/updates')
      })
    }
  }

  render() {
    if (!this.props.appStore.storeAvailable) {
      return (
        <div className="animated fadeIn">
          <Card>
            <CardHeader>Waiting for App store data to load...</CardHeader>
          </Card>
        </div>
      )
    }
    let isInstalling = false
    let isInstalled = false
    let info = this.props.appStore.installing.find(
      (p) => p.name == 'signalk-server'
    )
    if (info) {
      if (info.isWaiting || info.isInstalling) {
        isInstalling = true
      } else {
        isInstalled = true
      }
    }
    return (
      <div className="animated fadeIn">
        {!this.props.appStore.canUpdateServer && (
          <Card className="border-warning">
            <CardHeader>Server Update</CardHeader>
            <CardBody>
              This installation is not updatable from the admin user interface.
            </CardBody>
          </Card>
        )}
        {this.props.appStore.isInDocker && (
          <Card className="border-warning">
            <CardHeader>Running as a Docker container</CardHeader>
            <CardBody>
              The server is running as a Docker container. You need to pull a
              new server version from{' '}
              <a href="https://hub.docker.com/r/signalk/signalk-server/tags">
                Docker Hub
              </a>{' '}
              to update.
            </CardBody>
          </Card>
        )}
        {this.props.appStore.canUpdateServer &&
          this.props.appStore.serverUpdate &&
          !isInstalling &&
          !isInstalled && (
            <Card>
              <CardHeader>
                Server version {this.props.appStore.serverUpdate} is available
              </CardHeader>
              <CardBody>
                <a href="https://github.com/SignalK/signalk-server/releases/">
                  Release Notes for latest releases.
                </a>
                <br />
                <br />
                <Button
                  className="btn btn-danger"
                  size="sm"
                  color="primary"
                  onClick={this.handleUpdate}
                >
                  Update
                </Button>
              </CardBody>
            </Card>
          )}
        {isInstalling && (
          <Card>
            <CardHeader>Server Update</CardHeader>
            <CardBody>The update is being installed</CardBody>
          </Card>
        )}
        {isInstalled && (
          <Card>
            <CardHeader>Server Update</CardHeader>
            <CardBody>
              The update has been installed, please restart the Signal K server.
            </CardBody>
          </Card>
        )}
        {this.props.appStore.canUpdateServer &&
          !this.props.appStore.serverUpdate && (
            <Card>
              <CardHeader>Server Update</CardHeader>
              <CardBody>Your server is up to date.</CardBody>
            </Card>
          )}
      </div>
    )
  }
}

export default connect(({ appStore }) => ({ appStore }))(
  withRouter(ServerUpdate)
)
