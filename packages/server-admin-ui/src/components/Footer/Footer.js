import React, { Component } from 'react'
import { connect } from 'react-redux'


class Footer extends Component {
  constructor(props) {
    super(props)
    this.state = {
    }
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
        {this.props.loginStatus.status === 'loggedIn' && (
          <span className='ml-auto'>
            Logged in as {this.props.loginStatus.username}
          </span>
        )}
      </footer>
    )
  }
}

export default connect(({ loginStatus, serverSpecification }) => ({ loginStatus, serverSpecification }))(Footer)
