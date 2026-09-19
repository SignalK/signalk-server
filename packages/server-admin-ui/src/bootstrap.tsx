import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'

import 'simple-line-icons/css/simple-line-icons.css'
import './styles/style.scss'
import './styles/core/_dropdown-menu-right.scss'

import Full from './containers/Full/Full'
import { WebSocketProvider } from './contexts/WebSocketContext'

declare global {
  interface Window {
    __SK_REACT__?: typeof React
    __SK_REACT_DOM__?: typeof ReactDOM
    __SK_REACT_DOM_CLIENT__?: typeof ReactDOMClient
    __SK_REACT_JSX_RUNTIME__?: typeof ReactJSXRuntime
  }
}

window.serverRoutesPrefix = '/skServer'

// Plugin federation: expose this host's React/ReactDOM on window so
// dynamically-imported configuration panels share the same React
// instance. Without this, a plugin bundle that imports its own React
// has its own dispatcher and `useState` reads null when called inside
// the host's render tree (the dispatcher is set on the host's React,
// not the plugin's).
window.__SK_REACT__ = React
window.__SK_REACT_DOM__ = ReactDOM
window.__SK_REACT_DOM_CLIENT__ = ReactDOMClient
window.__SK_REACT_JSX_RUNTIME__ = ReactJSXRuntime

const container = document.getElementById('root')!
const root = createRoot(container)
root.render(
  <WebSocketProvider>
    <HashRouter>
      <Routes>
        <Route path="/*" element={<Full />} />
      </Routes>
    </HashRouter>
  </WebSocketProvider>
)
