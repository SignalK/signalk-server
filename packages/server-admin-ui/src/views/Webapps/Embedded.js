import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { toLazyDynamicComponent, APP_PANEL } from './dynamicutilities'
import Login from '../../views/security/Login'
import ReconnectingWebSocket from 'reconnecting-websocket'

const wsProto = window.location.protocol == 'https:' ? 'wss' : 'ws'

class Embedded extends Component {
  constructor(props) {
    super(props)
    this.state = {
      component: toLazyDynamicComponent(
        this.props.match.params.moduleId,
        APP_PANEL
      )
    }
    this.websockets = []

    this.adminUI = {
      hideSideBar: () => {
        window.dispatchEvent(new Event('sidebar:hide'))
      },
      getApplicationUserData: (appDataVersion, path = '') =>
        fetch(
          `/signalk/v1/applicationData/user/${this.props.match.params.moduleId}/${appDataVersion}${path}`,
          { credentials: 'include' }
        )
          .then((r) => {
            if (r.status != 200) {
              throw new Error(r)
            }
            return r
          })
          .then((r) => r.json()),
      setApplicationUserData: (appDataVersion, data = {}, path = '') =>
        fetch(
          `/signalk/v1/applicationData/user/${this.props.match.params.moduleId}/${appDataVersion}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include'
          }
        ).then((r) => {
          if (r.status != 200) {
            throw new Error(r)
          }
          return r
        }),
      openWebsocket: (params) => {
        const knownParams = ['subscribe', 'sendCachedValues', 'events']
        const queryParam = knownParams
          .map((p, i) => [i, params[p]])
          .filter((x) => x[1] !== undefined)
          .map(([i, v]) => `${knownParams[i]}=${v}`)
          .join('&')
        const ws = new ReconnectingWebSocket(
          `${wsProto}://${window.location.host}/signalk/v1/stream?${queryParam}`
        )
        this.websockets.push(ws)
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
  }

  componentWillUnmount() {
    this.websockets.forEach((ws) => {
      try {
        ws.close()
      } catch (e) {
        console.error(e)
      }
    })
  }

  render() {
    return (
      <div
        style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)' }}
      >
        <Suspense fallback="Loading...">
          {React.createElement(this.state.component, {
            ...this.props,
            adminUI: this.adminUI
          })}
        </Suspense>
      </div>
    )
  }
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(Embedded)
