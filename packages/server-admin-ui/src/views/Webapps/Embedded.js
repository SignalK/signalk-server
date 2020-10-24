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
      getApplicationUserData:
        (appDataVersion, path = '') =>
          fetch(`/signalk/v1/applicationData/user/${this.props.match.params.moduleId}/${appDataVersion}${path}`,
            { credentials: 'include' }).then(r => {
              if (r.status != 200) {
                throw new Error(r)
              }
              return r
            }).then(r => r.json()),
      setApplicationUserData:
        (appDataVersion, data = {}, path = '') =>
          fetch(`/signalk/v1/applicationData/user/${this.props.match.params.moduleId}/${appDataVersion}${path}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data),
              credentials: 'include'
            }).then(r => {
              if (r.status != 200) {
                throw new Error(r)
              }
              return r
            }),
      Login
    }
  }

  render() {
    return (
      <div style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)' }}>
        <Suspense fallback='Loading...'>
          {React.createElement(this.state.component, { ...this.props, adminUI: this.adminUI })}
        </Suspense>
      </div>

    )
  }
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(Embedded)

