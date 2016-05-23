'use strict'

/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

const deep = require('deep-get-set')
const debug = require('debug')('signalk-server:providers')

module.exports = function(app) {
  const api = {
    start: startProviders
  }

  function handleError(err) {
    debug(`Encountered error: (${err.message}). Restarting pipeline.`)

    app.providers.forEach((provider) => {
      if (typeof provider !== 'object' || provider === null) {
        return
      }

      if (typeof provider.id === 'string' && Array.isArray(provider.pipeElements)) {
        provider.pipeElements.map((element) => {
          if (element === null) {
            return null
          }

          if (typeof element.removeAllListeners === 'function') {
            element.removeAllListeners()
          }

          if (typeof element.unpipe === 'function') {
            element.unpipe()
          }

          return null
        })
      }
    })

    app.providers = []
    api.start()
  }

  function createPipedProvider(providerConfig, nmea0183Listener) {
    const result = {
      id: providerConfig.id,
      pipeElements: providerConfig.pipeElements.map(createPipeElement)
    }

    result.pipeElements.forEach((pipeElement) => {
      if (typeof pipeElement.on === 'function') {
        pipeElement.on('nmea0183', nmea0183Listener)
      }
    })

    for (let i = result.pipeElements.length - 2; i >= 0; i--) {
      if (typeof result.pipeElements[i].on === 'function') {
        result.pipeElements[i].on('error', handleError)
      }

      if (typeof result.pipeElements[i].pipe === 'function') {
        result.pipeElements[i].pipe(result.pipeElements[i + 1])
      }
    }

    if (typeof result.pipeElements[result.pipeElements.length - 1].on === 'function') {
      result.pipeElements[result.pipeElements.length - 1].on('data', (data) => {
        if (data.updates) {
          if (typeof data.context === 'undefined') {
            data.context = 'vessels.' + app.selfId
          }

          data.updates.forEach((update) => {
            update.source.label = providerConfig.id

            if (!update.timestamp) {
              update.timestamp = new Date().toISOString()
            }
          })

          app.signalk.addDelta(data)
        }
      })

      result.pipeElements[result.pipeElements.length - 1].on('error', handleError)
    }

    return result
  }

  function createPipeElement(elementConfig) {
    const options = elementConfig.options || {}

    options.app = app

    if (elementConfig.optionMappings) {
      elementConfig.optionMappings.forEach((mapping) => {
        if (deep(app, mapping.fromAppProperty)) {
          options[mapping.toOption] = deep(app, mapping.fromAppProperty)
        }
      })
    }

    try {
      return new(require(elementConfig.type))(options)
    } catch (e) {
      return new(require(__dirname + '/../' + elementConfig.type))(options)
    }
  }

  function startProviders() {
    const nmea0183Listener = (sentence) => {
      app.signalk.emit('nmea0183', sentence)
    }

    if (Array.isArray(app.config.settings.pipedProviders)) {
      app.providers = app.config.settings.pipedProviders.map((providerConfig) => {
        return createPipedProvider(providerConfig, nmea0183Listener)
      })
    } else {
      debug("Error: no providers in the settings file")
      app.providers = []
    }

    return app.providers
  }

  return api
}
