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
    const providers = app.config.settings.pipedProviders.map(provider => {
      const type = provider.pipeElements[0].type
      let providerRes
      if (type == 'providers/simple' && provider.pipeElements.length == 1) {
        providerRes = JSON.parse(
          JSON.stringify(provider.pipeElements[0].options)
        )
        providerRes.id = provider.id
        providerRes.enabled = provider.enabled
        providerRes.options = providerRes.subOptions
        providerRes.editable = true
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
      return providerRes
    })
    res.json(providers)
  })

  app.put('/providers/:id', (req, res, next) => {
    updateProvider(req.params.id, req.body, res)
  })

  app.post('/providers', (req, res, next) => {
    updateProvider(null, req.body, res)
  })

  app.delete('/providers/:id', (req, res, next) => {
    const idx = app.config.settings.pipedProviders.findIndex(
      p => p.id == req.params.id
    )
    if (idx == -1) {
      res.status(401).send(`Provider with name ${req.params.id} not found`)
      return
    }
    app.config.settings.pipedProviders.splice(idx, 1)

    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        console.error(err)
        res.status(500).send('Unable to save to settings file')
      } else {
        try {
          restartProviders()
        } catch (err) {
          console.error(err)
          res.status(500).send('Unable to restart providers')
          return
        }
        res.send('Provider deleted')
      }
    })
  })

  function updateProvider (idToUpdate, provider, res) {
    const isNew = _.isUndefined(idToUpdate) || idToUpdate === null
    const existing = app.config.settings.pipedProviders.find(
      p => p.id == (isNew ? provider.id : idToUpdate)
    )

    if (isNew && existing) {
      res.status(401).send(`Provider with ID '${provider.id}' already exists`)
      return
    } else if (!isNew && idToUpdate != provider.id) {
      if (app.config.settings.pipedProviders.find(p => p.id == provider.id)) {
        res.status(401).send(`Provider with ID '${provider.id}' already exists`)
        return
      }
    }

    if (!provider.id || provider.id.length === 0) {
      res.status(401).send('Please enter a provider ID')
      return
    }

    const updatedProvider = existing || {
      pipeElements: [
        {
          type: 'providers/simple',
          options: {}
        }
      ]
    }

    if (applyProviderSettings(updatedProvider, provider, res)) {
      if (isNew) {
        app.config.settings.pipedProviders.push(updatedProvider)
      }

      config.writeSettingsFile(app, app.config.settings, err => {
        if (err) {
          console.error(err)
          res.status(500).send('Unable to save to settings file')
        } else {
          try {
            restartProviders()
          } catch (err) {
            console.error(err)
            res.status(500).send('Unable to restart providers')
            return
          }
          res.send('Provider ' + (isNew ? 'added' : 'updated'))
        }
      })
    }
  }
}

function applyProviderSettings (target, source, res) {
  if (source.type == 'Unknown') {
    res.status(401).send("Can't update an Unknown type")
    return false
  }

  const options = target.pipeElements[0].options

  target.id = source.id
  target.enabled = source.enabled
  options.logging = source.logging
  options.type = source.type

  if (!options.subOptions || options.subOptions.type != source.options.type) {
    options.subOptions = {}
  }

  _.assign(options.subOptions, source.options)

  return true
}

function restartProviders () {}
