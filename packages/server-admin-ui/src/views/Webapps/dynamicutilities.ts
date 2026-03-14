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

/**
 * Initialize a legacy container with a share scope containing only React 16.
 * This ensures the remote's webpack runtime resolves `react` to R16,
 * avoiding crashes from R19's restructured internals.
 */
const initLegacyContainer = async (
  container: Container,
  moduleName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legacy: { React16: any; ReactDOM16: any }
): Promise<void> => {
  const containerId = toSafeModuleId(moduleName)
  if (initializedContainers.has(containerId)) {
    return
  }

  const r16Version = legacy.React16.version || '16.14.0'
  const legacyShareScope: ShareScope = {
    react: {
      [r16Version]: {
        get: () => Promise.resolve(() => legacy.React16),
        loaded: true,
        from: 'legacyBridge',
        eager: true,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${r16Version}`
        }
      }
    },
    'react-dom': {
      [r16Version]: {
        get: () => Promise.resolve(() => legacy.ReactDOM16),
        loaded: true,
        from: 'legacyBridge',
        eager: true,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${r16Version}`
        }
      }
    }
  }

  try {
    const initResult = container.init(legacyShareScope)
    if (
      initResult &&
      typeof (initResult as Promise<void>).then === 'function'
    ) {
      await initResult
    }
    initializedContainers.add(containerId)
    legacyReactContainers.add(containerId)
  } catch (error) {
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
 * When called before container.init(), no plugin React 16 is in the share
 * scope yet.  In that case the UMD React 16 is used directly — the container
 * will later be initialized with a share scope pointing to this same UMD
 * instance, so the plugin's webpack chunks resolve 'react' to the UMD React
 * 16 and everything shares one React instance.
 *
 * When called after container.init() (post-init detection), the plugin's
 * webpack React 16 is already in the share scope.  We link the UMD React 16's
 * internal dispatcher objects to the plugin's instance so hooks work across
 * both.
 */
const getLegacyReactDOM = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React16: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReactDOM16: any
} | null> => {
  if (legacyReactDOM) return legacyReactDOM

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

    // Try to get the plugin's React 16 from the share scope (registered
    // by a previous container.init).  If found, link dispatchers so hooks
    // work across the plugin's CJS React 16 and the UMD ReactDOM 16.
    const shareScope = getShareScope()
    const reactEntries = shareScope.react
    const hostMajor = parseInt(React.version.split('.')[0], 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pluginReact16: any = null

    if (reactEntries) {
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
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let React16ForBridge: any
    if (pluginReact16) {
      // Link UMD internals → plugin's CJS internals so ReactDOM 16
      // sets the dispatcher that the plugin's hooks read from
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
      // Use the plugin's React 16 for createElement so elements match
      React16ForBridge = pluginReact16
    } else {
      // No plugin React 16 yet (pre-init).  The container will be
      // initialized with a share scope pointing to React16UMD, so
      // the plugin's webpack chunks will use this same instance.
      React16ForBridge = React16UMD
    }

    const ReactDOM16 = await loadUMD(
      new URL('react-dom-16.production.min.js', base).href,
      (name: string) => {
        if (name === 'react') return React16UMD
        throw new Error(`Unexpected require("${name}") in ReactDOM UMD`)
      }
    )

    legacyReactDOM = { React16: React16ForBridge, ReactDOM16 }
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
        // Detect legacy React *before* container.init() — if the remote
        // uses React 16 and we init with the default (R19) share scope,
        // singleton resolution picks R19 and factory() crashes when the
        // remote's R16 code accesses removed internals like
        // ReactCurrentOwner.  By detecting early we can init the
        // container with a R16-only share scope so the remote's webpack
        // runtime resolves 'react' → R16 from the start.
        const isLegacy = await containerUsesLegacyReact(moduleName)

        if (isLegacy) {
          const legacy = await getLegacyReactDOM()
          if (legacy) {
            await initLegacyContainer(container, moduleName, legacy)

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
        }

        // Normal (non-legacy) path
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

        // Double-check: initializeContainer may have detected legacy
        // after init (via share scope version diff)
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
