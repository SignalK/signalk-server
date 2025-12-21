import React from 'react'

export const toLazyDynamicComponent = (moduleName, component) =>
  React.lazy(
    () =>
      new Promise((resolve, reject) => {
        const container = window[toSafeModuleId(moduleName)]
        if (container === undefined) {
          console.error(`Could not load module ${moduleName}`)
          resolve(import('./loadingerror'))
          return
        }

        // Initialize container with shared scope
        // For Vite Module Federation, the container may already be initialized
        // or we need to use the shared scope from window
        /* eslint-disable no-undef */
        const shareScope =
          typeof __webpack_share_scopes__ !== 'undefined'
            ? __webpack_share_scopes__.default
            : typeof __federation_shared__ !== 'undefined'
              ? __federation_shared__
              : {}
        /* eslint-enable no-undef */

        container.init(shareScope)
        try {
          const module = container.get(component)
          module.then((factory) => {
            resolve(factory())
          })
        } catch (ex) {
          console.error(moduleName)
          reject(ex)
        }
      })
  )

export const toSafeModuleId = (moduleName) => moduleName.replace(/[-@/]/g, '_')

export const APP_PANEL = './AppPanel'
export const ADDON_PANEL = './AddonPanel'
export const PLUGIN_CONFIG_PANEL = './PluginConfigurationPanel'
