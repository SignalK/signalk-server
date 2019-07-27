import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router-dom'

function fetchVessel() {
  fetch(`/vessel`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState({ ...data })
    })
}
class Footer extends Component {

  constructor(props) {

    super(props)
    this.state = {
    }
    this.fetchVessel = fetchVessel.bind(this)
  }

  componentDidMount() {
    this.fetchVessel()
  }

  render() {
    return (
      <footer className='app-footer'>
        <span>
          <a href='https://github.com/SignalK/signalk-server-node/'>
            Signal K Server
          </a>
        </span>
        {typeof this.props.serverSpecification.server !== 'undefined' && (
          <span>
            &nbsp; version {this.props.serverSpecification.server.version}
          </span>
        )}
        {typeof this.props.appStore.serverUpdate !== 'undefined' && (
          <span>
            <Link to='/serverConfiguration/update'>
              &nbsp;(version {this.props.appStore.serverUpdate} is available)
          </Link>
          </span>
        )}
        {this.props.loginStatus.status === 'loggedIn' && (
          <span className='ml-auto'>
            Logged in as {this.props.loginStatus.username}
          </span>
        )}

        &nbsp;- {this.state.name || this.state.mmsi || this.state.uuid}
      </footer>
    )
  }
}

export default connect(({ loginStatus, serverSpecification, appStore }) => ({ loginStatus, serverSpecification, appStore }))(Footer)
