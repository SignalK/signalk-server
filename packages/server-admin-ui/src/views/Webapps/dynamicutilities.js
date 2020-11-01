import React from 'react'

export const toLazyDynamicComponent = (moduleName, component) =>
  React.lazy(() => new Promise((resolve, reject) => {
    const container = window[toSafeModuleId(moduleName)]
    container.init(__webpack_share_scopes__.default)
    try {
      const module = container.get(component)
      module.then(factory => {
        resolve(factory())
      })
    } catch (ex) {
      console.error(moduleName)
      reject(ex)
    }
  }))

export const toSafeModuleId = (moduleName) => moduleName.replace(/[-@/]/g, '_')

export const APP_PANEL = './AppPanel'
export const ADDON_PANEL = './AddonPanel'
export const PLUGIN_CONFIG_PANEL = './PluginConfigurationPanel'
