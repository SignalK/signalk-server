import {
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  createElement,
  ComponentType,
  Component,
  ReactNode
} from 'react'
import { useZustandLoginStatus } from '../../store'
import { useParams } from 'react-router-dom'
import { toLazyDynamicComponent, APP_PANEL } from './dynamicutilities'
import Login from '../../views/security/Login'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { LoginStatus } from '../../store/types'

// Error boundary for catching fatal React errors from webapps (e.g., React 19 incompatibility)
// This boundary only catches errors during React's render phase, not errors in event handlers
interface WebappErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface WebappErrorBoundaryProps {
  children: ReactNode
  webappName: string
}

class WebappErrorBoundary extends Component<
  WebappErrorBoundaryProps,
  WebappErrorBoundaryState
> {
  override state: WebappErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): WebappErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || ''
      // Check if this looks like a React version incompatibility error
      const isReactIncompatibility =
        errorMessage.includes('Minified React error') ||
        errorMessage.includes('Element type is invalid') ||
        errorMessage.includes('Cannot read properties of undefined') ||
        errorMessage.includes('Cannot access') ||
        errorMessage.includes('#306') ||
        errorMessage.includes('#130') ||
        errorMessage.includes('#152')

      return (
        <div className="container mt-4">
          <div className="alert alert-warning">
            <h5>Webapp Error</h5>
            <p>
              The webapp <strong>{this.props.webappName}</strong> encountered an
              error.
              {isReactIncompatibility && (
                <>
                  {' '}
                  This webapp may need to be updated for React 19 compatibility.
                </>
              )}
            </p>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm me-2"
              onClick={this.handleRetry}
            >
              Try again
            </button>
            <details className="mt-2">
              <summary>Technical details</summary>
              <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                {this.state.error?.message}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'

// Module-level websocket tracking to avoid ref access during render
// Each Embedded component instance gets its own array keyed by moduleId
const moduleWebsockets = new Map<string, ReconnectingWebSocket[]>()

interface WebSocketParams {
  subscribe?: string
  sendCachedValues?: boolean
  events?: string
}

interface AdminUI {
  hideSideBar: () => void
  getApplicationUserData: (
    appDataVersion: string,
    path?: string
  ) => Promise<unknown>
  setApplicationUserData: (
    appDataVersion: string,
    data?: object,
    path?: string
  ) => Promise<Response>
  openWebsocket: (wsParams: WebSocketParams) => ReconnectingWebSocket
  get: (params: { context: string; path: string }) => Promise<Response>
  Login: typeof Login
}

interface EmbeddedComponentProps {
  loginStatus: LoginStatus
  adminUI: AdminUI
}

export default function Embedded() {
  const loginStatus = useZustandLoginStatus()
  const params = useParams<{ moduleId: string }>()
  const moduleId = params.moduleId ?? ''

  // Create lazy component when moduleId changes - useMemo ensures stable reference
  const component = useMemo(
    () =>
      moduleId
        ? (toLazyDynamicComponent(
            moduleId,
            APP_PANEL
          ) as ComponentType<EmbeddedComponentProps>)
        : null,
    [moduleId]
  )

  useEffect(() => {
    // Initialize websockets array for this module
    if (!moduleWebsockets.has(moduleId)) {
      moduleWebsockets.set(moduleId, [])
    }
    // Capture the module ID for cleanup
    const cleanupModuleId = moduleId
    return () => {
      const websockets = moduleWebsockets.get(cleanupModuleId)
      if (websockets) {
        websockets.forEach((ws) => {
          try {
            ws.close()
          } catch (e) {
            console.error(e)
          }
        })
        moduleWebsockets.delete(cleanupModuleId)
      }
    }
  }, [moduleId])

  // Callback for opening websockets - uses module-level map instead of ref
  const openWebsocket = useCallback(
    (wsParams: WebSocketParams) => {
      const knownParams: (keyof WebSocketParams)[] = [
        'subscribe',
        'sendCachedValues',
        'events'
      ]
      const queryParam = knownParams
        .map((p, i) => [i, wsParams[p]] as [number, unknown])
        .filter((x) => x[1] !== undefined)
        .map(([i, v]) => `${knownParams[i]}=${v}`)
        .join('&')
      const ws = new ReconnectingWebSocket(
        `${wsProto}://${window.location.host}/signalk/v1/stream?${queryParam}`
      )
      const websockets = moduleWebsockets.get(moduleId)
      if (websockets) {
        websockets.push(ws)
      }
      return ws
    },
    [moduleId]
  )

  // Memoize adminUI API to ensure stable reference across renders.
  const adminUI: AdminUI = useMemo(
    () => ({
      hideSideBar: () => {
        window.dispatchEvent(new Event('sidebar:hide'))
      },
      getApplicationUserData: (appDataVersion: string, path = '') =>
        fetch(
          `/signalk/v1/applicationData/user/${moduleId}/${appDataVersion}${path}`,
          { credentials: 'include' }
        )
          .then((r) => {
            if (r.status !== 200) {
              throw new Error(String(r.status))
            }
            return r
          })
          .then((r) => r.json()),
      setApplicationUserData: (appDataVersion: string, data = {}, path = '') =>
        fetch(
          `/signalk/v1/applicationData/user/${moduleId}/${appDataVersion}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include'
          }
        ).then((r) => {
          if (r.status !== 200) {
            throw new Error(String(r.status))
          }
          return r
        }),
      openWebsocket,
      get: ({ context, path }) => {
        const cParts = context.split('.')
        return fetch(
          `/signalk/v1/api/${cParts[0]}/${cParts.slice(1).join('.')}/${path}`,
          {
            credentials: 'include'
          }
        )
      },
      Login
    }),
    [moduleId, openWebsocket]
  )

  if (!component) {
    return <div>Loading...</div>
  }

  return (
    <div
      style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)' }}
    >
      <WebappErrorBoundary key={moduleId} webappName={moduleId || 'Unknown'}>
        <Suspense fallback="Loading...">
          {createElement(component, {
            loginStatus,
            adminUI
          })}
        </Suspense>
      </WebappErrorBoundary>
    </div>
  )
}
