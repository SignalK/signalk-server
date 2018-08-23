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
'use strict'

const path = require('path')
const express = require('express')
const debug = require('debug')('signalk-server:config')
const _ = require('lodash')
const fs = require('fs')
const uuidv4 = require('uuid/v4')

function load (app) {
  app.__argv = process.argv.slice(2)
  app.argv = require('minimist')(app.__argv)

  const config = (app.config = app.config || {})
  const env = (app.env = process.env)

  config.getExternalHostname = getExternalHostname.bind(config, config)
  config.getExternalPort = getExternalPort.bind(config, config)

  try {
    const pkg = require('../../package.json')
    config.name = pkg.name
    config.author = pkg.author
    config.version = pkg.version
  } catch (err) {
    console.error('error parsing package.json', err)
  }

  config.appPath = config.appPath || path.normalize(__dirname + '/../../')
  debug('appPath:' + config.appPath)
  setConfigDirectory(app)
  createConfigFiles(app)
  readSettingsFile(app)
  setFullDefaults(app)
  setSelfSettings(app)

  if (app.argv['sample-nmea0183-data']) {
    var sample = path.join(app.config.appPath, 'samples/plaka.log')
    console.log(`Using sample data from ${sample}`)
    app.config.settings.pipedProviders.push({
      id: 'nmea0183-sample-data',
      pipeElements: [
        {
          type: 'providers/simple',
          options: {
            logging: false,
            type: 'FileStream',
            subOptions: {
              dataType: 'NMEA0183',
              filename: sample
            }
          }
        }
      ],
      enabled: true
    })
  }

  if (app.argv['sample-n2k-data']) {
    var sample = path.join(app.config.appPath, 'samples/aava-n2k.data')
    console.log(`Using sample data from ${sample}`)
    app.config.settings.pipedProviders.push({
      id: 'n2k-sample-data',
      pipeElements: [
        {
          type: 'providers/simple',
          options: {
            logging: false,
            type: 'FileStream',
            subOptions: {
              dataType: 'NMEA2000JS',
              filename: sample
            }
          }
        }
      ],
      enabled: true
    })
  }

  if (env.SSLPORT) {
    config.settings.ssl = true
  }

  require('./development')(app)
  require('./production')(app)
}

function createConfigFiles (app) {
  if (app.config.configPath !== app.config.appPath) {
    // Create config directory if not found.
    if (!fs.existsSync(app.config.configPath)) {
      fs.mkdirSync(app.config.configPath)
      console.log(`Created config directory: ${app.config.configPath}`)
    }
    var configPackage = path.join(app.config.configPath, 'package.json')
    if (!fs.existsSync(configPackage)) {
      fs.writeFileSync(
        configPackage,
        JSON.stringify(pluginsPackageJsonTemplate, null, 2)
      )
    }
    let npmrcPath = path.join(app.config.configPath, '.npmrc')
    if (!fs.existsSync(npmrcPath)) {
      fs.writeFileSync(npmrcPath, 'package-lock=false\n')
    } else {
      let contents = fs.readFileSync(npmrcPath)
      if (contents.indexOf('package-lock=') == -1) {
        fs.appendFileSync(npmrcPath, '\npackage-lock=false\n')
      }
    }
  }
}

function setConfigDirectory (app) {
  const paths = _.at(app, [
    'env.SIGNALK_NODE_CONFIG_DIR',
    'env.SIGNALK_NODE_CONDFIG_DIR',
    'config.configPath',
    'argv.c',
    'env.HOME',
    'config.appPath'
  ])
  // Default to user home directory before using appPath as last resort.
  paths[4] = paths[4] && path.join(paths[4], '.signalk')
  app.config.configPath = path.resolve(_.find(paths))
  debug('configPath: ' + app.config.configPath)
}

function getDefaultsPath (app) {
  const defaultsFile =
    app.config.configPath != app.config.appPath
      ? 'defaults.json'
      : 'settings/defaults.json'
  return path.join(app.config.configPath, defaultsFile)
}

function readDefaultsFile (app) {
  const defaultsPath = getDefaultsPath(app)
  // return require(defaultsPath)
  var data = fs.readFileSync(defaultsPath)
  return JSON.parse(data)
}

function setFullDefaults (app) {
  if (!app.config.settings.loadFiles) return
  const defaultsPath = getDefaultsPath(app)
  app.config.settings.defaultsPath = defaultsPath
  try {
    app.config.defaults = readDefaultsFile(app)
    debug(`Found defaults at ${defaultsPath.toString()}`)
  } catch (e) {
    if (e.code && e.code === 'ENOENT') {
      debug(`No defaults found at ${defaultsPath.toString()}`)
    } else {
      console.log(e)
    }
    app.config.defaults = { vessels: { self: {} } }
  }
}

function writeDefaultsFile (app, defaults, cb) {
  fs.writeFile(getDefaultsPath(app), JSON.stringify(defaults, null, 2), cb)
}

function setSelfSettings (app) {
  var name = _.get(app.config.defaults, 'vessels.self.name')
  var mmsi = _.get(app.config.defaults, 'vessels.self.mmsi')
  var uuid = _.get(app.config.defaults, 'vessels.self.uuid')

  if (app.config.settings.vessel) {
    // backwards compatibility for settings files with 'vessel'
    if (!mmsi && !uuid) {
      mmsi = app.config.settings.vessel.mmsi
      uuid = app.config.settings.vessel.uuid
      if (mmsi) {
        app.config.defaults.vessels.self.mmsi = mmsi
      }
      if (uuid) {
        app.config.defaults.vessels.self.uuid = uuid
      }
    }
    if (!name) {
      name = app.config.settings.vessel.name
      app.config.defaults.vessels.self.name = name
    }
  }

  if (mmsi && !_.isString(mmsi)) {
    throw new Error(`invalid mmsi: ${mmsi}`)
  }

  if (uuid && !_.isString(uuid)) {
    throw new Error(`invalid uuid: ${uuid}`)
  }

  if (_.isUndefined(mmsi) && _.isUndefined(uuid)) {
    uuid = 'urn:mrn:signalk:uuid:' + uuidv4()
    _.set(app.config.defaults, 'vessels.self.uuid', uuid)
    writeDefaultsFile(app, app.config.defaults, err => {
      if (err) {
        console.error(`unable to write defaults file: ${err}`)
      }
    })
  }

  if (mmsi) {
    app.selfType = 'mmsi'
    app.selfId = 'urn:mrn:imo:mmsi:' + mmsi
  } else if (uuid) {
    app.selfType = 'uuid'
    app.selfId = uuid
  }
  if (app.selfType) {
    debug(app.selfType.toUpperCase() + ': ' + app.selfId)
  }
  app.selfContext = 'vessels.' + app.selfId
}

function readSettingsFile (app) {
  if (!_.isObject(app.config.settings)) { app.config.settings = { loadFiles: true } }
  const defaultSettings = {
    interfaces: {},
    pipedProviders: [],
    filename: 'settings.json',
    loadFiles: false
  }
  _.defaults(app.config.settings, defaultSettings)
  const settingsFile = getSettingsFilename(app)
  _.set(app.config.settings, 'filepath', settingsFile)
  if (!app.config.settings.loadFiles) {
    debug(
      'Settings set in constructor call. Set `config.settings.loadFiles: true` to merge files.'
    )
    return
  }
  if (!fs.existsSync(settingsFile)) {
    debug('Settings file does not exist.')
  } else {
    debug('Adding settings defaults: ' + settingsFile)
    app.config.settings = _.merge(require(settingsFile), app.config.settings)
  }
}

function writeSettingsFile (app, settings, cb) {
  const settingsPath = getSettingsFilename(app)
  fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), cb)
}

function getSettingsFilename (app) {
  if (app.env.SIGNALK_NODE_SETTINGS) {
    debug(
      'Settings filename was set in environment SIGNALK_NODE_SETTINGS, overriding all other options'
    )
    return path.resolve(app.env.SIGNALK_NODE_SETTINGS)
  }
  const settingsFile = app.argv.s || app.config.settings.filename
  return path.join(app.config.configPath, settingsFile)
}

function getExternalHostname (config) {
  if (process.env.EXTERNALHOST) {
    return process.env.EXTERNALHOST
  }
  if (config.settings.proxy_host) {
    return config.settings.proxy_host
  } else if (config.settings.hostname) {
    return config.settings.hostname
  }
  try {
    return require('os').hostname()
  } catch (ex) {
    return 'hostname_not_available'
  }
}

function getExternalPort (config) {
  if (process.env.EXTERNALPORT) {
    return process.env.EXTERNALPORT
  }
  if (config.settings.proxy_port) {
    return config.settings.proxy_port
  } else if (config.port) {
    return config.port
  }
  return ''
}

const pluginsPackageJsonTemplate = {
  name: 'signalk-server-config',
  version: '0.0.1',
  description: 'This file is here to track your plugin and webapp installs.',
  repository: {},
  license: 'Apache-2.0'
}

module.exports = {
  setConfigDirectory: setConfigDirectory,
  load: load,
  writeSettingsFile: writeSettingsFile,
  writeDefaultsFile: writeDefaultsFile,
  readSettingsFile: readSettingsFile,
  readDefaultsFile: readDefaultsFile
}
