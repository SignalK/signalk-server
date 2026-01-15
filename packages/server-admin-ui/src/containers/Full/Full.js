import React, { Component } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Container } from 'reactstrap'
import { connect } from 'react-redux'

import Header from '../../components/Header/Header'
import Sidebar from '../../components/Sidebar/Sidebar'
import Aside from '../../components/Aside/Aside'
import Footer from '../../components/Footer/Footer'

import Dashboard from '../../views/Dashboard/Dashboard'
import Embedded from '../../views/Webapps/Embedded'
import EmbeddedDocs from '../../views/Webapps/EmbeddedDocs'
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

// Wrapper to inject location into Full component
const FullWithLocation = (props) => {
  const location = useLocation()
  return <FullInner {...props} location={location} />
}

class FullInner extends Component {
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
                  element={
                    <ProtectedRouteConnected
                      component={Dashboard}
                      supportsReadOnly
                    />
                  }
                />
                <Route
                  path="/webapps"
                  element={
                    <ProtectedRouteConnected
                      component={Webapps}
                      supportsReadOnly
                    />
                  }
                />
                <Route
                  path="/e/:moduleId"
                  element={
                    <ProtectedRouteConnected
                      component={Embedded}
                      supportsReadOnly
                    />
                  }
                />
                <Route
                  path="/databrowser"
                  element={
                    <ProtectedRouteConnected
                      component={DataBrowser}
                      supportsReadOnly
                    />
                  }
                />
                <Route
                  path="/serverConfiguration/datafiddler"
                  element={
                    <ProtectedRouteConnected
                      component={Playground}
                      supportsReadOnly
                    />
                  }
                />
                <Route
                  path="/appstore/*"
                  element={<ProtectedRouteConnected component={Apps} />}
                />
                <Route
                  path="/serverConfiguration/plugins/:pluginid"
                  element={
                    <ProtectedRouteConnected component={Configuration} />
                  }
                />
                <Route
                  path="/serverConfiguration/settings"
                  element={<ProtectedRouteConnected component={Settings} />}
                />
                <Route
                  path="/serverConfiguration/backuprestore"
                  element={
                    <ProtectedRouteConnected component={BackupRestore} />
                  }
                />
                <Route
                  path="/serverConfiguration/connections/:providerId"
                  element={
                    <ProtectedRouteConnected
                      component={ProvidersConfiguration}
                    />
                  }
                />
                <Route
                  path="/serverConfiguration/log"
                  element={<ProtectedRouteConnected component={ServerLog} />}
                />
                <Route
                  path="/serverConfiguration/update"
                  element={<ProtectedRouteConnected component={ServerUpdate} />}
                />
                <Route
                  path="/security/settings"
                  element={
                    <ProtectedRouteConnected component={SecuritySettings} />
                  }
                />
                <Route
                  path="/security/users"
                  element={<ProtectedRouteConnected component={Users} />}
                />
                <Route
                  path="/security/devices"
                  element={<ProtectedRouteConnected component={Devices} />}
                />
                <Route
                  path="/security/access/requests"
                  element={
                    <ProtectedRouteConnected component={AccessRequests} />
                  }
                />
                <Route path="/documentation" element={<EmbeddedDocs />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
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

const Full = connect()(FullWithLocation)
export default Full

// Error boundary wrapper component
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <span>
          Something went wrong.
          {this.state.error && (
            <pre style={{ fontSize: '0.8rem', color: 'red', marginTop: '1rem' }}>
              {this.state.error.toString()}
            </pre>
          )}
        </span>
      )
    }
    return this.props.children
  }
}

// Protected route component using connect() HOC (react-redux v5 compatible)
const ProtectedRoute = ({
  component: ComponentToRender,
  supportsReadOnly = false,
  loginStatus
}) => {
  if (loginRequired(loginStatus, supportsReadOnly)) {
    return <Login />
  }

  return (
    <ErrorBoundary>
      <ComponentToRender />
    </ErrorBoundary>
  )
}

const ProtectedRouteConnected = connect(({ loginStatus }) => ({ loginStatus }))(
  ProtectedRoute
)

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
