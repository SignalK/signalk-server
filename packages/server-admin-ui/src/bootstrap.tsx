import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'

// Styles
// Import Font Awesome Icons Set
import 'font-awesome/css/font-awesome.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
// Import Simple Line Icons Set
import 'simple-line-icons/css/simple-line-icons.css'
// Import Main styles for this application
import '../scss/style.scss'
// Temp fix for reactstrap
import '../scss/core/_dropdown-menu-right.scss'

// Containers
import Full from './containers/Full/Full'

// Redux store (Redux Toolkit)
import { store } from './store'

window.serverRoutesPrefix = '/skServer'

const container = document.getElementById('root')
const root = createRoot(container)
root.render(
  <Provider store={store}>
    <HashRouter>
      <Routes>
        <Route path="/*" element={<Full />} />
      </Routes>
    </HashRouter>
  </Provider>
)
