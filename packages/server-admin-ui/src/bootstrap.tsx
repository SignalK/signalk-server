import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'

import '../scss/style.scss'
import '../scss/core/_dropdown-menu-right.scss'

import Full from './containers/Full/Full'
import { store } from './store'

window.serverRoutesPrefix = '/skServer'

const container = document.getElementById('root')!
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
