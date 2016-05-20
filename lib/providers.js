'use strict'

/*
 * Copyright 2016 Fabian Tollenaar <fabian@decipher.industries>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('signalk-experimental-providers')
const deep = require('deep-get-set')

module.exports = function (app) {

  const API = {
    start: startProviders
  }

  function parseConfig (config) {
    Object.keys(config).forEach((key) => {
      if (!config.hasOwnProperty(key)) {
        return
      }

      if (!isOptionMapping(config[key])) {
        return
      }

      const mapping = config[key]

      if (mapping.source === 'app' && deep(app, mapping.property)) {
        config[key] = deep(app, mapping.property)
        return
      }

      if (mapping.source === 'argv' && deep(app, `argv.${mapping.property}`)) {
        config[key] = deep(app, `argv.${mapping.property}`)
        return
      }
    })

    return config
  }

  function prepareProvider (provider) {
    if (typeof provider === 'string' && provider.trim() !== '') {
      provider = {
        name: provider,
        config: {}
      }
    } else if (isObject(provider) && typeof provider.name === 'string' && provider.name.trim() !== '') {
      provider.config = parseConfig(provider.config)
    }

    try {
      // provider.Module = require(provider.name) @TODO
      provider.Module = require(`../providers/${provider.name}`)
      provider.config.app = app
    } catch (e) {
      debug(`Error requiring provider module: ${e.message}`)
      throw new Error(`Provider ${provider.name} coudn't be found. Did you run 'npm install ${provider.name} --save'?`)
    }

    return provider
  }

  function initProvider (provider, nmea0183Listener) {
    let Module = new provider.Module(provider.config)

    if (typeof Module.on !== 'function') {
      return Module
    }

    Module.on('nmea0183', nmea0183Listener)

    Module.on('error', (err) => {
      debug(`${provider.name} hit an error: ${err.message}`)
      debug('Killing all providers and restarting the pipeline')

      if (Array.isArray(app.providers) && app.providers.length > 0) {
        app.providers.forEach(M => {
          if (isObject(M) && typeof M.removeAllListeners === 'function') {
            M.removeAllListeners()
          }

          M = null
        })
      }

      if (isObject(Module) && typeof Module.removeAllListeners === 'function') {
        Module.removeAllListeners()
      }

      Module = null
      app.providers = API.start()
    })

    Module.on('data', (delta) => {
      if (!isObject(delta) || typeof delta.updates === 'undefined') {
        return
      }

      if (typeof delta.context === 'undefined') {
        delta.context = `vessels.${app.selfId}`
      }

      delta.updates.forEach((update) => {
        update.source.label = provider.name

        if (!update.timestamp) {
          update.timestamp = new Date().toISOString()
        }
      })

      app.signalk.addDelta(delta)
    })

    return Module
  }

  function startProviders () {
    if (!Array.isArray(app.config.settings.experimentalProviders) || app.config.settings.experimentalProviders.length === 0) {
      console.warn('Warning: no providers found in the config')
      return []
    }

    const Modules = []

    app.config.settings.experimentalProviders.map((provider) => {
      Modules.push(initProvider(prepareProvider(provider), (sentence) => {
        app.signalk.emit('nmea0183', sentence)
      }))
    })

    Modules.forEach((Module, index) => {
      if (typeof Modules[index + 1] !== 'undefined') {
        Module.pipe(Modules[index + 1])
      }
    })

    return Modules
  }

  return API

}

function isObject(mixed) {
  return (typeof mixed === 'object' && mixed !== null)
}

function isOptionMapping(mixed) {
  return (isObject(mixed) && typeof mixed.source === "string" && typeof mixed.source.trim() !== "")
}
