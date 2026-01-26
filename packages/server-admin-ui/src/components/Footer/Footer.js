import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router-dom'

class Footer extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    const { name, mmsi, uuid } = this.props.vesselInfo
    return (
      <footer className="app-footer">
        <span>
          <a href="https://github.com/SignalK/signalk-server-node/">
            Signal K Server
          </a>
        </span>
        {typeof this.props.serverSpecification.server !== 'undefined' && (
          <span>
            &nbsp; version {this.props.serverSpecification.server.version}
          </span>
        )}
        <span>
          &nbsp;{' '}
          <a href="https://opencollective.com/signalk">Sponsor Signal K</a>
        </span>
        {typeof this.props.appStore.serverUpdate !== 'undefined' && (
          <span>
            <Link to="/serverConfiguration/update">
              &nbsp;(version {this.props.appStore.serverUpdate} is available)
            </Link>
          </span>
        )}
        {this.props.loginStatus.status === 'loggedIn' && (
          <span className="ml-auto">
            Logged in as {this.props.loginStatus.username}
          </span>
        )}
        &nbsp;- {name || mmsi || uuid}
      </footer>
    )
  }
}

export default connect(
  ({ loginStatus, serverSpecification, appStore, vesselInfo }) => ({
    loginStatus,
    serverSpecification,
    appStore,
    vesselInfo
  })
)(Footer)
