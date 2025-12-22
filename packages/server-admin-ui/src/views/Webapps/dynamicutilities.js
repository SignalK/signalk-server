import React from 'react'
import ReactDOM from 'react-dom'

// Shared scope cache to ensure consistency across loads
let cachedShareScope = null

// Track which containers have been initialized to avoid calling init() twice
const initializedContainers = new Set()

// Get share scope from Vite's Module Federation runtime or Webpack
const getShareScope = () => {
  // Return cached scope if available
  if (cachedShareScope) {
    return cachedShareScope
  }

  /* eslint-disable no-undef */
  // First check for Webpack's share scope (for Webpack-built hosts)
  if (typeof __webpack_share_scopes__ !== 'undefined') {
    cachedShareScope = __webpack_share_scopes__.default
    return cachedShareScope
  }

  // For Vite Module Federation, get share scope from the runtime instance
  // The __FEDERATION__ global is set up by @module-federation/vite runtime
  if (
    typeof __FEDERATION__ !== 'undefined' &&
    __FEDERATION__.__INSTANCES__ &&
    __FEDERATION__.__INSTANCES__.length > 0
  ) {
    // Get the first (host) instance's share scope
    const hostInstance = __FEDERATION__.__INSTANCES__[0]
    if (hostInstance && hostInstance.shareScopeMap) {
      // Ensure the default scope exists
      if (!hostInstance.shareScopeMap.default) {
        hostInstance.shareScopeMap.default = {}
      }
      cachedShareScope = hostInstance.shareScopeMap.default
      return cachedShareScope
    }
  }

  // Fallback: create a share scope with react and react-dom for Webpack remotes
  // This ensures external Webpack-built webapps can access shared dependencies
  // Format matches Webpack's expected share scope structure
  cachedShareScope = {
    react: {
      [React.version]: {
        get: () => Promise.resolve(() => React),
        loaded: true,
        from: 'adminUI',
        eager: true,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${React.version}`
        }
      }
    },
    'react-dom': {
      [ReactDOM.version]: {
        get: () => Promise.resolve(() => ReactDOM),
        loaded: true,
        from: 'adminUI',
        eager: true,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${ReactDOM.version}`
        }
      }
    }
  }
  return cachedShareScope
  /* eslint-enable no-undef */
}

// Initialize container safely - handles async init and prevents double initialization
const initializeContainer = async (container, moduleName) => {
  const containerId = toSafeModuleId(moduleName)

  // Skip if already initialized - Webpack containers throw if init() is called twice
  if (initializedContainers.has(containerId)) {
    return
  }

  const shareScope = getShareScope()

  // container.init() may return a promise (especially in Vite Module Federation)
  // We need to await it to ensure initialization completes before calling get()
  try {
    const initResult = container.init(shareScope)
    if (initResult && typeof initResult.then === 'function') {
      await initResult
    }
    initializedContainers.add(containerId)
  } catch (error) {
    // Some containers throw "already initialized" errors - that's OK
    if (
      error.message &&
      error.message.includes('already been initialized')
    ) {
      initializedContainers.add(containerId)
    } else {
      throw error
    }
  }
}

export const toLazyDynamicComponent = (moduleName, component) =>
  React.lazy(() =>
    (async () => {
      const container = window[toSafeModuleId(moduleName)]
      if (container === undefined) {
        console.error(`Could not load module ${moduleName}`)
        return import('./loadingerror')
      }

      try {
        // Initialize container with shared scope from the host's Module Federation runtime
        await initializeContainer(container, moduleName)

        // container.get() returns a promise that resolves to a factory function
        const factory = await container.get(component)
        if (!factory) {
          console.error(
            `Module ${moduleName} does not export component ${component}`
          )
          return import('./loadingerror')
        }

        // Factory returns the actual module
        const Module = factory()
        return Module
      } catch (ex) {
        console.error(`Error loading ${component} from ${moduleName}:`, ex)
        return import('./loadingerror')
      }
    })()
  )

export const toSafeModuleId = (moduleName) => moduleName.replace(/[-@/]/g, '_')

export const APP_PANEL = './AppPanel'
export const ADDON_PANEL = './AddonPanel'
export const PLUGIN_CONFIG_PANEL = './PluginConfigurationPanel'
