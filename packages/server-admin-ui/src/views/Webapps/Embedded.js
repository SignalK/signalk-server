import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { toLazyDynamicComponent, APP_PANEL } from './dynamicutilities'
import Login from '../../views/security/Login'
import ReconnectingWebSocket from 'reconnecting-websocket'

const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'

const Embedded = () => {
  const loginStatus = useSelector((state) => state.loginStatus)
  const params = useParams()
  const [component, setComponent] = useState(null)
  const websocketsRef = useRef([])

  useEffect(() => {
    setComponent(toLazyDynamicComponent(params.moduleId, APP_PANEL))
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

  const adminUI = {
    hideSideBar: () => {
      window.dispatchEvent(new Event('sidebar:hide'))
    },
    getApplicationUserData: (appDataVersion, path = '') =>
      fetch(
        `/signalk/v1/applicationData/user/${params.moduleId}/${appDataVersion}${path}`,
        { credentials: 'include' }
      )
        .then((r) => {
          if (r.status !== 200) {
            throw new Error(r)
          }
          return r
        })
        .then((r) => r.json()),
    setApplicationUserData: (appDataVersion, data = {}, path = '') =>
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
          throw new Error(r)
        }
        return r
      }),
    openWebsocket: (wsParams) => {
      const knownParams = ['subscribe', 'sendCachedValues', 'events']
      const queryParam = knownParams
        .map((p, i) => [i, wsParams[p]])
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
        {React.createElement(component, {
          loginStatus,
          adminUI
        })}
      </Suspense>
    </div>
  )
}

export default Embedded
