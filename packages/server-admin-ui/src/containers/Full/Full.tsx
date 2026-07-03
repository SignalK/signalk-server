import React, {
  Suspense,
  useEffect,
  Component,
  ReactNode,
  ComponentType
} from 'react'
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams
} from 'react-router-dom'
import Container from 'react-bootstrap/Container'
import { useLoginStatus, type LoginStatus } from '../../store'

import Header from '../../components/Header/Header'
import Sidebar from '../../components/Sidebar/Sidebar'
import Aside from '../../components/Aside/Aside'
import Footer from '../../components/Footer/Footer'

import Dashboard from '../../views/Dashboard/Dashboard'
import Embedded from '../../views/Webapps/Embedded'
import EmbeddedDocs from '../../views/Webapps/EmbeddedDocs'
import EmbeddedAsyncApi from '../../views/Webapps/EmbeddedAsyncApi'
import Webapps from '../../views/Webapps/Webapps'
import Login from '../../views/security/Login'
import Register from '../../views/security/Register'

const CHUNK_RELOAD_FLAG = 'signalk:chunkReloaded'

// One retry covers transient network blips; persistent failures (e.g. stale
// chunk hashes after a redeploy) fall through to the ErrorBoundary, which
// triggers a one-shot reload.
function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>
) {
  return React.lazy(() =>
    importer()
      .catch(() => importer())
      .then((module) => {
        // A successful chunk load proves the served bundle is consistent, so
        // re-arm the one-shot reload for the next redeploy. Re-arming on
        // mount instead would reload in a loop while chunks keep failing.
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
        } catch {
          // Storage blocked — the chunk still loaded, so carry on.
        }
        return module
      })
  )
}

const DataBrowser = lazyWithRetry(
  () => import('../../views/DataBrowser/DataBrowser')
)
const MetaDataPage = lazyWithRetry(
  () => import('../../views/DataBrowser/MetaDataPage')
)
const SourceDiscovery = lazyWithRetry(
  () => import('../../views/DataBrowser/SourceDiscovery')
)
const SourcePriorityPage = lazyWithRetry(
  () => import('../../views/DataBrowser/SourcePriorityPage')
)
const Playground = lazyWithRetry(() => import('../../views/Playground'))
const Apps = lazyWithRetry(() => import('../../views/appstore/Apps/Apps'))
const DetailView = lazyWithRetry(
  () => import('../../views/appstore/Detail/DetailView')
)
const Configuration = lazyWithRetry(
  () => import('../../views/Configuration/Configuration')
)
const Settings = lazyWithRetry(
  () => import('../../views/ServerConfig/Settings')
)
const UnitPreferencesSettings = lazyWithRetry(
  () => import('../../views/ServerConfig/UnitPreferencesSettings')
)
const BackupRestore = lazyWithRetry(
  () => import('../../views/ServerConfig/BackupRestore')
)
const ProvidersConfiguration = lazyWithRetry(
  () => import('../../views/ServerConfig/ProvidersConfiguration')
)
const ServerLog = lazyWithRetry(
  () => import('../../views/ServerConfig/ServerLog')
)
const ServerUpdate = lazyWithRetry(
  () => import('../../views/ServerConfig/ServerUpdate')
)
const SecuritySettings = lazyWithRetry(
  () => import('../../views/security/Settings')
)
const Users = lazyWithRetry(() => import('../../views/security/Users'))
const Devices = lazyWithRetry(() => import('../../views/security/Devices'))
const AccessRequests = lazyWithRetry(
  () => import('../../views/security/AccessRequests')
)
const PathReference = lazyWithRetry(
  () => import('../../views/PathReference/PathReference')
)

import { fetchAllData } from '../../actions'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message
    )
  )
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
    // Hashed chunk filenames change on redeploy; an open tab will fail to
    // fetch its old chunks. Reload once to pick up the new index, but guard
    // against loops if the failure is caused by something else.
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
          sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
          window.location.reload()
          return
        }
      } catch {
        // Storage blocked — without the one-shot flag a reload could loop,
        // so fall through to the error panel instead.
      }
    }
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

function LegacyAppstorePluginRedirect() {
  const { name } = useParams<{ name: string }>()
  const location = useLocation()
  return (
    <Navigate
      to={`/apps/store/plugin/${encodeURIComponent(name || '')}${location.search}${location.hash}`}
      replace
    />
  )
}

function LegacyAppstoreRedirect() {
  // Preserve the splat after /appstore/ so deep-links like
  // /appstore/updates redirect to /apps/store/updates rather than
  // dropping back to the root list.
  const params = useParams<{ '*': string }>()
  const location = useLocation()
  const rest = params['*']
  const suffix = rest ? `/${rest}` : ''
  return (
    <Navigate
      to={`/apps/store${suffix}${location.search}${location.hash}`}
      replace
    />
  )
}

function LegacyPluginConfigRedirect() {
  const { pluginid } = useParams<{ pluginid: string }>()
  const location = useLocation()
  // No id in the legacy URL → fall back to the store rather than
  // /apps/configuration/- which would 404 the configuration view.
  if (!pluginid) {
    return <Navigate to="/apps/store" replace />
  }
  return (
    <Navigate
      to={`/apps/configuration/${encodeURIComponent(pluginid)}${location.search}${location.hash}`}
      replace
    />
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
                {/* Data menu routes */}
                <Route
                  path="/data/browser"
                  element={
                    <ProtectedRoute component={DataBrowser} supportsReadOnly />
                  }
                />
                <Route
                  path="/data/meta"
                  element={
                    <ProtectedRoute component={MetaDataPage} supportsReadOnly />
                  }
                />
                <Route
                  path="/data/sources"
                  element={<ProtectedRoute component={SourceDiscovery} />}
                />
                <Route
                  path="/data/priorities"
                  element={<ProtectedRoute component={SourcePriorityPage} />}
                />
                <Route
                  path="/data/units"
                  element={
                    <ProtectedRoute component={UnitPreferencesSettings} />
                  }
                />
                <Route
                  path="/data/fiddler"
                  element={
                    <ProtectedRoute component={Playground} supportsReadOnly />
                  }
                />
                <Route
                  path="/data/connections/:providerId"
                  element={
                    <ProtectedRoute component={ProvidersConfiguration} />
                  }
                />
                {/* Backward-compatible redirects */}
                <Route
                  path="/databrowser"
                  element={<Navigate to="/data/browser" replace />}
                />
                <Route
                  path="/serverConfiguration/datafiddler"
                  element={<Navigate to="/data/fiddler" replace />}
                />
                <Route
                  path="/apps/store/plugin/:name"
                  element={<ProtectedRoute component={DetailView} />}
                />
                <Route
                  path="/apps/store/*"
                  element={<ProtectedRoute component={Apps} />}
                />
                <Route
                  path="/apps/configuration/:pluginid"
                  element={<ProtectedRoute component={Configuration} />}
                />
                <Route path="/appstore" element={<LegacyAppstoreRedirect />} />
                <Route
                  path="/appstore/plugin/:name"
                  element={<LegacyAppstorePluginRedirect />}
                />
                <Route
                  path="/appstore/*"
                  element={<LegacyAppstoreRedirect />}
                />
                <Route
                  path="/serverConfiguration/plugins/:pluginid"
                  element={<LegacyPluginConfigRedirect />}
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
                <Route path="/asyncapi" element={<EmbeddedAsyncApi />} />
                <Route
                  path="/documentation/paths"
                  element={
                    <ProtectedRoute
                      component={PathReference}
                      supportsReadOnly
                    />
                  }
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
