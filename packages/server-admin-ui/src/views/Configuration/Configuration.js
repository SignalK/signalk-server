import React, { Component } from 'react'
import { connect } from 'react-redux'

class Dashboard extends Component {
  render () {
    const { deltaRate } = this.props.serverStatistics || { deltaRate: 0 }
    const divStyle = {
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      bottom: '10px',
      top: '110px',
      right: '10px',
      left: '210px'
    }
    const iframeStyle = {
      flexGrow: '1'
    }
    return (
      <div style={divStyle}>
        <iframe style={iframeStyle} src='/plugins/configure/' />
      </div>
    )
  }
}

export default connect(({ serverStatistics }) => ({ serverStatistics }))(
  Dashboard
)
