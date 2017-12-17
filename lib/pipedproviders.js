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
const config = require('./config/config')

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

    result.pipeElements[result.pipeElements.length - 1].pipe(new DevNull())
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

  function restartProviders () {
    app.providers.forEach(function (providerHolder) {
      providerHolder.pipeElements[0].end()
    })
    app.providers = startProviders()
  }

  app.get('/providers', (req, res, next) => {
    var providers = app.config.settings.pipedProviders.map(provider => {
      var p = { id: provider.id }
      var type = provider.pipeElements[0].type
      if (
        type == 'providers/execute' &&
        provider.pipeElements[0].options.command.indexOf('actisense-serial') !=
          -1
      ) {
        p.type = 'Actisense NTG-1'
        p.source = provider.pipeElements[0].options.command
      } else if (
        type == 'providers/serialport' &&
        provider.pipeElements.find(
          element => element.type == 'providers/nmea0183-signalk'
        )
      ) {
        p.type = 'NMEA 0183 Serial'
        p.source = provider.pipeElements[0].options.device
        p.baudrate = provider.pipeElements[0].options.baudrate
      } else if (
        type == 'providers/tcp' &&
        provider.pipeElements.find(
          element => element.type == 'providers/nmea0183-signalk'
        )
      ) {
        p.type = 'NMEA 0183 Network'
        p.source =
          provider.pipeElements[0].options.host +
          ':' +
          provider.pipeElements[0].options.port
      } else if (type == 'providers/filestream') {
        p.type = 'File Stream'
        p.source = provider.pipeElements[0].options.filename
      } else if (type == 'providers/execute') {
        p.type = 'Execute'
        p.source = provider.pipeElements[0].options.command
      } else {
        p.type = 'Unknown'
      }
      p.enabled = _.isUndefined(provider.enabled) ? true : provider.enabled
      var logging = provider.pipeElements.find(
        element => element.type == 'providers/log'
      )
      p.logging = _.isUndefined(logging)
        ? false
        : _.isUndefined(logging.enabled) ? true : logging.enabled
      p.json = JSON.stringify(provider, null, 2)
      return p
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
    console.log(`provider: ${JSON.stringify(provider)}`)
    if (provider.json) {
      var idx = app.config.settings.pipedProviders.findIndex(
        provider => provider.id == req.params.id
      )
      try {
        app.config.settings.pipedProviders[idx] = JSON.parse(provider.json)
      } catch (e) {
        console.log(e)
        res.status(500).send('Unable to parse json input string')
        return
      }
    } else {
      if (!applyProviderSettings(existing, provider, res)) {
        return
      }
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
    var template = providerTemalates[provider.type]
    if (!template) {
      res.status(500).send(`Unknown provider type: ${provider.type}`)
      return
    }
    var newProvider = JSON.parse(JSON.stringify(template))
    newProvider.id = req.params.id
    applyProviderSettings(newProvider, provider)
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
        /*
        try {
          restartProviders()
        } catch (err) {
          console.log(err)
          res.status(500).send('Unable to restart providers')
          return
        }
        */
        res.send('Provider deleted')
      }
    })
  })

  return (api = {
    start: startProviders
  })
}

function applyProviderSettings (existing, provider, res) {
  if (provider.type == 'Unknown') {
    res.status(401).send(`Can't update an Unknown type`)
    return false
  } else if (provider.type == 'Actisense NTG-1') {
    existing.pipeElements[0].options.command = provider.source
  } else if (provider.type == 'NMEA 0183 Serial') {
    existing.pipeElements[0].options.device = provider.source
    existing.pipeElements[0].options.baudrate = Number(provider.baudrate)
  } else if (provider.type == 'NMEA 0183 Network') {
    var parts = provider.source.split(':')
    existing.pipeElements[0].options.host = parts[0]
    existing.pipeElements[0].options.port = Number(parts[1])
  } else if (provider.type == 'File Stream') {
    existing.pipeElements[0].options.filename = provider.source
  } else if (provider.type == 'Execute') {
    existing.pipeElements[0].options.command = provider.source
  }

  existing.enabled = provider.enabled

  if (provider.type !== 'File Stream') {
    var logging = existing.pipeElements.find(
      element => element.type == 'providers/log'
    )
    if (logging) {
      logging.enabled = provider.logging
    } else {
      var config = {
        type: 'providers/log',
        enabled: false,
        options: {
          discriminator: discriminatorByType[provider.type]
        }
      }
      var idx = existing.pipeElements.findIndex(
        element => element.type == 'providers/liner'
      )
      idx = idx == -1 ? 1 : idx + 1
      existing.pipeElements.splice(idx, 0, config)
    }
  }
  return true
}

const discriminatorByType = {
  'Actisense NTG-1': 'A',
  'NMEA 0183 Serial': 'N',
  'NMEA 0183 Network': 'N',
  Execute: 'I'
}

const providerTemalates = {
  'Actisense NTG-1': {
    pipeElements: [
      {
        type: 'providers/execute',
        options: {
          command: 'actisense-serial /dev/actisense',
          toChildProcess: 'nmea2000out'
        }
      },
      {
        type: 'providers/liner'
      },
      {
        type: 'providers/log',
        enabled: false,
        options: {
          discriminator: 'A'
        }
      },
      {
        type: 'providers/n2kAnalyzer'
      },
      {
        type: 'providers/n2k-signalk'
      }
    ]
  },
  'NMEA 0183 Serial': {
    pipeElements: [
      {
        type: 'providers/serialport',
        options: {
          device: '/dev/ttyUSB2',
          baudrate: 4800
        }
      },
      {
        type: 'providers/log',
        enabled: false,
        options: {
          discriminator: 'N'
        }
      },
      {
        type: 'providers/nmea0183-signalk',
        optionMappings: [
          {
            fromAppProperty: 'selfId',
            toOption: 'selfId'
          },
          {
            fromAppProperty: 'selfType',
            toOption: 'selfType'
          }
        ]
      }
    ]
  },
  'NMEA 0183 Network': {
    pipeElements: [
      {
        type: 'providers/tcp',
        options: {
          host: 'localhost',
          port: 10110
        }
      },
      {
        type: 'providers/liner'
      },
      {
        type: 'providers/log',
        enabled: false,
        options: {
          discriminator: 'N'
        }
      },
      {
        type: 'providers/nmea0183-signalk',
        optionMappings: [
          {
            fromAppProperty: 'selfId',
            toOption: 'selfId'
          },
          {
            fromAppProperty: 'selfType',
            toOption: 'selfType'
          }
        ]
      }
    ]
  },
  'File Stream': {
    pipeElements: [
      {
        type: 'providers/filestream',
        options: {
          filename: ''
        },
        optionMappings: [
          {
            fromAppProperty: 'argv.filename',
            toOption: 'filename'
          }
        ]
      },
      {
        type: 'providers/liner'
      },
      {
        type: 'providers/multiplexedlog',
        optionMappings: [
          {
            fromAppProperty: 'selfId',
            toOption: 'selfId'
          },
          {
            fromAppProperty: 'selfType',
            toOption: 'selfType'
          }
        ]
      }
    ]
  },
  Execute: {
    pipeElements: [
      {
        type: 'providers/execute',
        options: {
          command: ''
        }
      },
      {
        type: 'providers/liner'
      },
      {
        type: 'providers/log',
        enabled: false,
        options: {
          discriminator: 'I'
        }
      },
      {
        type: 'providers/from_json'
      }
    ]
  }
}
