/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import { createDebug } from '../debug'
const debug = createDebug('signalk-server:interfaces:webapps')
const fs = require('fs')
const path = require('path')
const express = require('express')
const modulesWithKeyword = require('../modules').modulesWithKeyword
import { SERVERROUTESPREFIX } from '../constants'
import { uniqBy } from 'lodash'

module.exports = function (app) {
  return {
    start: function () {
      app.webapps = mountWebModules(app, 'signalk-webapp').map(
        (moduleData) => moduleData.metadata
      )
      app.addons = mountWebModules(app, 'signalk-node-server-addon').map(
        (moduleData) => moduleData.metadata
      )
      app.embeddablewebapps = mountWebModules(
        app,
        'signalk-embeddable-webapp'
      ).map((moduleData) => moduleData.metadata)
      app.pluginconfigurators = mountWebModules(
        app,
        'signalk-plugin-configurator'
      ).map((moduleData) => moduleData.metadata)
      mountApis(app)

      // Note: Filtering of disabled plugin webapps (both Node.js and WASM)
      // is now done in index.ts after all interfaces have started.
      // This ensures plugins are fully registered before filtering.
    },

    stop: function () {}
  }
}

function mountWebModules(app, keyword) {
  debug(`mountWebModules:${keyword}`)
  const modules = modulesWithKeyword(app.config, keyword)
  modules.forEach((moduleData) => {
    let webappPath = path.join(moduleData.location, moduleData.module)
    if (fs.existsSync(webappPath + '/public/')) {
      webappPath += '/public/'
    }
    debug('Mounting web module /' + moduleData.module + ':' + webappPath)
    // Middleware to block access when the associated plugin is disabled
    const webappEnabledMiddleware = (req, res, next) => {
      // Always allow static assets (logos, icons, images) for the Admin UI plugin list
      // These should be accessible even for disabled plugins so the UI can display them
      const isStaticAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(req.path)
      if (isStaticAsset) {
        return next()
      }

      // Check if this is a WASM plugin webapp and WASM runtime is disabled
      const isWasmPlugin = moduleData.metadata.keywords?.includes(
        'signalk-wasm-plugin'
      )
      if (isWasmPlugin) {
        // Check interfaces.wasm setting - note: settings are in app.config.settings
        const wasmEnabled = app.config?.settings?.interfaces?.wasm !== false
        if (!wasmEnabled) {
          res
            .status(503)
            .send(
              `Webapp ${moduleData.module} is disabled (WASM runtime disabled)`
            )
          return
        }
      }

      // Check if this webapp has an associated plugin that is disabled
      // Try multiple ways to find the plugin:
      // 1. By module name without scope prefix (e.g., @signalk/freeboard-sk -> freeboard-sk)
      // 2. By package name (for WASM plugins that use different IDs)
      const pluginIdFromModule = moduleData.module.replace(/^@.*\//, '')

      // Find plugin by checking pluginsMap (includes both Node.js and WASM plugins)
      let plugin = app.pluginsMap && app.pluginsMap[pluginIdFromModule]

      // If not found, search by packageName (for WASM plugins with different IDs)
      if (!plugin && app.plugins) {
        plugin = app.plugins.find((p) => p.packageName === moduleData.module)
      }

      if (plugin) {
        // For WASM plugins, check plugin.enabled directly
        // For Node.js plugins, check via getPluginOptions
        if (plugin.type === 'wasm') {
          if (plugin.enabled === false) {
            res.status(503).send(`Webapp ${moduleData.module} is disabled`)
            return
          }
        } else {
          const pluginOptions =
            app.getPluginOptions && app.getPluginOptions(plugin.id)
          if (pluginOptions && pluginOptions.enabled === false) {
            res.status(503).send(`Webapp ${moduleData.module} is disabled`)
            return
          }
        }
      }
      next()
    }
    app.use(
      '/' + moduleData.module,
      webappEnabledMiddleware,
      express.static(webappPath)
    )
  })
  return modules
}

function mountApis(app) {
  app.get(`${SERVERROUTESPREFIX}/webapps`, function (req, res) {
    let allWebapps = [].concat(app.webapps).concat(app.embeddablewebapps)

    // Filter out disabled plugin webapps at request time
    // This handles the race condition during startup where the list
    // may not have been filtered yet by filterDisabledPluginWebapps()
    if (app.plugins && app.getPluginOptions) {
      const enabledPluginNames = new Set()
      const allPluginNames = new Set()

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

      allWebapps = allWebapps.filter((w) => {
        const isPluginWebapp = allPluginNames.has(w.name)
        if (!isPluginWebapp) return true // Keep standalone webapps
        return enabledPluginNames.has(w.name)
      })
    }

    // Disable caching to prevent browser from showing stale data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.json(uniqBy(allWebapps, 'name'))
  })
  app.get(`${SERVERROUTESPREFIX}/addons`, function (req, res) {
    res.json(app.addons)
  })
}
