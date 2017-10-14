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
const devnull = new (require('dev-null-stream'))()

module.exports = function (app) {
  function createPipedProvider (providerConfig, nmea0183Listener) {
    var result = {
      id: providerConfig.id,
      pipeElements: providerConfig.pipeElements.reduce((result, config) => {
        if (typeof config.enabled === 'undefined' || config.enabled) {
          result.push(createPipeElement(config))
        }
        return result
      }, [])
    }

    result.pipeElements.forEach(function (pipeElement) {
      if (typeof pipeElement.on === 'function') {
        pipeElement.on('nmea0183', nmea0183Listener)
      }
    })

    for (var i = result.pipeElements.length - 2; i >= 0; i--) {
      result.pipeElements[i].pipe(result.pipeElements[i + 1])
    }

    result.pipeElements[result.pipeElements.length - 1].pipe(devnull)
    result.pipeElements[result.pipeElements.length - 1].on('data', msg => {
      app.handleMessage(providerConfig.id, msg)
    })
    app.emit('pipedProvidersStarted', providerConfig)
    return result
  }

  function createPipeElement (elementConfig) {
    var options = elementConfig.options || {}
    options.app = app

    if (elementConfig.optionMappings) {
      elementConfig.optionMappings.forEach(function (mapping) {
        if (deep(app, mapping.fromAppProperty)) {
          options[mapping.toOption] = deep(app, mapping.fromAppProperty)
        }
      })
    }
    try {
      return new (require(elementConfig.type))(options)
    } catch (e) {
      return new (require(__dirname + '/../' + elementConfig.type))(options)
    }
  }

  function startProviders () {
    var nmea0183Listener = function (sentence) {
      app.signalk.emit('nmea0183', sentence)
    }
    if (app.config.settings.pipedProviders) {
      piped = app.config.settings.pipedProviders.reduce((result, config) => {
        if (typeof config.enabled === 'undefined' || config.enabled) {
          result.push(createPipedProvider(config, nmea0183Listener))
        }
        return result
      }, [])

      return piped.filter(function (n) {
        return n != null
      })
    } else {
      console.error('No pipedProviders in the settings file')
      return []
    }
  }

  return (api = {
    start: startProviders
  })
}
