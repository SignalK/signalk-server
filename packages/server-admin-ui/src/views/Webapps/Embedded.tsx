import {
  useState,
  useEffect,
  useRef,
  Suspense,
  createElement,
  ComponentType,
  Component,
  ReactNode
} from 'react'
import { useAppSelector } from '../../store'
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
  state: WebappErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): WebappErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
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
  const loginStatus = useAppSelector((state) => state.loginStatus)
  const params = useParams<{ moduleId: string }>()
  const [component, setComponent] =
    useState<ComponentType<EmbeddedComponentProps> | null>(null)
  const websocketsRef = useRef<ReconnectingWebSocket[]>([])

  useEffect(() => {
    if (params.moduleId) {
      setComponent(
        toLazyDynamicComponent(
          params.moduleId,
          APP_PANEL
        ) as ComponentType<EmbeddedComponentProps>
      )
    }
  }, [params.moduleId])

  useEffect(() => {
    return () => {
      websocketsRef.current.forEach((ws) => {
        try {
          ws.close()
        } catch (e) {
          console.error(e)
        }
      })
    }
  }, [])

  const adminUI: AdminUI = {
    hideSideBar: () => {
      window.dispatchEvent(new Event('sidebar:hide'))
    },
    getApplicationUserData: (appDataVersion: string, path = '') =>
      fetch(
        `/signalk/v1/applicationData/user/${params.moduleId}/${appDataVersion}${path}`,
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
        `/signalk/v1/applicationData/user/${params.moduleId}/${appDataVersion}${path}`,
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
    openWebsocket: (wsParams: WebSocketParams) => {
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
      websocketsRef.current.push(ws)
      return ws
    },
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
  }

  if (!component) {
    return <div>Loading...</div>
  }

  return (
    <div
      style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)' }}
    >
      <WebappErrorBoundary
        key={params.moduleId}
        webappName={params.moduleId || 'Unknown'}
      >
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
