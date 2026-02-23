import React from 'react'
import ReactDOM from 'react-dom'

interface ShareScopeEntry {
  get: () => Promise<() => unknown>
  loaded: boolean
  from: string
  eager: boolean
  shareConfig: {
    singleton: boolean
    requiredVersion: string
  }
}

interface ShareScope {
  react?: Record<string, ShareScopeEntry>
  'react-dom'?: Record<string, ShareScopeEntry>
  [key: string]: Record<string, ShareScopeEntry> | undefined
}

interface FederationInstance {
  shareScopeMap?: {
    default?: ShareScope
  }
}

interface Container {
  init: (shareScope: ShareScope) => Promise<void> | void
  get: (module: string) => Promise<() => { default: React.ComponentType }>
}

declare global {
  interface Window {
    [key: string]: Container | undefined
  }

  var __webpack_share_scopes__: { default: ShareScope } | undefined

  var __FEDERATION__: { __INSTANCES__?: FederationInstance[] } | undefined
}

let cachedShareScope: ShareScope | null = null
const initializedContainers = new Set<string>()

const getShareScope = (): ShareScope => {
  if (cachedShareScope) {
    return cachedShareScope
  }

  // Webpack-built hosts expose share scopes via this global
  if (typeof __webpack_share_scopes__ !== 'undefined') {
    cachedShareScope = __webpack_share_scopes__.default
    return cachedShareScope
  }

  // __FEDERATION__ global is set up by @module-federation/vite runtime
  if (
    typeof __FEDERATION__ !== 'undefined' &&
    __FEDERATION__.__INSTANCES__ &&
    __FEDERATION__.__INSTANCES__.length > 0
  ) {
    const hostInstance = __FEDERATION__.__INSTANCES__[0]
    if (hostInstance && hostInstance.shareScopeMap) {
      if (!hostInstance.shareScopeMap.default) {
        hostInstance.shareScopeMap.default = {}
      }
      cachedShareScope = hostInstance.shareScopeMap.default
      return cachedShareScope
    }
  }

  // Fallback for Webpack remotes — format matches Webpack's share scope structure
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
      [ReactDOM.version as string]: {
        get: () => Promise.resolve(() => ReactDOM),
        loaded: true,
        from: 'adminUI',
        eager: true,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${(ReactDOM as { version?: string }).version || ''}`
        }
      }
    }
  }
  return cachedShareScope
}

const initializeContainer = async (
  container: Container,
  moduleName: string
): Promise<void> => {
  const containerId = toSafeModuleId(moduleName)

  // Webpack containers throw if init() is called twice
  if (initializedContainers.has(containerId)) {
    return
  }

  const shareScope = getShareScope()

  // container.init() may return a promise in Vite Module Federation
  try {
    const initResult = container.init(shareScope)
    if (
      initResult &&
      typeof (initResult as Promise<void>).then === 'function'
    ) {
      await initResult
    }
    initializedContainers.add(containerId)
  } catch (error) {
    // Some containers throw "already initialized" errors - that's OK
    if (
      error instanceof Error &&
      error.message.includes('already been initialized')
    ) {
      initializedContainers.add(containerId)
    } else {
      throw error
    }
  }
}

const createErrorModule = (message?: string): { default: React.FC } => ({
  default: () =>
    React.createElement(
      'div',
      { className: 'p-4 text-center' },
      React.createElement(
        'h4',
        { className: 'text-danger' },
        'Error loading component'
      ),
      message &&
        React.createElement(
          'p',
          { className: 'text-secondary small mt-3' },
          message
        )
    )
})

export const toLazyDynamicComponent = (
  moduleName: string,
  component: string
): React.LazyExoticComponent<React.ComponentType> =>
  React.lazy(() =>
    (async () => {
      const container = window[toSafeModuleId(moduleName)] as
        | Container
        | undefined
      if (container === undefined) {
        console.error(`Could not load module ${moduleName}`)
        return createErrorModule(
          `Module "${moduleName}" is not available. Make sure the webapp is installed.`
        )
      }

      try {
        await initializeContainer(container, moduleName)

        // container.get() resolves to a factory function
        const factory = await container.get(component)
        if (!factory) {
          console.error(
            `Module ${moduleName} does not export component ${component}`
          )
          return createErrorModule(
            `Module "${moduleName}" does not export the required component.`
          )
        }

        const Module = factory()
        return Module as { default: React.ComponentType }
      } catch (ex) {
        console.error(`Error loading ${component} from ${moduleName}:`, ex)

        // Check for React version incompatibility
        const errorMessage = ex instanceof Error ? ex.message : String(ex)
        if (
          errorMessage.includes('hasOwnProperty') ||
          errorMessage.includes('Cannot read properties of undefined') ||
          (errorMessage.includes('Cannot access') &&
            errorMessage.includes('before initialization'))
        ) {
          return createErrorModule(
            `This webapp may be incompatible with React 19. ` +
              `It may need to be updated by its developer. (${moduleName})`
          )
        }

        return createErrorModule(`Failed to load webapp: ${errorMessage}`)
      }
    })()
  )

export const toSafeModuleId = (moduleName: string): string =>
  moduleName.replace(/[-@/]/g, '_')

export const APP_PANEL = './AppPanel'
export const ADDON_PANEL = './AddonPanel'
export const PLUGIN_CONFIG_PANEL = './PluginConfigurationPanel'
