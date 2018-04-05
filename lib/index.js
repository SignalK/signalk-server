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

if (typeof [].includes != 'function') {
  console.log('Minimum required Node.js version is 6, please update.')
  process.exit(-1)
}

const express = require('express'),
  _ = require('lodash'),
  debug = require('debug')('signalk-server'),
  DeltaCache = require('./deltacache'),
  path = require('path'),
  http = require('http'),
  https = require('https'),
  fs = require('fs'),
  FullSignalK = require('@signalk/signalk-schema').FullSignalK,
  { StreamBundle } = require('./streambundle'),
  SubscriptionManager = require('./subscriptionmanager'),
  Mode = require('stat-mode'),
  page = require('./page'),
  ports = require('./ports'),
  getPrimaryPort = ports.getPrimaryPort,
  getSecondaryPort = ports.getSecondaryPort,
  getExternalPort = ports.getExternalPort,
  { startSecurity, getCertificateOptions } = require('./security.js'),
  { startDeltaStatistics, incDeltaStatistics } = require('./deltastats')

function Server(opts) {
  const app = express()
  app.use(require('cors')())
  app.use(require('body-parser').json())

  this.app = app
  app.started = false
  _.merge(app, opts)

  require('./config/config').load(app)
  app.version = '0.0.1'

  startSecurity(app, opts ? opts.securityConfig : null)

  require('./serverroutes')(app, saveSecurityConfig, getSecurityConfig)
  require('./put').start(app)

  app.signalk = new FullSignalK(app.selfId, app.selfType, app.config.defaults)

  app.handleMessage = function(providerId, data) {
    if (data && data.updates) {
      incDeltaStatistics(app, providerId)

      if (
        typeof data.context === 'undefined' ||
        data.context === 'vessels.self'
      ) {
        data.context = 'vessels.' + app.selfId
      }
      data.updates.forEach(function(update) {
        if (typeof update.source != 'undefined') {
          update.source.label = providerId
        } else {
          if (typeof update['$source'] === 'undefined') {
            update['$source'] = providerId
          }
        }
        if (!update.timestamp) {
          update.timestamp = new Date().toISOString()
        }
      })
      app.signalk.addDelta(data)
    }
  }

  app.webapps = []

  app.streambundle = new StreamBundle(app.selfId)
  app.signalk.on('delta', app.streambundle.pushDelta.bind(app.streambundle))
  app.subscriptionmanager = new SubscriptionManager(app)
  app.deltaCache = new DeltaCache(app, app.streambundle)
}

module.exports = Server

Server.prototype.start = function() {
  var self = this
  var app = this.app

  this.app.intervals = []

  this.app.intervals.push(
    setInterval(app.signalk.pruneContexts.bind(app.signalk, 60 * 60), 60 * 1000)
  )
  this.app.intervals.push(
    setInterval(
      app.deltaCache.pruneContexts.bind(app.deltaCache, 60 * 60),
      60 * 1000
    )
  )

  this.app.providers = []

  app.lastServerEvents = {}
  app.on('serverevent', event => {
    if (event.type) {
      app.lastServerEvents[event.type] = event
    }
  })

  app.intervals.push(startDeltaStatistics(app))

  return new Promise((resolve, reject) => {
    createServer(app, function(err, server) {
      if (err) {
        reject(err)
        return
      }
      app.server = server
      app.interfaces = {}
      app.connections = {}
      app.clients = 0

      debug('ID type: ' + app.selfType)
      debug('ID: ' + app.selfId)

      startInterfaces(app)
      startMdns(app)
      app.providers = require('./pipedproviders')(app).start()

      const primaryPort = getPrimaryPort(app)
      debug(`primary port:${primaryPort}`)
      server.listen(primaryPort, function() {
        console.log(
          'signalk-server running at 0.0.0.0:' + primaryPort.toString() + '\n'
        )
        app.started = true
        resolve(self)
      })
      const secondaryPort = getSecondaryPort(app)
      debug(`secondary port:${primaryPort}`)
      if (app.config.settings.ssl && secondaryPort) {
        startRedirectToSsl(
          secondaryPort,
          getExternalPort(app),
          (err, server) => {
            if (!err) {
              app.redirectServer = server
            }
          }
        )
      }
    })
  })
}

function createServer(app, cb) {
  if (app.config.settings.ssl) {
    getCertificateOptions(app, function(err, options) {
      if (err) {
        cb(err)
      } else {
        debug('Starting server to serve both http and https')
        cb(null, https.createServer(options, app))
      }
    })
    return
  }
  var server
  try {
    debug('Starting server to serve only http')
    server = http.createServer(app)
  } catch (e) {
    cb(e)
    return
  }
  cb(null, server)
}

function startRedirectToSsl(port, redirectPort, cb) {
  const redirectApp = new express()
  redirectApp.use((req, res) => {
    const hostHeader = req.headers.host || ''
    const host = req.headers.host.split(':')[0]
    res.redirect(`https://${host}:${redirectPort}${req.path}`)
  })
  const server = http.createServer(redirectApp)
  server.listen(port, err => {
    if (err) {
      console.error(err)
      return
    }
    console.log(`Redirect server running on port ${port.toString()}`)
    cb(null, server)
  })
}

function startMdns(app) {
  if (_.isUndefined(app.config.settings.mdns) || app.config.settings.mdns) {
    debug("Starting interface 'mDNS'")
    try {
      app.interfaces['mdns'] = require('./mdns')(app)
    } catch (ex) {
      debug('Could not start mDNS:' + ex)
    }
  } else {
    debug("Interface 'mDNS' was disabled in configuration")
  }
}

function startInterfaces(app) {
  debug('Interfaces config:' + JSON.stringify(app.config.settings.interfaces))
  var availableInterfaces = require('./interfaces')
  _.forIn(availableInterfaces, function(interface, name) {
    if (
      _.isUndefined(app.config.settings.interfaces) ||
      _.isUndefined(app.config.settings.interfaces[name]) ||
      app.config.settings.interfaces[name]
    ) {
      debug("Loading interface '" + name + "'")
      app.interfaces[name] = interface(app)
      if (app.interfaces[name] && _.isFunction(app.interfaces[name].start)) {
        if (
          _.isUndefined(app.interfaces[name].forceInactive) ||
          !app.interfaces[name].forceInactive
        ) {
          debug("Starting interface '" + name + "'")
          app.interfaces[name].data = app.interfaces[name].start()
        } else {
          debug("Not starting interface '" + name + "' by forceInactive")
        }
      }
    } else {
      debug("Not loading interface '" + name + "' because of configuration")
    }
  })
}

Server.prototype.reload = function(mixed) {
  var settings,
    self = this

  if (typeof mixed === 'string') {
    try {
      settings = require(path.join(process.cwd(), mixed))
    } catch (e) {
      debug("Settings file '" + settings + "' doesn't exist.")
    }
  }

  if (mixed !== null && typeof mixed === 'object') {
    settings = mixed
  }

  if (settings) {
    this.app.config.settings = settings
  }

  this.stop()

  setTimeout(function() {
    self.start()
  }, 1000)

  return this
}

Server.prototype.stop = function(cb) {
  if (this.app.started) {
    _.each(this.app.interfaces, function(intf) {
      if (
        intf !== null &&
        typeof intf === 'object' &&
        typeof intf.stop === 'function'
      ) {
        intf.stop()
      }
    })

    debug('Closing server...')

    const that = this
    this.app.server.close(function() {
      debug('Server closed')
      if (that.app.redirectServer) {
        that.app.redirectServer.close(() => {
          debug('Redirect server closed')
          delete that.app.redirectServer
          cb && cb()
        })
      } else {
        cb && cb()
      }
    })

    for (var id in this.app.connections) {
      if (this.app.connections.hasOwnProperty(id)) {
        debug('Closing connection #' + id)
        this.app.connections[id].destroy()
        delete this.app.connections[id]
      }
    }

    this.app.intervals.forEach(interval => {
      clearInterval(interval)
    })
    this.app.started = false
  }

  this.app.providers.forEach(function(providerHolder) {
    providerHolder.pipeElements[0].end()
  })

  return this
}

function pathForSecurityConfig(app) {
  return path.join(app.config.configPath, 'security.json')
}

function saveSecurityConfig(app, data, callback) {
  const config = JSON.parse(JSON.stringify(data))
  const path = pathForSecurityConfig(app)
  fs.writeFile(path, JSON.stringify(data, null, 2), err => {
    if (!err) {
      fs.chmodSync(path, '600')
    }
    if (callback) {
      callback(err)
    }
  })
}

function getSecurityConfig(app) {
  try {
    const optionsAsString = fs.readFileSync(pathForSecurityConfig(app), 'utf8')
    try {
      return JSON.parse(optionsAsString)
    } catch (e) {
      console.error('Could not parse security config')
      return {}
    }
  } catch (e) {
    return {}
  }
}
