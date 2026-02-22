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

const legacyReactContainers = new Set<string>()

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
  const hostMajor = parseInt(React.version.split('.')[0], 10)

  const reactVersionsBefore = new Set(Object.keys(shareScope.react || {}))

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

    if (shareScope.react) {
      for (const version of Object.keys(shareScope.react)) {
        if (!reactVersionsBefore.has(version)) {
          const major = parseInt(version.split('.')[0], 10)
          if (major !== hostMajor) {
            legacyReactContainers.add(containerId)
          }
        }
      }
    }
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

/**
 * Check whether a container uses a legacy (non-host) React version.
 *
 * Primary detection happens in initializeContainer() by observing new
 * React versions added to the share scope. However, when multiple
 * containers use the same legacy React version (e.g. React 16.14.0),
 * only the first one actually registers it — subsequent containers
 * reuse the existing entry silently. For those, we fall back to
 * fetching the container's remoteEntry.js source (served from browser
 * cache) and checking for React version declarations in the webpack
 * share scope initialization code.
 */
const containerUsesLegacyReact = async (
  moduleName: string
): Promise<boolean> => {
  if (legacyReactContainers.has(toSafeModuleId(moduleName))) {
    return true
  }

  // Fallback: fetch the remoteEntry.js source and check for legacy
  // React version patterns in the webpack init code
  const hostMajor = parseInt(React.version.split('.')[0], 10)
  try {
    const resp = await fetch(`/${moduleName}/remoteEntry.js`)
    if (resp.ok) {
      const source = await resp.text()
      // Webpack MF init registers shared deps with: ("react","16.14.0")
      const pattern = /\("react","(\d+)\.\d+\.\d+"\)/g
      let match
      while ((match = pattern.exec(source)) !== null) {
        const major = parseInt(match[1], 10)
        if (major !== hostMajor) {
          legacyReactContainers.add(toSafeModuleId(moduleName))
          return true
        }
      }
    }
  } catch {
    // If fetch fails, fall through — component will render directly
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let legacyReactDOM: any = null

/**
 * Helper: load a UMD script via fetch + new Function, providing a controlled
 * CommonJS-like environment so the UMD doesn't touch window globals.
 */
const loadUMD = async (
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  require: (name: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`)
  const code = await resp.text()
  const exportsObj: Record<string, unknown> = {}
  const moduleObj = { exports: exportsObj }

  const factory = new Function('exports', 'module', 'require', 'define', code)
  factory(exportsObj, moduleObj, require, undefined)
  return moduleObj.exports
}

/**
 * Load React 16 UMD + ReactDOM 16 UMD for bridging legacy remote components.
 *
 * The remote plugin bundles its own React 16 (CJS, via webpack chunks) and uses
 * it for hooks. The UMD ReactDOM 16 needs the UMD React 16 (which includes
 * the Scheduler). To ensure hooks work across both, we link the UMD React 16's
 * internal dispatcher objects to point to the same objects as the plugin's
 * webpack React 16, so both share the same hook state.
 */
const getLegacyReactDOM = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React16: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReactDOM16: any
} | null> => {
  if (legacyReactDOM) return legacyReactDOM

  // Get the plugin's React 16 from the share scope (registered by the remote
  // during container.init — same instance as the plugin's webpack module)
  const shareScope = getShareScope()
  const reactEntries = shareScope.react
  if (!reactEntries) return null

  const hostMajor = parseInt(React.version.split('.')[0], 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pluginReact16: any = null

  for (const version of Object.keys(reactEntries)) {
    const major = parseInt(version.split('.')[0], 10)
    if (major !== hostMajor) {
      try {
        pluginReact16 = (await reactEntries[version].get())()
        break
      } catch {
        // ignore
      }
    }
  }

  if (!pluginReact16) return null

  try {
    const base = document.baseURI || window.location.href

    // Load UMD React 16 (includes Scheduler, needed by UMD ReactDOM 16)
    const noRequire = (name: string) => {
      throw new Error(`Unexpected require("${name}")`)
    }
    const React16UMD = await loadUMD(
      new URL('react-16.production.min.js', base).href,
      noRequire
    )

    // Link the UMD React 16's internal dispatcher objects to the plugin's
    // webpack React 16. This makes ReactDOM 16 set the dispatcher that
    // the plugin's hooks actually read from.
    const pluginInternals =
      pluginReact16.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    const umdInternals =
      React16UMD.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    if (pluginInternals && umdInternals) {
      umdInternals.ReactCurrentDispatcher =
        pluginInternals.ReactCurrentDispatcher
      umdInternals.ReactCurrentBatchConfig =
        pluginInternals.ReactCurrentBatchConfig
      umdInternals.ReactCurrentOwner = pluginInternals.ReactCurrentOwner
      umdInternals.IsSomeRendererActing = pluginInternals.IsSomeRendererActing
    }

    const ReactDOM16 = await loadUMD(
      new URL('react-dom-16.production.min.js', base).href,
      (name: string) => {
        if (name === 'react') return React16UMD
        throw new Error(`Unexpected require("${name}") in ReactDOM UMD`)
      }
    )

    // Use pluginReact16 for createElement in the bridge so the elements
    // match what the plugin's internal code expects
    legacyReactDOM = { React16: pluginReact16, ReactDOM16 }
    return legacyReactDOM
  } catch (e) {
    console.warn('Could not load legacy ReactDOM for bridging:', e)
    return null
  }
}

/**
 * Create a React 19 wrapper that renders a legacy-React remote component
 * in an isolated DOM subtree using React 16's ReactDOM.render().
 *
 * The remote's component and all its dependencies use React 16 internally
 * (bundled in their webpack chunks). By rendering with ReactDOM 16, the
 * React 16 dispatcher is active when the component's hooks run, avoiding
 * the "Invalid hook call" error from dual React runtimes.
 */
const createLegacyBridge = (
  RemoteComponent: React.ComponentType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React16: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReactDOM16: any
): React.FC => {
  const Bridge: React.FC = (props) => {
    const containerRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
      const el = containerRef.current
      if (!el) return
      ReactDOM16.render(React16.createElement(RemoteComponent, props), el)
    })

    React.useEffect(() => {
      const el = containerRef.current
      return () => {
        if (el) {
          try {
            ReactDOM16.unmountComponentAtNode(el)
          } catch {
            // best-effort cleanup
          }
        }
      }
    }, [])

    // eslint-disable-next-line react-hooks/refs
    return React.createElement('div', { ref: containerRef })
  }
  Bridge.displayName = `LegacyBridge(${(RemoteComponent as { displayName?: string }).displayName || RemoteComponent.name || 'Remote'})`
  return Bridge
}

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
        const RemoteComponent = (Module as { default: React.ComponentType })
          .default

        // Bridge with legacy ReactDOM to avoid hook / element errors
        // from dual React runtimes
        if (await containerUsesLegacyReact(moduleName)) {
          const legacy = await getLegacyReactDOM()
          if (legacy) {
            console.log(
              `Module ${moduleName} uses legacy React — bridging with isolated ReactDOM.render`
            )
            return {
              default: createLegacyBridge(
                RemoteComponent,
                legacy.React16,
                legacy.ReactDOM16
              )
            }
          }
          // If we couldn't load the legacy ReactDOM, fall through and try
          // rendering directly — it may still work for simple components.
          console.warn(
            `Module ${moduleName} uses legacy React but ReactDOM bridge is unavailable`
          )
        }

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
