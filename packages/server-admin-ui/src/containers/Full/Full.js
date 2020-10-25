import React, { Component } from 'react'
import { Switch, Route, Redirect, withRouter, History } from 'react-router-dom'
import { Container } from 'reactstrap'
import { connect } from 'react-redux'

import Header from '../../components/Header/Header'
import Sidebar from '../../components/Sidebar/Sidebar'
import Aside from '../../components/Aside/Aside'
import Footer from '../../components/Footer/Footer'

import Dashboard from '../../views/Dashboard/Dashboard'
import Webapps from '../../views/Webapps/Webapps'
import DataBrowser from '../../views/DataBrowser'
import Playground from '../../views/Playground'
import Apps from '../../views/appstore/Apps/Apps'
import Configuration from '../../views/Configuration/Configuration'
import Login from '../../views/security/Login'
import SecuritySettings from '../../views/security/Settings'
import Users from '../../views/security/Users'
import Devices from '../../views/security/Devices'
import Register from '../../views/security/Register'
import AccessRequests from '../../views/security/AccessRequests'
import VesselConfiguration from '../../views/ServerConfig/VesselConfiguration'
import ProvidersConfiguration from '../../views/ServerConfig/ProvidersConfiguration'
import Settings from '../../views/ServerConfig/Settings'
import BackupRestore from '../../views/ServerConfig/BackupRestore'
import Logging from '../../views/ServerConfig/Logging'
import ServerLog from '../../views/ServerConfig/ServerLog'
import ServerUpdate from '../../views/ServerConfig/ServerUpdate'

import {
  fetchLoginStatus,
  fetchAllData,
  openServerEventsConnection
} from '../../actions'

class Full extends Component {
  componentDidMount () {
    const { dispatch } = this.props
    fetchAllData(dispatch)
    openServerEventsConnection(dispatch)
  }

  render () {
    return (
      <div className='app'>
        <Header />
        <div className='app-body'>
          <Sidebar {...this.props} />
          <main className='main'>
            <Container fluid>
              <Switch>
                <Route
                  path='/dashboard'
                  name='Dashboard'
                  component={loginOrOriginal(Dashboard, true)}
                />
                <Route
                  path='/webapps'
                  name='Webapps'
                  component={loginOrOriginal(Webapps, true)}
                />
                <Route
                  path='/databrowser'
                  name='DataBrowser'
                  component={loginOrOriginal(DataBrowser, true)}
                 />
                <Route
                  path='/serverConfiguration/datafiddler'
                  name='DataFiddler'
                  component={loginOrOriginal(Playground, true)}
                />
                <Route
                  path='/appstore/:view'
                  component={loginOrOriginal(Apps)}
                />
                <Route
                  path='/serverConfiguration/plugins/:pluginid'
                  component={loginOrOriginal(Configuration)}
                />
                <Route
                  path='/serverConfiguration/settings'
                  component={loginOrOriginal(Settings)}
                />
                <Route
                  path='/serverConfiguration/backuprestore'
                  component={loginOrOriginal(BackupRestore)}
                />
                <Route
                  path='/serverConfiguration/connections/:providerId'
                  component={loginOrOriginal(ProvidersConfiguration)}
                />
                <Route
                  path='/serverConfiguration/log'
                  component={loginOrOriginal(ServerLog)}
                />
                <Route
                  path='/serverConfiguration/update'
                  component={loginOrOriginal(ServerUpdate)}
                />
                <Route path='/security/settings' component={loginOrOriginal(SecuritySettings)} />
                <Route path='/security/users' component={loginOrOriginal(Users)} />
                <Route path='/security/devices' component={loginOrOriginal(Devices)} />
                <Route path='/security/access/requests' component={loginOrOriginal(AccessRequests)} />
                <Route path='/login' component={Login} />
                <Route path='/register' component={Register} />
                <Redirect from='/' to='/dashboard' />
              </Switch>
            </Container>
          </main>
          <Aside />
        </div>
        <Footer />
      </div>
    )
  }
}

export default connect()(Full)

const loginOrOriginal = (BaseComponent, componentSupportsReadOnly) => {
  class Restricted extends Component {
    render () {
      if (loginRequired(this.props.loginStatus, componentSupportsReadOnly)) {
        return <Login />
      } else {
        return <BaseComponent {...this.props} />
      }
    }
  }
  return connect(({ loginStatus }) => ({ loginStatus }))(withRouter(Restricted))
}

function loginRequired (loginStatus, componentSupportsReadOnly) {
  // component works with read only access and
  // server loginStatus allows read only access
  if (componentSupportsReadOnly && loginStatus.readOnlyAccess) {
    return false
  }

  // require login when server requires authentication AND
  // user is not logged
  return (
    loginStatus.authenticationRequired && loginStatus.status === 'notLoggedIn'
  )
}
