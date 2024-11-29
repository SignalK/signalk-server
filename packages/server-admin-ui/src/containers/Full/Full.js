
import React, { Component } from 'react'
import {  Route, Navigate, Routes } from 'react-router-dom'
import { Container } from 'reactstrap'
import { connect } from 'react-redux'

import Header from '../../components/Header/Header'
import Sidebar from '../../components/Sidebar/Sidebar'
import Aside from '../../components/Aside/Aside'
import Footer from '../../components/Footer/Footer'

import Dashboard from '../../views/Dashboard/Dashboard'
import Embedded from '../../views/Webapps/Embedded'
import Webapps from '../../views/Webapps/Webapps'
import DataBrowser from '../../views/DataBrowser/DataBrowser'
import Playground from '../../views/Playground'
import Apps from '../../views/appstore/Apps/Apps'
import Configuration from '../../views/Configuration/Configuration'
import Login from '../../views/security/Login'
import SecuritySettings from '../../views/security/Settings'
import Users from '../../views/security/Users'
import Devices from '../../views/security/Devices'
import Register from '../../views/security/Register'
import AccessRequests from '../../views/security/AccessRequests'
import ProvidersConfiguration from '../../views/ServerConfig/ProvidersConfiguration'
import Settings from '../../views/ServerConfig/Settings'
import BackupRestore from '../../views/ServerConfig/BackupRestore'
import ServerLog from '../../views/ServerConfig/ServerLog'
import ServerUpdate from '../../views/ServerConfig/ServerUpdate'

import { fetchAllData, openServerEventsConnection } from '../../actions'
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export function withRouter(FunctionComponent) {
    function ComponentWithRouterProp(props ) {
        const location = useLocation();
        const navigate = useNavigate();
        const params = useParams();

        return <Component {...props} router={{ location, navigate, params }} />;
    }

    return ComponentWithRouterProp;
}

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
              <Routes>
                <Route
                  path="/dashboard"
                  name="Dashboard"
                  element={loginOrOriginal(Dashboard, true)}
                />
                <Route
                  path="/webapps"
                  name="Webapps"
                  element={loginOrOriginal(Webapps, true)}
                />
                <Route
                  path="/e/:moduleId"
                  name="Embedded Webapps"
                  element={loginOrOriginal(Embedded, true)}
                />
                <Route
                  path="/databrowser"
                  name="DataBrowser"
                  element={loginOrOriginal(DataBrowser, true)}
                />
                <Route
                  path="/serverConfiguration/datafiddler"
                  name="DataFiddler"
                  element={loginOrOriginal(Playground, true)}
                />
                <Route
                  path="/appstore"
                  name="Appstore"
                  element={loginOrOriginal(Apps)}
                />
                <Route
                  path="/serverConfiguration/plugins/:pluginid"
                  element={loginOrOriginal(Configuration)}
                />
                <Route
                  path="/serverConfiguration/settings"
                  element={loginOrOriginal(Settings)}
                />
                <Route
                  path="/serverConfiguration/backuprestore"
                  element={loginOrOriginal(BackupRestore)}
                />
                <Route
                  path="/serverConfiguration/connections/:providerId"
                  element={loginOrOriginal(ProvidersConfiguration)}
                />
                <Route
                  path="/serverConfiguration/log"
                  element={loginOrOriginal(ServerLog)}
                />
                <Route
                  path="/serverConfiguration/update"
                  element={loginOrOriginal(ServerUpdate)}
                />
                <Route
                  path="/security/settings"
                  element={loginOrOriginal(SecuritySettings)}
                />
                <Route
                  path="/security/users"
                  element={loginOrOriginal(Users)}
                />
                <Route
                  path="/security/devices"
                  element={loginOrOriginal(Devices)}
                />
                <Route
                  path="/security/access/requests"
                  element={loginOrOriginal(AccessRequests)}
                />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register/>} />
                 <Route
                    path="/"
                    element={<Navigate to="/dashboard" replace />}
                  />              
              </Routes>
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
