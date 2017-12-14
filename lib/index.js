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
  path = require('path'),
  http = require('http'),
  https = require('https'),
  pem = require('pem'),
  fs = require('fs'),
  FullSignalK = require('@signalk/signalk-schema').FullSignalK,
  StreamBundle = require('./streambundle'),
  SubscriptionManager = require('./subscriptionmanager'),
  Mode = require('stat-mode'),
  page = require('./page'),
  ports = require('./ports'),
  getPrimaryPort = ports.getPrimaryPort,
  getSecondaryPort = ports.getSecondaryPort,
  getExternalPort = ports.getExternalPort

function Server(opts) {
  const app = express()
  app.use(require('cors')())
  app.use(require('body-parser').json())

  this.app = app
  app.started = false
  _.merge(app, opts)

  require('./config/config')(app)
  app.version = '0.0.1'

  if (app.config.settings.security && app.config.settings.security.strategy) {
    if (app.config.settings.security.strategy === 'sk-simple-token-security') {
      console.log(
        'The sk-simple-token-security security strategy is depricated, please update to @signalk/sk-simple-token-security'
      )
      process.exit(1)
    }

    var config = getSecurityConfig(app)
    app.securityStrategy = require(app.config.settings.security.strategy)(
      app,
      config,
      saveSecurityConfig
    )
  }

  require('./serverroutes')(app, saveSecurityConfig, getSecurityConfig)

  if (app.config.settings.vessel) {
    if (!app.config.defaults) {
      app.config.defaults = { vessels: { self: {} } }
    }
    var vessel = app.config.settings.vessel
    if (vessel.name) {
      app.config.defaults.vessels.self.name = vessel.name
    }
  }

  app.signalk = new FullSignalK(app.selfId, app.selfType, app.config.defaults)

  app.handleMessage = function(providerId, data) {
    if (data && data.updates) {
      app.deltaCount++
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
}

module.exports = Server

Server.prototype.start = function() {
  var self = this
  var app = this.app

  this.app.intervals = []

  this.app.intervals.push(
    setInterval(app.signalk.pruneContexts.bind(app.signalk, 60 * 60), 60 * 1000)
  )

  this.app.providers = []

  app.lastServerEvents = {}
  app.on('serverevent', event => {
    if (event.type) {
      app.lastServerEvents[event.type] = event
    }
  })

  app.deltaCount = 0
  let lastIntervalDeltaCount = 0
  app.intervals.push(
    setInterval(() => {
      app.emit('serverevent', {
        type: 'SERVERSTATISTICS',
        from: 'signalk-server',
        data: {
          deltaRate: (app.deltaCount - lastIntervalDeltaCount) / 5
        }
      })
      lastIntervalDeltaCount = app.deltaCount
    }, 5 * 1000)
  )

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

function hasStrictPermissions(stat) {
  if (process.platform == 'win32') {
    return new Mode(stat).toString() === '-r--r--r--'
  } else {
    return new Mode(stat).toString() === '-r--------'
  }
}

function getCertificateOptions(app, cb) {
  var certLocation

  if (!app.config.configPath || fs.existsSync('./settings/ssl-cert.pem')) {
    certLocation = './settings'
  } else {
    certLocation = app.config.configPath
  }

  var certFile = path.join(certLocation, 'ssl-cert.pem')
  var keyFile = path.join(certLocation, 'ssl-key.pem')
  var chainFile = path.join(certLocation, 'ssl-chain.pem')

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    if (!hasStrictPermissions(fs.statSync(keyFile))) {
      cb(
        new Error(
          `${keyFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    if (!hasStrictPermissions(fs.statSync(certFile))) {
      cb(
        new Error(
          `${certFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    let ca = undefined
    if (fs.existsSync(chainFile)) {
      debug('Found ssl-chain.pem')
      ca = getCAChainArray(chainFile)
      debug(JSON.stringify(ca, null, 2))
    }
    debug(`Using certificate ssl-key.pem and ssl-cert.pem in ${certLocation}`)
    cb(null, {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
      ca
    })
    return
  } else {
    createCertificateOptions(app, certFile, keyFile, cb)
  }
}

function getCAChainArray(filename) {
  let chainCert = []
  return fs
    .readFileSync(filename, 'utf8')
    .split('\n')
    .reduce((ca, line) => {
      chainCert.push(line)
      if (line.match(/-END CERTIFICATE-/)) {
        ca.push(chainCert.join('\n'))
        chainCert = []
      }
      return ca
    }, [])
}

function createCertificateOptions(app, certFile, keyFile, cb) {
  var location = app.config.configPath ? app.config.configPath : './settings'
  debug(`Creating certificate files in ${location}`)
  pem.createCertificate(
    {
      days: 360,
      selfSigned: true
    },
    function(err, keys) {
      if (err) {
        console.error('Could not create SSL certificate:' + err.message)
        throw err
      } else {
        fs.writeFileSync(keyFile, keys.serviceKey)
        fs.chmodSync(keyFile, '400')
        fs.writeFileSync(certFile, keys.certificate)
        fs.chmodSync(certFile, '400')
        cb(null, {
          key: keys.serviceKey,
          cert: keys.certificate
        })
      }
    }
  )
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
    return null
  }
}
