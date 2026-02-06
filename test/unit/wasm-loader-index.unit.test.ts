import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type LoaderMocks = {
  lifecycle: Record<string, unknown>
  registry: Record<string, unknown>
  config: Record<string, unknown>
  routes: Record<string, unknown>
}

const loadWasmLoaderIndex = (mocks: LoaderMocks) => {
  const loaderPath = require.resolve('../../src/wasm/loader/index')
  const entries: Array<{ id: string; previous?: NodeModule }> = []

  const mockModule = (id: string, exports: unknown) => {
    const resolved = require.resolve(id)
    entries.push({ id: resolved, previous: require.cache[resolved] })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports
    } as NodeModule
  }

  mockModule('../../src/wasm/loader/plugin-lifecycle', mocks.lifecycle)
  mockModule('../../src/wasm/loader/plugin-config', mocks.config)
  mockModule('../../src/wasm/loader/plugin-registry', mocks.registry)
  mockModule('../../src/wasm/loader/plugin-routes', mocks.routes)
  mockModule('../../src/wasm/loader/types', {})

  delete require.cache[loaderPath]
  const loader = require(loaderPath)

  return {
    loader,
    restore: () => {
      delete require.cache[loaderPath]
      entries.forEach(({ id, previous }) => {
        if (previous) {
          require.cache[id] = previous
        } else {
          delete require.cache[id]
        }
      })
    }
  }
}

describe('wasm loader index', () => {
  it('wires lifecycle functions and re-exports APIs', () => {
    const lifecycle = {
      startWasmPlugin: () => 'start',
      stopWasmPlugin: () => 'stop',
      unloadWasmPlugin: () => 'unload',
      reloadWasmPlugin: () => 'reload',
      handleWasmPluginCrash: () => 'crash',
      shutdownAllWasmPlugins: () => 'shutdown'
    }
    const config = {
      updateWasmPluginConfig: () => 'update',
      setWasmPluginEnabled: () => 'enable'
    }

    let initArgs: unknown[] = []
    const registry = {
      initializeLifecycleFunctions: (...args: unknown[]) => {
        initArgs = args
      },
      wasmPlugins: new Map(),
      restartTimers: new Map(),
      setPluginStatus: () => 'status',
      registerWasmPlugin: () => 'register',
      getAllWasmPlugins: () => [],
      getWasmPlugin: () => null
    }

    const routes = {
      backwardsCompat: () => 'backwards',
      handleLogViewerRequest: () => 'log',
      setupPluginSpecificRoutes: () => 'specific',
      setupWasmPluginRoutes: () => 'routes'
    }

    const { loader, restore } = loadWasmLoaderIndex({
      lifecycle,
      registry,
      config,
      routes
    })

    try {
      expect(initArgs).to.have.length(4)
      expect(initArgs[0]).to.equal(lifecycle.startWasmPlugin)
      expect(initArgs[1]).to.equal(config.updateWasmPluginConfig)
      expect(initArgs[2]).to.equal(lifecycle.unloadWasmPlugin)
      expect(initArgs[3]).to.equal(lifecycle.stopWasmPlugin)

      expect(loader.startWasmPlugin).to.equal(lifecycle.startWasmPlugin)
      expect(loader.stopWasmPlugin).to.equal(lifecycle.stopWasmPlugin)
      expect(loader.unloadWasmPlugin).to.equal(lifecycle.unloadWasmPlugin)
      expect(loader.reloadWasmPlugin).to.equal(lifecycle.reloadWasmPlugin)
      expect(loader.handleWasmPluginCrash).to.equal(lifecycle.handleWasmPluginCrash)
      expect(loader.shutdownAllWasmPlugins).to.equal(lifecycle.shutdownAllWasmPlugins)
      expect(loader.updateWasmPluginConfig).to.equal(config.updateWasmPluginConfig)
      expect(loader.setWasmPluginEnabled).to.equal(config.setWasmPluginEnabled)
      expect(loader.wasmPlugins).to.equal(registry.wasmPlugins)
      expect(loader.restartTimers).to.equal(registry.restartTimers)
      expect(loader.setPluginStatus).to.equal(registry.setPluginStatus)
      expect(loader.registerWasmPlugin).to.equal(registry.registerWasmPlugin)
      expect(loader.getAllWasmPlugins).to.equal(registry.getAllWasmPlugins)
      expect(loader.getWasmPlugin).to.equal(registry.getWasmPlugin)
      expect(loader.backwardsCompat).to.equal(routes.backwardsCompat)
      expect(loader.handleLogViewerRequest).to.equal(routes.handleLogViewerRequest)
      expect(loader.setupPluginSpecificRoutes).to.equal(routes.setupPluginSpecificRoutes)
      expect(loader.setupWasmPluginRoutes).to.equal(routes.setupWasmPluginRoutes)
    } finally {
      restore()
    }
  })
})
