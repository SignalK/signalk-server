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

function startProviders(app) {
  if (app.config.settings.pipedProviders) {
    return app.config.settings.pipedProviders.map(function(providerConfig) {
      createPipedProvider(app.signalk, providerConfig);
    });

  } else {
    console.error("No pipedProviders in the settings file");
    return [];
  }
}

function createPipedProvider(multiplexer, pipedProviderConfig) {
  var result = {
    id: pipedProviderConfig.id,
    pipeElements: pipedProviderConfig.pipeElements.map(createPipeElement)
  };

  for (i = 0; i < result.pipeElements.length - 1; i++) {
    result.pipeElements[i].pipe(result.pipeElements[i + 1]);
  }
  result.pipeElements[result.pipeElements.length - 1].on('data', function(data) {
    multiplexer.add(data);
  });

  for (i = result.pipeElements.length - 1; i >= 0; i--) {
    result.pipeElements[i].start();
  }
}

function createPipeElement(elementConfig) {
  try {
    return new(require(elementConfig.type))(elementConfig.options);
  } catch (e) {
    return new(require(__dirname + '/../' + elementConfig.type))(elementConfig.options);
  }
}

module.exports.startProviders = startProviders;