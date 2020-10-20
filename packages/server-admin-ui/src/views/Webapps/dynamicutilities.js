import React from 'react'

export const toLazyDynamicComponent = (moduleName, component) => React.lazy(() => new Promise((resolve) => {
  const container = window[toSafeModuleId(moduleName)]
  container.init(__webpack_share_scopes__.default)
  const module = container.get(component)
  module.then(factory => {
    resolve(factory())
  })
}))

export const toSafeModuleId = (moduleName) => moduleName.replace(/-/g, '_')