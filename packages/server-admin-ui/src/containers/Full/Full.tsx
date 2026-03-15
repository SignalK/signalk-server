import React, {
  Suspense,
  useEffect,
  Component,
  ReactNode,
  ComponentType
} from 'react'
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
import Login from '../../views/security/Login'
import Register from '../../views/security/Register'

const DataBrowser = React.lazy(
  () => import('../../views/DataBrowser/DataBrowser')
)
const Playground = React.lazy(() => import('../../views/Playground'))
const Apps = React.lazy(() => import('../../views/appstore/Apps/Apps'))
const Configuration = React.lazy(
  () => import('../../views/Configuration/Configuration')
)
const Settings = React.lazy(() => import('../../views/ServerConfig/Settings'))
const BackupRestore = React.lazy(
  () => import('../../views/ServerConfig/BackupRestore')
)
const ProvidersConfiguration = React.lazy(
  () => import('../../views/ServerConfig/ProvidersConfiguration')
)
const ServerLog = React.lazy(() => import('../../views/ServerConfig/ServerLog'))
const ServerUpdate = React.lazy(
  () => import('../../views/ServerConfig/ServerUpdate')
)
const SecuritySettings = React.lazy(
  () => import('../../views/security/Settings')
)
const Users = React.lazy(() => import('../../views/security/Users'))
const Devices = React.lazy(() => import('../../views/security/Devices'))
const AccessRequests = React.lazy(
  () => import('../../views/security/AccessRequests')
)

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

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
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
    location.pathname.indexOf('/documentation') === 0
      ? { padding: '0px' }
      : {}

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar location={location} />
        <main className="main">
          <Container fluid style={suppressPadding}>
            <Suspense fallback={<LoadingSpinner />}>
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
                  element={
                    <ProtectedRoute component={ProvidersConfiguration} />
                  }
                />
                <Route
                  path="/serverConfiguration/log"
                  element={
                    <ProtectedRoute component={ServerLog} supportsReadOnly />
                  }
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
                <Route path="/documentation/*" element={<EmbeddedDocs />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
              </Routes>
            </Suspense>
          </Container>
        </main>
        <Aside />
      </div>
      <Footer />
    </div>
  )
}
