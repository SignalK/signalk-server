import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'

import 'simple-line-icons/css/simple-line-icons.css'
import '../scss/style.scss'
import '../scss/core/_dropdown-menu-right.scss'

import Full from './containers/Full/Full'
import { WebSocketProvider } from './contexts/WebSocketContext'

window.serverRoutesPrefix = '/skServer'

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
