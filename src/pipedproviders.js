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
const DevNull = require('dev-null-stream')
const _ = require('lodash')

module.exports = function(app) {
  function createPipedProvider(providerConfig) {
    const result = {
      id: providerConfig.id,
      pipeElements: providerConfig.pipeElements.reduce((res, config) => {
        if (typeof config.enabled === 'undefined' || config.enabled) {
          res.push(createPipeElement(providerConfig.id, config))
        }
        return res
      }, [])
    }

    for (let i = result.pipeElements.length - 2; i >= 0; i--) {
      result.pipeElements[i].pipe(result.pipeElements[i + 1])
    }

    result.pipeElements[result.pipeElements.length - 1].pipe(new DevNull())
    result.pipeElements[result.pipeElements.length - 1].on('data', msg => {
      app.handleMessage(providerConfig.id, msg)
    })
    app.emit('pipedProvidersStarted', providerConfig)
    return result
  }

  function createPipeElement(providerId, elementConfig) {
    const options = elementConfig.options || {}
    options.app = app
    options.providerId = providerId

    if (elementConfig.optionMappings) {
      elementConfig.optionMappings.forEach(function(mapping) {
        if (deep(app, mapping.fromAppProperty)) {
          options[mapping.toOption] = deep(app, mapping.fromAppProperty)
        }
      })
    }
    const efectiveElementType = elementConfig.type.startsWith('providers/')
      ? elementConfig.type.replace('providers/', '@signalk/streams/')
      : elementConfig.type
    try {
      return new (require(efectiveElementType))(options)
    } catch (e) {
      console.log(e)
      try {
        return new (require(__dirname + '/../' + elementConfig.type))(options)
      } catch (e) {
        console.log(e)
      }
    }
  }

  function startProviders() {
    if (app.config.settings.pipedProviders) {
      const piped = app.config.settings.pipedProviders.reduce(
        (result, config) => {
          try {
            if (typeof config.enabled === 'undefined' || config.enabled) {
              result.push(createPipedProvider(config))
            }
          } catch (e) {
            app.setProviderError(config.id, e.message)
            console.error(e.message)
          }
          return result
        },
        []
      )

      return piped.filter(function(n) {
        return n != null
      })
    } else {
      console.error('No pipedProviders in the settings file')
      return []
    }
  }

  return {
    start: startProviders,
    createPipedProvider: createPipedProvider
  }
}
