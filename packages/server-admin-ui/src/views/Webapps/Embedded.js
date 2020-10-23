import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { toLazyDynamicComponent } from './dynamicutilities'
import Login from '../../views/security/Login'

class Embedded extends Component {
  constructor(props) {
    super(props)
    this.state = {
      component: toLazyDynamicComponent(this.props.match.params.moduleId, './AppPanel')
    }
    this.adminUI = {
      hideSideBar: () => {
        window.dispatchEvent(new Event('sidebar:hide'))
      },
      Login
    }
  }

  render() {
    return (
      <div style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)'}}>
        <Suspense fallback='Loading...'>
          {React.createElement(this.state.component, { ...this.props, adminUI: this.adminUI })}
        </Suspense>
      </div>

    )
  }
}

const mapStateToProps = ({ webapps, loginStatus }) => ({ webapps, loginStatus })

export default connect(mapStateToProps)(Embedded)

