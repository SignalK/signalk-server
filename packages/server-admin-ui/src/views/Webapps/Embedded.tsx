import {
  useState,
  useEffect,
  useRef,
  Suspense,
  createElement,
  ComponentType
} from 'react'
import { useAppSelector } from '../../store'
import { useParams } from 'react-router-dom'
import { toLazyDynamicComponent, APP_PANEL } from './dynamicutilities'
import Login from '../../views/security/Login'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { LoginStatus } from '../../store/types'

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
      <Suspense fallback="Loading...">
        {createElement(component, {
          loginStatus,
          adminUI
        })}
      </Suspense>
    </div>
  )
}
