/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
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
const _ = require('lodash')
const config = require('../config/config')

module.exports = function (app) {
  app.get('/providers', (req, res, next) => {
    var providers = app.config.settings.pipedProviders.map(provider => {
      var type = provider.pipeElements[0].type
      var providerRes
      if (
        type == 'providers/simple' &&
          provider.pipeElements.length == 1 
      ) {
        providerRes = JSON.parse(JSON.stringify(provider.pipeElements[0].options));
        providerRes.id = provider.id;
        providerRes.enabled = provider.enabled;
        providerRes.options = providerRes.subOptions;
        providerRes.editable = true;
        delete providerRes.subOptions
      } else {
        providerRes = {
          id: provider.id,
          enabled: provider.enabled,
          json: JSON.stringify(provider, null, 2),
          type: `${type}`,
          editable: false
        }
      }
      return providerRes;
    })
    res.json(providers)
  })

  app.put('/providers/:id', (req, res, next) => {
    var existing = app.config.settings.pipedProviders.find(
      provider => provider.id == req.params.id
    )
    if (!existing) {
      res.status(401).send(`Can't find provider with id ${req.params.id}`)
      return
    }
    var provider = req.body

    if (
      !app.securityStrategy &&
      (provider.type == 'Execute' || provider.json)
    ) {
      res.status(401).send('Access Denied')
      return
    }

    if (!applyProviderSettings(existing, provider, res)) {
      return
    }
    
    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        try {
          restartProviders()
        } catch (err) {
          console.log(err)
          res.status(500).send('Unable to restart providers')
          return
        }
        res.send('Provider updated')
      }
    })
  })

  app.post('/providers/:id', (req, res, next) => {
    var existing = app.config.settings.pipedProviders.find(
      provider => provider.id == req.params.id
    )

    if (existing) {
      res.status(401).send(`Provider with Name ${req.params.id} already exists`)
      return
    }

    var provider = req.body
    var newProvider = {
      id: req.params.id,
      pipeElements: [
        {
          type: 'providers/simple',
          options: {}
        }
      ]
    };

    if ( applyProviderSettings(newProvider, provider, res) ) {
      app.config.settings.pipedProviders.push(newProvider)
      
      config.writeSettingsFile(app, app.config.settings, err => {
        if (err) {
          res.status(500).send('Unable to save to settings file')
        } else {
          try {
            restartProviders()
          } catch (err) {
            console.log(err)
            res.status(500).send('Unable to restart providers')
            return
          }
          res.send('Provider added')
        }
      })
    }
  })

  app.delete('/providers/:id', (req, res, next) => {
    var idx = app.config.settings.pipedProviders.findIndex(
      p => p.id == req.params.id
    )
    if (idx == -1) {
      res.status(401).send(`Provider with name ${req.params.id} not found`)
      return
    }
    app.config.settings.pipedProviders.splice(idx, 1)

    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        try {
          restartProviders()
        } catch (err) {
          console.log(err)
          res.status(500).send('Unable to restart providers')
          return
        }
        res.send('Provider deleted')
      }
    })
  })
}


function applyProviderSettings (existing, provider, res) {
  if (provider.type == 'Unknown') {
    res.status(401).send(`Can't update an Unknown type`)
    return false
  }

  var options = existing.pipeElements[0].options

  existing.id = provider.id
  existing.enabled = provider.enabled;
  options.logging = provider.logging;
  options.type =  provider.type;

  if ( !options.subOptions || options.subOptions.type != provider.options.type )
    options.subOptions = {}
  
  _.assign(options.subOptions, provider.options)

  return true
}

function restartProviders()
{
}
