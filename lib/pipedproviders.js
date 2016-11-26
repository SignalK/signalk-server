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

var deep = require('deep-get-set');

module.exports = function(app) {
  function createPipedProvider(providerConfig, nmea0183Listener) {
    var result = {
      id: providerConfig.id,
      pipeElements: providerConfig.pipeElements.map(createPipeElement)
    };

    result.pipeElements.forEach(function(pipeElement) {
      if (typeof pipeElement.on === 'function') {
        pipeElement.on('nmea0183', nmea0183Listener);
      }
    });

    for (var i = result.pipeElements.length - 2; i >= 0; i--) {
      result.pipeElements[i].pipe(result.pipeElements[i + 1]);
    }

    result.pipeElements[result.pipeElements.length - 1].on('data', function(data) {
      if (data.updates) {
        if (typeof data.context === 'undefined') {
          data.context = 'vessels.' + app.selfId;
        }
        data.updates.forEach(function(update) {
          update.source.label = providerConfig.id;
          if (!update.timestamp) {
            update.timestamp = (new Date()).toISOString();
          }
        })
        app.signalk.addDelta(data);
      }
    });
    app.emit("pipedProvidersStarted", providerConfig)
    return result;
  }

  function createPipeElement(elementConfig) {
    var options = elementConfig.options || {};
    options.app = app;
    if (elementConfig.optionMappings) {
      elementConfig.optionMappings.forEach(function(mapping) {
        if (deep(app, mapping.fromAppProperty)) {
          options[mapping.toOption] = deep(app, mapping.fromAppProperty);
        }
      });
    }
    try {
      return new(require(elementConfig.type))(options);
    } catch (e) {
      return new(require(__dirname + '/../' + elementConfig.type))(options);
    }
  }

  function startProviders() {
    var nmea0183Listener = function(sentence) {
      app.signalk.emit('nmea0183', sentence);
    }
    if (app.config.settings.pipedProviders) {
      return app.config.settings.pipedProviders.map(function(providerConfig) {
        return createPipedProvider(providerConfig, nmea0183Listener);
      });

    } else {
      console.error("No pipedProviders in the settings file");
      return [];
    }
  }

  return api = {
    start: startProviders
  }
};
