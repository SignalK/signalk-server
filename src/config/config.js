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
const { v4: uuidv4 } = require('uuid')
const semver = require('semver')

let disableWriteSettings = false

function load(app) {
  app.__argv = process.argv.slice(2)
  app.argv = require('minimist')(app.__argv)

  const config = (app.config = app.config || {})
  const env = (app.env = process.env)

  config.getExternalHostname = getExternalHostname.bind(config, config)
  config.getExternalPort = getExternalPort.bind(config, config)

  config.appPath = config.appPath || path.normalize(__dirname + '/../../')
  debug('appPath:' + config.appPath)

  try {
    const pkg = require('../../package.json')
    config.name = pkg.name
    config.author = pkg.author
    config.contributors = pkg.contributors
    config.version = pkg.version
    config.description = pkg.description

    checkPackageVersion('@signalk/server-admin-ui', pkg, app.config.appPath)
  } catch (err) {
    console.error('error parsing package.json', err)
    process.exit(1)
  }

  setConfigDirectory(app)
  app.config.defaultDeltas = []
  if (_.isObject(app.config.settings)) {
    debug('Using settings from constructor call, not reading defaults')
    disableWriteSettings = true
    if (config.defaults) {
      app.config.defaultDeltas = convertOldDefaultsToDeltas(config.defaults)
    }
  } else {
    readSettingsFile(app)
    if (!setDefaultDeltas(app)) {
      let defaults = getFullDefaults(app)
      if (defaults) {
        app.config.defaultDeltas = convertOldDefaultsToDeltas(defaults)
        writeDefaultDeltasFileSync(app, app.config.defaultDeltas)
      }
    }
  }
  setSelfSettings(app)

  if (app.argv['sample-nmea0183-data']) {
    const sample = path.join(app.config.appPath, 'samples/plaka.log')
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
    if (app.argv['override-timestamps']) {
      app.config.overrideTimestampWithNow = true
    }
  }

  if (app.argv['sample-n2k-data']) {
    const sample = path.join(app.config.appPath, 'samples/aava-n2k.data')
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
    if (app.argv['override-timestamps']) {
      app.config.overrideTimestampWithNow = true
    }
  }

  if (app.argv.securityenabled && !app.config.security) {
    app.config.settings.security = { strategy: './tokensecurity' }
  }

  if (env.SSLPORT) {
    config.settings.ssl = true
  }

  if (!_.isUndefined(app.env.WSCOMPRESSION)) {
    config.settings.wsCompression =
      app.env.WSCOMPRESSION.toLowerCase() === 'true'
  }

  if (
    config.settings.landingPage &&
    config.settings.landingPage.charAt(0) !== '/'
  ) {
    console.error(`invalid rootUri: ${config.settings.landingPage}`)
    process.exit(1)
  }

  require('./development')(app)
  require('./production')(app)
}

function checkPackageVersion(name, pkg, appPath) {
  const expected = pkg.dependencies[name]
  let modulePackageJsonPath = path.join(
    appPath,
    'node_modules',
    name,
    'package.json'
  )
  if (!fs.existsSync(modulePackageJsonPath)) {
    modulePackageJsonPath = path.join(appPath, '..', name, 'package.json')
  }
  const installed = require(modulePackageJsonPath)

  if (!semver.satisfies(installed.version, expected)) {
    console.error(
      `invalid version of the ${name} package is installed ${installed.version} !== ${expected}`
    )
    process.exit(1)
  }
}

// Establish what the config directory path is.
function getConfigDirectory({ argv, config, env }) {
  // Possible paths in order of priority.
  const configPaths = [
    env.SIGNALK_NODE_CONDFIG_DIR,
    env.SIGNALK_NODE_CONFIG_DIR,
    config.configPath,
    argv.c,
    argv.s && config.appPath,
    env.HOME && path.join(env.HOME, '.signalk'),
    config.appPath
  ]
  // Find first config directory path that has a truthy value.
  const configPath = path.resolve(_.find(configPaths))
  debug('configDirPath: ' + configPath)
  return configPath
}

// Create directories and set app.config.configPath.
function setConfigDirectory(app) {
  app.config.configPath = getConfigDirectory(app)
  if (app.config.configPath !== app.config.appPath) {
    if (!fs.existsSync(app.config.configPath)) {
      fs.mkdirSync(app.config.configPath)
      debug(`configDir Created: ${app.config.configPath}`)
    }
    const configPackage = path.join(app.config.configPath, 'package.json')
    if (!fs.existsSync(configPackage)) {
      fs.writeFileSync(
        configPackage,
        JSON.stringify(pluginsPackageJsonTemplate, null, 2)
      )
    }
    const npmrcPath = path.join(app.config.configPath, '.npmrc')
    if (!fs.existsSync(npmrcPath)) {
      fs.writeFileSync(npmrcPath, 'package-lock=false\n')
    } else {
      const contents = fs.readFileSync(npmrcPath)
      if (contents.indexOf('package-lock=') === -1) {
        fs.appendFileSync(npmrcPath, '\npackage-lock=false\n')
      }
    }
  }
}

function getDefaultsPath(app) {
  const defaultsFile =
    app.config.configPath !== app.config.appPath
      ? 'defaults.json'
      : 'settings/defaults.json'
  return path.join(app.config.configPath, defaultsFile)
}

function getDefaultDeltasPath(app) {
  const defaultsFile =
    app.config.configPath !== app.config.appPath
      ? 'defaultDeltas.json'
      : 'settings/defaultDeltas.json'
  return path.join(app.config.configPath, defaultsFile)
}

function readDefaultsFile(app) {
  const defaultsPath = getDefaultsPath(app)
  const data = fs.readFileSync(defaultsPath)
  return JSON.parse(data)
}

function readDefaultDeltasFile(app) {
  const defaultsPath = getDefaultDeltasPath(app)
  var data = fs.readFileSync(defaultsPath)
  return JSON.parse(data)
}

function getFullDefaults(app) {
  const defaultsPath = getDefaultsPath(app)
  try {
    let defaults = readDefaultsFile(app)
    debug(`Found defaults at ${defaultsPath.toString()}`)
    return defaults
  } catch (e) {
    if (e.code && e.code === 'ENOENT') {
      return undefined
    } else {
      console.error(`unable to parse ${defaultsPath.toString()}`)
      console.error(e)
      process.exit(1)
    }
  }
  return undefined
}

function setDefaultDeltas(app) {
  const defaultsPath = getDefaultDeltasPath(app)
  try {
    let deltas = readDefaultDeltasFile(app)

    if (!_.isArray(deltas)) {
      console.error(`${defaultsPath} should contain an array of deltas`)
      return
    }

    app.config.defaultDeltas = deltas
    debug(`Found default deltas at ${defaultsPath.toString()}`)
  } catch (e) {
    if (e.code && e.code === 'ENOENT') {
      debug(`No default deltas found at ${defaultsPath.toString()}`)
      return
    } else {
      console.log(e)
    }
  }
  return app.config.defaultDeltas
}

function sendDefaultDeltas(app) {
  let copy = JSON.parse(JSON.stringify(app.config.defaultDeltas))
  copy.forEach(delta => {
    delta.context = app.selfContext
    app.handleMessage('defaults', delta)
  })
}

function writeDefaultsFile(app, defaults, cb) {
  fs.writeFile(getDefaultsPath(app), JSON.stringify(defaults, null, 2), cb)
}

function writeDefaultDeltasFile(app, deltas, cb) {
  fs.writeFile(getDefaultDeltasPath(app), JSON.stringify(deltas, null, 2), cb)
}

function writeDefaultDeltasFileSync(app, deltas) {
  fs.writeFileSync(getDefaultDeltasPath(app), JSON.stringify(deltas, null, 2))
}

function getDefaultValue(app, vpath) {
  if (vpath.indexOf('.') === -1) {
    let rootUpdates = app.config.defaultDeltas.reduce((acc, delta) => {
      if (delta.updates) {
        delta.updates.forEach(update => {
          if (update.values) {
            let value = update.values.forEach(v => {
              if (v.path === '') {
                acc.push(v.value)
              }
            })
          }
        })
      }
      return acc
    }, [])
    let keyUpdate = rootUpdates.find(update => {
      return !_.isUndefined(update[vpath])
    })
    return _.isUndefined(keyUpdate) ? undefined : keyUpdate[vpath]
  } else {
    let deltas = app.config.defaultDeltas.reduce((acc, delta) => {
      if (delta.updates) {
        delta.updates.forEach(update => {
          if (update.values) {
            let value = update.values.forEach(v => {
              if (v.path === vpath) {
                acc.push(v.value)
              }
            })
          }
        })
      }
      return acc
    }, [])
    return deltas.length > 0 ? deltas[deltas.length - 1] : undefined
  }
}

function setDefaultValue(app, vpath, value) {
  if (vpath.indexOf('.') === -1) {
    let rootUpdates = app.config.defaultDeltas.reduce((acc, delta) => {
      if (delta.updates) {
        delta.updates.forEach(update => {
          if (update.values) {
            update.values.forEach(v => {
              if (v.path === '') {
                acc.push(v.value)
              }
            })
          }
        })
      }
      return acc
    }, [])
    let keyUpdate = rootUpdates.find(update => {
      return !_.isUndefined(update[vpath])
    })
    if (_.isUndefined(keyUpdate)) {
      app.config.defaultDeltas.push({
        updates: [
          {
            values: [
              {
                path: '',
                value: {
                  [vpath]: value
                }
              }
            ]
          }
        ]
      })
    } else {
      keyUpdate[vpath] = value
    }
  } else {
    let values = app.config.defaultDeltas.reduce((acc, delta) => {
      if (delta.updates) {
        delta.updates.forEach(update => {
          if (update.values) {
            update.values.forEach(v => {
              if (v.path === vpath) {
                acc.push(v)
              }
            })
          }
        })
      }
      return acc
    }, [])
    if (values.length === 0) {
      app.config.defaultDeltas.push({
        updates: [
          {
            values: [
              {
                path: vpath,
                value: value
              }
            ]
          }
        ]
      })
    } else {
      values[values.length - 1].value = value
    }
  }
}

function removeDefaultValue(app, vpath) {
  let isRoot = vpath.indexOf('.') === -1
  app.config.defaultDeltas.forEach(delta => {
    if (delta.updates) {
      delta.updates.forEach(update => {
        if (update.values) {
          update.values.forEach(v => {
            if (isRoot && v.path === '' && !_.isUndefined(v.value[vpath])) {
              delete v.value[vpath]
              if (_.keys(v.value).length === 0) {
                _.pull(update.values, v)
              }
            } else if (v.path === vpath) {
              _.pull(update.values, v)
            }
          })
          if (update.values.length === 0) {
            _.pull(delta.updates, update)
          }
        }
      })
      if (delta.updates.length === 0) {
        _.pull(app.config.defaultDeltas, delta)
      }
    }
  })
}

function setSelfSettings(app) {
  var name = getDefaultValue(app, 'name')
  var mmsi = getDefaultValue(app, 'mmsi')
  var uuid = getDefaultValue(app, 'uuid')

  if (mmsi && !_.isString(mmsi)) {
    throw new Error(`invalid mmsi: ${mmsi}`)
  }

  if (uuid && !_.isString(uuid)) {
    throw new Error(`invalid uuid: ${uuid}`)
  }

  if (_.isUndefined(mmsi) && _.isUndefined(uuid)) {
    uuid = 'urn:mrn:signalk:uuid:' + uuidv4()
    app.config.defaultDeltas.push({
      updates: [
        {
          values: [
            {
              path: '',
              value: {
                uuid: uuid
              }
            }
          ]
        }
      ]
    })
    if (!disableWriteSettings) {
      writeDefaultDeltasFileSync(app, app.config.defaultDeltas)
    }
  }

  app.config.vesselName = name
  if (mmsi) {
    app.selfType = 'mmsi'
    app.selfId = 'urn:mrn:imo:mmsi:' + mmsi
    app.config.vesselMMSI = mmsi
  } else if (uuid) {
    app.selfType = 'uuid'
    app.selfId = uuid
    app.config.vesselUUID = uuid
  }
  if (app.selfType) {
    debug(app.selfType.toUpperCase() + ': ' + app.selfId)
  }
  app.selfContext = 'vessels.' + app.selfId
}

function readSettingsFile(app) {
  const settings = getSettingsFilename(app)
  if (!app.argv.s && !fs.existsSync(settings)) {
    console.log('Settings file does not exist, using empty settings')
    app.config.settings = {}
  } else {
    debug('Using settings file: ' + settings)
    app.config.settings = require(settings)
  }
  if (_.isUndefined(app.config.settings.pipedProviders)) {
    app.config.settings.pipedProviders = []
  }
  if (_.isUndefined(app.config.settings.interfaces)) {
    app.config.settings.interfaces = {}
  }
}

function writeSettingsFile(app, settings, cb) {
  if (!disableWriteSettings) {
    const settingsPath = getSettingsFilename(app)
    fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), cb)
  } else {
    cb()
  }
}

function getSettingsFilename(app) {
  if (process.env.SIGNALK_NODE_SETTINGS) {
    debug(
      'Settings filename was set in environment SIGNALK_NODE_SETTINGS, overriding all other options'
    )
    return path.resolve(process.env.SIGNALK_NODE_SETTINGS)
  }

  const settingsFile = app.argv.s || 'settings.json'
  return path.join(app.config.configPath, settingsFile)
}

function getExternalHostname(config) {
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

function getExternalPort(config) {
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

function scanDefaults(vpath, item, metaValues, values) {
  _.keys(item).forEach(key => {
    let value = item[key]
    if (key === 'meta') {
      metaValues.push({
        path: vpath,
        value: value
      })
    } else if (key === 'value') {
      values.push({
        path: vpath,
        value: value
      })
    } else if (_.isObject(value)) {
      let childPath = vpath.length > 0 ? `${vpath}.${key}` : key
      scanDefaults(childPath, value, metaValues, values)
    }
  })
}

function convertOldDefaultsToDeltas(defaults) {
  let deltas = []
  let self = _.get(defaults, 'vessels.self')
  if (self) {
    let topValues = {}
    let metaValues = []
    let values = []
    _.keys(self).forEach(key => {
      let value = self[key]
      if (!_.isString(value)) {
        scanDefaults(key, value, metaValues, values)
      } else {
        topValues[key] = value
      }
    })
    deltas.push({
      updates: [
        {
          values: [
            {
              path: '',
              value: topValues
            }
          ]
        }
      ]
    })
    if (metaValues.length > 0) {
      deltas.push({
        updates: [
          {
            meta: metaValues
          }
        ]
      })
    }
    if (values.length > 0) {
      deltas.push({
        updates: [
          {
            values: values
          }
        ]
      })
    }
  }
  return deltas
}

const pluginsPackageJsonTemplate = {
  name: 'signalk-server-config',
  version: '0.0.1',
  description: 'This file is here to track your plugin and webapp installs.',
  repository: {},
  license: 'Apache-2.0'
}

module.exports = {
  load,
  getConfigDirectory,
  writeSettingsFile,
  writeDefaultsFile,
  readDefaultsFile,
  sendDefaultDeltas,
  removeDefaultValue
}
