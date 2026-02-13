import React, { useEffect, Component, ReactNode, ComponentType } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Container from 'react-bootstrap/Container'
import { useLoginStatus, type LoginStatus } from '../../store'

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
import PathReference from '../../views/PathReference/PathReference'

import { fetchAllData } from '../../actions'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// Must be a class component — React error boundaries don't support hooks
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <span>
          Something went wrong.
          {this.state.error && (
            <pre
              style={{ fontSize: '0.8rem', color: 'red', marginTop: '1rem' }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </span>
      )
    }
    return this.props.children
  }
}

interface ProtectedRouteProps {
  component: ComponentType
  supportsReadOnly?: boolean
}

function loginRequired(
  loginStatus: LoginStatus,
  componentSupportsReadOnly: boolean
): boolean {
  if (componentSupportsReadOnly && loginStatus.readOnlyAccess) {
    return false
  }

  return (
    loginStatus.authenticationRequired === true &&
    loginStatus.status === 'notLoggedIn'
  )
}

function ProtectedRoute({
  component: ComponentToRender,
  supportsReadOnly = false
}: ProtectedRouteProps) {
  const loginStatus = useLoginStatus()

  if (loginRequired(loginStatus, supportsReadOnly)) {
    return <Login />
  }

  return (
    <ErrorBoundary>
      <ComponentToRender />
    </ErrorBoundary>
  )
}

export default function Full() {
  const location = useLocation()

  useEffect(() => {
    fetchAllData()
  }, [])

  const suppressPadding =
    location.pathname.indexOf('/e/') === 0 ||
    (location.pathname.indexOf('/documentation') === 0 &&
      location.pathname !== '/documentation/paths')
      ? { padding: '0px' }
      : {}

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar location={location} />
        <main className="main">
          <Container fluid style={suppressPadding}>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute component={Dashboard} supportsReadOnly />
                }
              />
              <Route
                path="/webapps"
                element={
                  <ProtectedRoute component={Webapps} supportsReadOnly />
                }
              />
              <Route
                path="/e/:moduleId"
                element={
                  <ProtectedRoute component={Embedded} supportsReadOnly />
                }
              />
              <Route
                path="/databrowser"
                element={
                  <ProtectedRoute component={DataBrowser} supportsReadOnly />
                }
              />
              <Route
                path="/serverConfiguration/datafiddler"
                element={
                  <ProtectedRoute component={Playground} supportsReadOnly />
                }
              />
              <Route
                path="/appstore/*"
                element={<ProtectedRoute component={Apps} />}
              />
              <Route
                path="/serverConfiguration/plugins/:pluginid"
                element={<ProtectedRoute component={Configuration} />}
              />
              <Route
                path="/serverConfiguration/settings"
                element={<ProtectedRoute component={Settings} />}
              />
              <Route
                path="/serverConfiguration/backuprestore"
                element={<ProtectedRoute component={BackupRestore} />}
              />
              <Route
                path="/serverConfiguration/connections/:providerId"
                element={<ProtectedRoute component={ProvidersConfiguration} />}
              />
              <Route
                path="/serverConfiguration/log"
                element={<ProtectedRoute component={ServerLog} />}
              />
              <Route
                path="/serverConfiguration/update"
                element={<ProtectedRoute component={ServerUpdate} />}
              />
              <Route
                path="/security/settings"
                element={<ProtectedRoute component={SecuritySettings} />}
              />
              <Route
                path="/security/users"
                element={<ProtectedRoute component={Users} />}
              />
              <Route
                path="/security/devices"
                element={<ProtectedRoute component={Devices} />}
              />
              <Route
                path="/security/access/requests"
                element={<ProtectedRoute component={AccessRequests} />}
              />
              <Route
                path="/documentation/paths"
                element={
                  <ProtectedRoute component={PathReference} supportsReadOnly />
                }
              />
              <Route path="/documentation/*" element={<EmbeddedDocs />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Container>
        </main>
        <Aside />
      </div>
      <Footer />
    </div>
  )
}
