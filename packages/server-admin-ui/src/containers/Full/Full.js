import React, { Component } from 'react'
import { Switch, Route, Redirect, withRouter } from 'react-router-dom'
import { Container } from 'reactstrap'
import { connect } from 'react-redux'

import Header from '../../components/Header/Header.js'
import Sidebar from '../../components/Sidebar/Sidebar.js'
import Aside from '../../components/Aside/Aside.js'
import Footer from '../../components/Footer/Footer.js'

import Dashboard from '../../views/Dashboard/Dashboard.js'
import Embedded from '../../views/Webapps/Embedded.js'
import Webapps from '../../views/Webapps/Webapps.js'
import DataBrowser from '../../views/DataBrowser/DataBrowser.js'
import Playground from '../../views/Playground.js'
import Apps from '../../views/appstore/Apps/Apps.js'
import Configuration from '../../views/Configuration/Configuration.js'
import Login from '../../views/security/Login.js'
import SecuritySettings from '../../views/security/Settings.js'
import Users from '../../views/security/Users.js'
import Devices from '../../views/security/Devices.js'
import Register from '../../views/security/Register.js'
import AccessRequests from '../../views/security/AccessRequests.js'
import ProvidersConfiguration from '../../views/ServerConfig/ProvidersConfiguration.js'
import Settings from '../../views/ServerConfig/Settings.js'
import BackupRestore from '../../views/ServerConfig/BackupRestore.js'
import ServerLog from '../../views/ServerConfig/ServerLog.js'
import ServerUpdate from '../../views/ServerConfig/ServerUpdate.js'

import { fetchAllData, openServerEventsConnection } from '../../actions.js'

class Full extends Component {
  componentDidMount() {
    const { dispatch } = this.props
    fetchAllData(dispatch)
    openServerEventsConnection(dispatch)
  }

  render() {
    const suppressPadding =
      this.props.location.pathname.indexOf('/e/') === 0
        ? { padding: '0px' }
        : {}
    return (
      <div className="app">
        <Header />
        <div className="app-body">
          <Sidebar {...this.props} />
          <main className="main">
            <Container fluid style={suppressPadding}>
              <Switch>
                <Route
                  path="/dashboard"
                  name="Dashboard"
                  component={loginOrOriginal(Dashboard, true)}
                />
                <Route
                  path="/webapps"
                  name="Webapps"
                  component={loginOrOriginal(Webapps, true)}
                />
                <Route
                  path="/e/:moduleId"
                  name="Embedded Webapps"
                  component={loginOrOriginal(Embedded, true)}
                />
                <Route
                  path="/databrowser"
                  name="DataBrowser"
                  component={loginOrOriginal(DataBrowser, true)}
                />
                <Route
                  path="/serverConfiguration/datafiddler"
                  name="DataFiddler"
                  component={loginOrOriginal(Playground, true)}
                />
                <Route
                  path="/appstore"
                  name="Appstore"
                  component={loginOrOriginal(Apps)}
                />
                <Route
                  path="/serverConfiguration/plugins/:pluginid"
                  component={loginOrOriginal(Configuration)}
                />
                <Route
                  path="/serverConfiguration/settings"
                  component={loginOrOriginal(Settings)}
                />
                <Route
                  path="/serverConfiguration/backuprestore"
                  component={loginOrOriginal(BackupRestore)}
                />
                <Route
                  path="/serverConfiguration/connections/:providerId"
                  component={loginOrOriginal(ProvidersConfiguration)}
                />
                <Route
                  path="/serverConfiguration/log"
                  component={loginOrOriginal(ServerLog)}
                />
                <Route
                  path="/serverConfiguration/update"
                  component={loginOrOriginal(ServerUpdate)}
                />
                <Route
                  path="/security/settings"
                  component={loginOrOriginal(SecuritySettings)}
                />
                <Route
                  path="/security/users"
                  component={loginOrOriginal(Users)}
                />
                <Route
                  path="/security/devices"
                  component={loginOrOriginal(Devices)}
                />
                <Route
                  path="/security/access/requests"
                  component={loginOrOriginal(AccessRequests)}
                />
                <Route path="/login" component={Login} />
                <Route path="/register" component={Register} />
                <Redirect from="/" to="/dashboard" />
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
    constructor(props) {
      super(props)
      this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    render() {
      if (loginRequired(this.props.loginStatus, componentSupportsReadOnly)) {
        return <Login />
      } else if (this.state.hasError) {
        return <span>Something went wrong.</span>
      } else {
        return <BaseComponent {...this.props} />
      }
    }
  }
  return connect(({ loginStatus }) => ({ loginStatus }))(withRouter(Restricted))
}

function loginRequired(loginStatus, componentSupportsReadOnly) {
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
