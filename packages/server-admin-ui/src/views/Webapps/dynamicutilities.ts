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

/**
 * Resolve a module's remoteEntry.js URL from the server-injected script
 * tags, bridging safe IDs (e.g. _canboat_visual_analyzer) back to the
 * original package name paths (e.g. /@canboat/visual-analyzer/).
 */
const findRemoteEntryUrl = (moduleName: string): string | null => {
  const safeId = toSafeModuleId(moduleName)
  const scripts = document.querySelectorAll('script[src$="/remoteEntry.js"]')
  for (const script of scripts) {
    const src = script.getAttribute('src')
    if (!src) continue
    const match = src.match(/^\/(.+)\/remoteEntry\.js$/)
    if (match && toSafeModuleId(match[1]) === safeId) {
      return src
    }
  }
  return null
}

const initializeContainer = async (
  container: Container,
  moduleName: string
): Promise<void> => {
  const containerId = toSafeModuleId(moduleName)

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
    // Benign: container was initialized by another code path
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
 * Using a separate scope ensures webpack's singleton resolution always picks
 * R16 — if we mutated the host scope (temporarily hiding R19), the container
 * would keep a reference to that same object and later chunk resolution
 * would pick R19 (higher version, not yet loaded) over R16.
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

  const r16Version =
    (legacy.React16 as { version?: string }).version || '16.14.0'
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

/** Load a UMD script in an isolated CommonJS shim (no window globals). */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedLegacyReact: { React16: any; ReactDOM16: any } | null = null

/**
 * Load React 16 + ReactDOM 16 for bridging legacy remote components.
 *
 * React 16 is loaded from the share scope if a plugin already registered it
 * (via container.init), otherwise from a bundled UMD. ReactDOM 16 always
 * comes from the bundled UMD, wired to the same React 16 instance so hooks
 * share a single dispatcher.
 */
const getLegacyReact = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React16: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReactDOM16: any
} | null> => {
  if (cachedLegacyReact) return cachedLegacyReact

  try {
    const base = document.baseURI || window.location.href
    const noRequire = (name: string) => {
      throw new Error(`Unexpected require("${name}")`)
    }

    // Load UMD React 16 first (includes Scheduler, needed by ReactDOM 16)
    const React16UMD = await loadUMD(
      new URL('react-16.production.min.js', base).href,
      noRequire
    )

    // Check if a plugin already registered its React 16 in the share scope.
    // If so, link the UMD's internal dispatchers to the plugin's instance
    // so hooks work across both the plugin's CJS React and the UMD ReactDOM.
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
      React16ForBridge = pluginReact16
    } else {
      // No plugin React 16 yet (pre-init). The container will be
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

    cachedLegacyReact = { React16: React16ForBridge, ReactDOM16 }
    return cachedLegacyReact
  } catch (e) {
    console.warn('Could not load legacy ReactDOM for bridging:', e)
    return null
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
 * Uses two strategies: first checks if initializeContainer() observed
 * a non-host React version in the share scope. Falls back to fetching
 * the remoteEntry.js source and scanning for React version declarations,
 * since containers sharing an already-registered version (e.g. when
 * multiple plugins use React 16.14.0) don't create new scope entries.
 */
const containerUsesLegacyReact = async (
  moduleName: string
): Promise<boolean> => {
  if (legacyReactContainers.has(toSafeModuleId(moduleName))) {
    return true
  }

  const remoteEntryUrl = findRemoteEntryUrl(moduleName)
  if (!remoteEntryUrl) {
    return false
  }
  const hostMajor = parseInt(React.version.split('.')[0], 10)
  try {
    const resp = await fetch(remoteEntryUrl)
    if (resp.ok) {
      const source = await resp.text()
      // Match webpack MF shared dep declarations: ("react","16.14.0"
      const pattern = /\("react","(\d+)\.\d+\.\d+"/g
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

/**
 * Wrap a legacy-React component so it renders in an isolated R16 subtree
 * via ReactDOM 16's render(), avoiding hook errors from mixed runtimes.
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
    const propsRef = React.useRef(props)
    propsRef.current = props

    React.useEffect(() => {
      const el = containerRef.current
      if (!el) return
      // Deferred to avoid interfering with R19's commit phase (error #525)
      let cancelled = false
      const id = setTimeout(() => {
        if (!cancelled) {
          ReactDOM16.render(
            React16.createElement(RemoteComponent, propsRef.current),
            el
          )
        }
      }, 0)
      return () => {
        cancelled = true
        clearTimeout(id)
      }
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
        const isLegacy = await containerUsesLegacyReact(moduleName)

        if (isLegacy) {
          const legacy = await getLegacyReact()
          if (legacy) {
            await initLegacyContainer(container, moduleName, legacy)

            const factory = await container.get(component)
            if (!factory) {
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

        const factory = await container.get(component)
        if (!factory) {
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
          const legacy = await getLegacyReact()
          if (legacy) {
            console.log(
              `Module ${moduleName} uses legacy React (post-init) — bridging with isolated ReactDOM.render`
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
