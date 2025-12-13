/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for plugin hotplug filtering functionality
 *
 * Plugin hotplug handles the lifecycle of both Node.js and WASM plugins,
 * including appstore installs, enabling/disabling, and webapp filtering.
 *
 * These tests verify that disabled plugin webapps are correctly filtered
 * from the webapps list. Tests use mock data and don't require any plugins
 * to be installed.
 */

import { expect } from 'chai'

describe('Plugin Hotplug Filtering', function () {
  /**
   * Helper to create a mock app object with plugins and webapps
   */
  function createMockApp(options: {
    plugins: Array<{
      id: string
      packageName: string
      type?: 'wasm' | 'nodejs'
      enabled?: boolean
    }>
    webapps: Array<{ name: string }>
    embeddablewebapps?: Array<{ name: string }>
    pluginOptions?: Record<string, { enabled: boolean }>
  }): any {
    const pluginOptions = options.pluginOptions || {}

    // For Node.js plugins, enabled state comes from getPluginOptions
    // For WASM plugins, enabled state is on the plugin object directly
    const plugins = options.plugins.map((p) => ({
      ...p,
      type: p.type || 'nodejs'
    }))

    return {
      plugins,
      pluginsMap: plugins.reduce(
        (acc, p) => {
          acc[p.id] = p
          return acc
        },
        {} as Record<string, any>
      ),
      webapps: options.webapps,
      embeddablewebapps: options.embeddablewebapps || [],
      getPluginOptions: (id: string) => {
        // WASM plugins don't use getPluginOptions, they have enabled on the object
        const plugin = plugins.find((p) => p.id === id)
        if (plugin?.type === 'wasm') {
          return { enabled: plugin.enabled }
        }
        return pluginOptions[id] || { enabled: false }
      }
    }
  }

  /**
   * Implementation of filterEnabledWebapps (same logic as in plugins.ts)
   * This allows us to test the filtering logic in isolation
   */
  function filterEnabledWebapps(app: any, webapps: any[]): any[] {
    if (!app.plugins || !app.getPluginOptions) {
      return webapps
    }

    const enabledPluginNames = new Set<string>()
    const allPluginNames = new Set<string>()

    for (const plugin of app.plugins) {
      if (plugin.packageName) {
        allPluginNames.add(plugin.packageName)

        let isEnabled = false
        if (plugin.type === 'wasm') {
          isEnabled = plugin.enabled === true
        } else {
          const pluginOptions = app.getPluginOptions(plugin.id)
          isEnabled = pluginOptions?.enabled === true
        }

        if (isEnabled) {
          enabledPluginNames.add(plugin.packageName)
        }
      }
    }

    return webapps.filter((w: any) => {
      const isPluginWebapp = allPluginNames.has(w.name)
      if (!isPluginWebapp) return true // Keep standalone webapps
      return enabledPluginNames.has(w.name)
    })
  }

  describe('filterEnabledWebapps', function () {
    it('returns all webapps when no plugins exist', function () {
      const app = createMockApp({
        plugins: [],
        webapps: [{ name: 'standalone-webapp' }, { name: 'another-webapp' }]
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(2)
      expect(result.map((w: any) => w.name)).to.include('standalone-webapp')
      expect(result.map((w: any) => w.name)).to.include('another-webapp')
    })

    it('keeps standalone webapps that have no associated plugin', function () {
      const app = createMockApp({
        plugins: [
          { id: 'plugin-a', packageName: 'plugin-a-pkg', enabled: false }
        ],
        webapps: [
          { name: 'standalone-webapp' },
          { name: 'plugin-a-pkg' } // This one should be filtered
        ],
        pluginOptions: {
          'plugin-a': { enabled: false }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(1)
      expect(result[0].name).to.equal('standalone-webapp')
    })

    it('filters disabled Node.js plugin webapps', function () {
      const app = createMockApp({
        plugins: [
          { id: 'enabled-plugin', packageName: '@signalk/enabled-plugin' },
          { id: 'disabled-plugin', packageName: '@signalk/disabled-plugin' }
        ],
        webapps: [
          { name: '@signalk/enabled-plugin' },
          { name: '@signalk/disabled-plugin' }
        ],
        pluginOptions: {
          'enabled-plugin': { enabled: true },
          'disabled-plugin': { enabled: false }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(1)
      expect(result[0].name).to.equal('@signalk/enabled-plugin')
    })

    it('filters disabled WASM plugin webapps', function () {
      const app = createMockApp({
        plugins: [
          {
            id: 'wasm-enabled',
            packageName: '@mayara/wasm-enabled',
            type: 'wasm',
            enabled: true
          },
          {
            id: 'wasm-disabled',
            packageName: '@mayara/wasm-disabled',
            type: 'wasm',
            enabled: false
          }
        ],
        webapps: [
          { name: '@mayara/wasm-enabled' },
          { name: '@mayara/wasm-disabled' }
        ]
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(1)
      expect(result[0].name).to.equal('@mayara/wasm-enabled')
    })

    it('handles mixed Node.js and WASM plugins correctly', function () {
      const app = createMockApp({
        plugins: [
          { id: 'nodejs-enabled', packageName: 'nodejs-enabled-pkg' },
          { id: 'nodejs-disabled', packageName: 'nodejs-disabled-pkg' },
          {
            id: 'wasm-enabled',
            packageName: 'wasm-enabled-pkg',
            type: 'wasm',
            enabled: true
          },
          {
            id: 'wasm-disabled',
            packageName: 'wasm-disabled-pkg',
            type: 'wasm',
            enabled: false
          }
        ],
        webapps: [
          { name: 'nodejs-enabled-pkg' },
          { name: 'nodejs-disabled-pkg' },
          { name: 'wasm-enabled-pkg' },
          { name: 'wasm-disabled-pkg' },
          { name: 'standalone-webapp' }
        ],
        pluginOptions: {
          'nodejs-enabled': { enabled: true },
          'nodejs-disabled': { enabled: false }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(3)
      const names = result.map((w: any) => w.name)
      expect(names).to.include('nodejs-enabled-pkg')
      expect(names).to.include('wasm-enabled-pkg')
      expect(names).to.include('standalone-webapp')
      expect(names).to.not.include('nodejs-disabled-pkg')
      expect(names).to.not.include('wasm-disabled-pkg')
    })

    it('includes embeddable webapps in filtering', function () {
      const app = createMockApp({
        plugins: [
          { id: 'plugin-a', packageName: 'plugin-a-pkg' },
          { id: 'plugin-b', packageName: 'plugin-b-pkg' }
        ],
        webapps: [{ name: 'plugin-a-pkg' }],
        embeddablewebapps: [{ name: 'plugin-b-pkg' }],
        pluginOptions: {
          'plugin-a': { enabled: true },
          'plugin-b': { enabled: false }
        }
      })

      const allWebapps = [...app.webapps, ...app.embeddablewebapps]
      const result = filterEnabledWebapps(app, allWebapps)

      expect(result).to.have.length(1)
      expect(result[0].name).to.equal('plugin-a-pkg')
    })

    it('handles plugins without packageName gracefully', function () {
      const app = createMockApp({
        plugins: [
          { id: 'no-package', packageName: '' },
          { id: 'with-package', packageName: 'with-package-pkg' }
        ],
        webapps: [{ name: 'with-package-pkg' }, { name: 'other-webapp' }],
        pluginOptions: {
          'with-package': { enabled: true }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)

      // Should include with-package-pkg (enabled) and other-webapp (standalone)
      expect(result).to.have.length(2)
    })

    it('handles empty webapps array', function () {
      const app = createMockApp({
        plugins: [{ id: 'plugin-a', packageName: 'plugin-a-pkg' }],
        webapps: [],
        pluginOptions: {
          'plugin-a': { enabled: true }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(0)
    })

    it('returns unfiltered list when app.plugins is undefined', function () {
      const app = {
        plugins: undefined,
        webapps: [{ name: 'webapp-1' }, { name: 'webapp-2' }],
        getPluginOptions: () => ({ enabled: false })
      }

      const result = filterEnabledWebapps(app, app.webapps)

      expect(result).to.have.length(2)
    })

    it('returns unfiltered list when app.getPluginOptions is undefined', function () {
      const app = {
        plugins: [{ id: 'plugin-a', packageName: 'plugin-a-pkg' }],
        webapps: [{ name: 'plugin-a-pkg' }],
        getPluginOptions: undefined
      }

      const result = filterEnabledWebapps(app, app.webapps as any[])

      expect(result).to.have.length(1)
    })
  })

  describe('Plugin enabled state detection', function () {
    it('detects Node.js plugin enabled state from getPluginOptions', function () {
      const app = createMockApp({
        plugins: [{ id: 'test-plugin', packageName: 'test-plugin-pkg' }],
        webapps: [{ name: 'test-plugin-pkg' }],
        pluginOptions: {
          'test-plugin': { enabled: true }
        }
      })

      const result = filterEnabledWebapps(app, app.webapps)
      expect(result).to.have.length(1)

      // Now disable it
      app.getPluginOptions = () => ({ enabled: false })
      const result2 = filterEnabledWebapps(app, app.webapps)
      expect(result2).to.have.length(0)
    })

    it('detects WASM plugin enabled state from plugin.enabled property', function () {
      const app = createMockApp({
        plugins: [
          {
            id: 'wasm-plugin',
            packageName: 'wasm-plugin-pkg',
            type: 'wasm',
            enabled: true
          }
        ],
        webapps: [{ name: 'wasm-plugin-pkg' }]
      })

      const result = filterEnabledWebapps(app, app.webapps)
      expect(result).to.have.length(1)

      // Disable by changing plugin.enabled directly
      app.plugins[0].enabled = false
      const result2 = filterEnabledWebapps(app, app.webapps)
      expect(result2).to.have.length(0)
    })
  })
})
