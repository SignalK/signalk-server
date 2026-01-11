/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

import fs from 'fs'
import os from 'node:os'
import _ from 'lodash'
import path from 'path'
import semver from 'semver'
import { v4 as uuidv4 } from 'uuid'
import { ServerApp, SignalKMessageHub, WithConfig } from '../app'
import { createDebug } from '../debug'
import DeltaEditor from '../deltaeditor'
import { getExternalPort } from '../ports'
import { atomicWriteFile } from '../atomicWrite'
const debug = createDebug('signalk-server:config')

let disableWriteSettings = false

// use dynamic path so that ts compiler does not detect this
// json file, as ts compile needs to copy all (other) used
// json files under /dist
// tslint:disable-next-line
const packageJson = require('../../' + 'package.json')

export interface Config {
  getExternalHostname: () => string
  getExternalPort: () => number
  port: number
  appPath: string
  configPath: string
  name: string
  author: string
  contributors: string[]
  version: string
  description: string
  vesselName: string
  vesselUUID?: string
  vesselMMSI?: string
  baseDeltaEditor: DeltaEditor
  hasOldDefaults: boolean
  overrideTimestampWithNow: boolean
  security: boolean
  settings: {
    useBaseDeltas?: boolean
    pipedProviders: any[]
    interfaces?: { [ifaceName: string]: boolean }
    security?: any
    ssl?: boolean
    wsCompression?: boolean
    accessLogging?: boolean
    landingPage?: string
    proxy_host?: string
    proxy_port?: number
    hostname?: string
    pruneContextsMinutes?: number
    mdns?: boolean
    sslport?: number
    port?: number
    keepMostRecentLogsOnly?: boolean
    logCountToKeep?: number
    enablePluginLogging?: boolean
    enableWasmLogging?: boolean
    loggingDirectory?: string
    sourcePriorities?: any
    trustProxy?: boolean | string | number
    courseApi?: {
      apiOnly?: boolean
    }
  }
  defaults: object
}

export interface ConfigApp extends ServerApp, WithConfig, SignalKMessageHub {
  argv: any
  env: any
}

export function load(app: ConfigApp) {
  app.argv = require('minimist')(process.argv.slice(2))

  const config = (app.config = app.config || {})
  const env = (app.env = process.env)

  config.getExternalHostname = getExternalHostname.bind(config, config)
  config.getExternalPort = getExternalPort.bind(config, app)

  config.appPath = config.appPath || path.normalize(__dirname + '/../../')
  debug('appPath:' + config.appPath)

  try {
    config.name = packageJson.name
    config.author = packageJson.author
    config.contributors = packageJson.contributors
    config.version = packageJson.version
    config.description = packageJson.description

    //if dependencies are installed from tarballs like in
    //master docker build the version will be like
    //file:signalk-server-admin-ui-1.44.1.tgz
    if (!process.env.SKIP_ADMINUI_VERSION_CHECK) {
      checkPackageVersion(
        '@signalk/server-admin-ui',
        packageJson,
        app.config.appPath
      )
    }
  } catch (err) {
    console.error('error parsing package.json', err)
    process.exit(1)
  }

  setConfigDirectory(app)
  app.config.baseDeltaEditor = new DeltaEditor()
  if (_.isObject(app.config.settings)) {
    debug('Using settings from constructor call, not reading defaults')
    disableWriteSettings = true
    if (config.defaults) {
      convertOldDefaultsToDeltas(app.config.baseDeltaEditor, config.defaults)
    }
  } else {
    readSettingsFile(app)
    if (!setBaseDeltas(app)) {
      const defaults = getFullDefaults(app)
      if (defaults) {
        convertOldDefaultsToDeltas(app.config.baseDeltaEditor, defaults)
        if (
          typeof (app.config.settings as any).useBaseDeltas === 'undefined' ||
          (app.config.settings as any).useBaseDeltas
        ) {
          writeBaseDeltasFileSync(app)
        } else {
          app.config.hasOldDefaults = true
        }
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
  }

  if (app.argv['override-timestamps']) {
    app.config.overrideTimestampWithNow = true
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

function checkPackageVersion(name: string, pkg: any, appPath: string) {
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
function getConfigDirectory({ argv, config, env }: any) {
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
function setConfigDirectory(app: ConfigApp) {
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

function getDefaultsPath(app: ConfigApp) {
  const defaultsFile =
    app.config.configPath !== app.config.appPath
      ? 'defaults.json'
      : 'settings/defaults.json'
  return path.join(app.config.configPath, defaultsFile)
}

function getBaseDeltasPath(app: ConfigApp) {
  const defaultsFile =
    app.config.configPath !== app.config.appPath
      ? 'baseDeltas.json'
      : 'settings/baseDeltas.json'
  return path.join(app.config.configPath, defaultsFile)
}

export function readDefaultsFile(app: ConfigApp) {
  const defaultsPath = getDefaultsPath(app)
  const data = fs.readFileSync(defaultsPath)
  return JSON.parse(data.toString())
}

function getFullDefaults(app: ConfigApp) {
  const defaultsPath = getDefaultsPath(app)
  try {
    const defaults = readDefaultsFile(app)
    debug(`Found defaults at ${defaultsPath.toString()}`)
    return defaults
  } catch (e) {
    if ((e as any)?.code === 'ENOENT') {
      return undefined
    } else {
      console.error(`unable to parse ${defaultsPath.toString()}`)
      console.error(e)
      process.exit(1)
    }
  }
  return undefined
}

function setBaseDeltas(app: ConfigApp) {
  const defaultsPath = getBaseDeltasPath(app)
  try {
    app.config.baseDeltaEditor.load(defaultsPath)
    debug(`Found default deltas at ${defaultsPath.toString()}`)
  } catch (e) {
    if ((e as any)?.code === 'ENOENT') {
      debug(`No default deltas found at ${defaultsPath.toString()}`)
      return
    } else {
      console.log(e)
    }
  }
  return true
}

export function sendBaseDeltas(app: ConfigApp) {
  const copy = JSON.parse(JSON.stringify(app.config.baseDeltaEditor.deltas))
  copy.forEach((delta: any) => {
    app.handleMessage('defaults', delta)
  })
}

export function writeDefaultsFile(app: ConfigApp, defaults: any, cb: any) {
  atomicWriteFile(getDefaultsPath(app), JSON.stringify(defaults, null, 2))
    .then(() => cb())
    .catch(cb)
}

export function writeBaseDeltasFileSync(app: ConfigApp) {
  app.config.baseDeltaEditor.saveSync(getBaseDeltasPath(app))
}

export function writeBaseDeltasFile(app: ConfigApp) {
  return app.config.baseDeltaEditor.save(getBaseDeltasPath(app))
}

function setSelfSettings(app: ConfigApp) {
  const name = app.config.baseDeltaEditor.getSelfValue('name')
  const mmsi = app.config.baseDeltaEditor.getSelfValue('mmsi')
  let uuid = app.config.baseDeltaEditor.getSelfValue('uuid')

  if (mmsi && !_.isString(mmsi)) {
    throw new Error(`invalid mmsi: ${mmsi}`)
  }

  if (uuid && !_.isString(uuid)) {
    throw new Error(`invalid uuid: ${uuid}`)
  }

  if (mmsi === null && uuid === null) {
    uuid = 'urn:mrn:signalk:uuid:' + uuidv4()
    app.config.baseDeltaEditor.setSelfValue('uuid', uuid)
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

function readSettingsFile(app: ConfigApp) {
  const settings = getSettingsFilename(app)
  if (!app.argv.s && !fs.existsSync(settings)) {
    console.log('Settings file does not exist, using empty settings')
    app.config.settings = {
      pipedProviders: []
    }
  } else {
    debug('Using settings file: ' + settings)
    try {
      app.config.settings = require(settings)
    } catch (_e: any) {
      console.error(
        `Error reading settings file ${settings}, using empty settings`
      )
      app.config.settings = {
        pipedProviders: []
      }
    }
  }
  if (_.isUndefined(app.config.settings.pipedProviders)) {
    app.config.settings.pipedProviders = []
  }
  if (_.isUndefined(app.config.settings.interfaces)) {
    app.config.settings.interfaces = {}
  }
}

export function writeSettingsFile(app: ConfigApp, settings: any, cb: any) {
  if (!disableWriteSettings) {
    atomicWriteFile(getSettingsFilename(app), JSON.stringify(settings, null, 2))
      .then(() => cb())
      .catch(cb)
  } else {
    cb()
  }
}

function getSettingsFilename(app: ConfigApp) {
  if (process.env.SIGNALK_NODE_SETTINGS) {
    debug(
      'Settings filename was set in environment SIGNALK_NODE_SETTINGS, overriding all other options'
    )
    return path.resolve(process.env.SIGNALK_NODE_SETTINGS)
  }

  const settingsFile = app.argv.s || 'settings.json'
  return path.join(app.config.configPath, settingsFile)
}

function getExternalHostname(config: Config) {
  if (process.env.EXTERNALHOST) {
    return process.env.EXTERNALHOST
  }
  if (config.settings.proxy_host) {
    return config.settings.proxy_host
  } else if (config.settings.hostname) {
    return config.settings.hostname
  }
  try {
    return os.hostname()
  } catch (_ex) {
    return 'hostname_not_available'
  }
}

function scanDefaults(deltaEditor: DeltaEditor, vpath: string, item: any) {
  _.keys(item).forEach((key: string) => {
    const value = item[key]
    if (key === 'meta') {
      deltaEditor.setMeta('vessels.self', vpath, value)
    } else if (key === 'value') {
      deltaEditor.setSelfValue(vpath, value)
    } else if (_.isObject(value)) {
      const childPath = vpath.length > 0 ? `${vpath}.${key}` : key
      scanDefaults(deltaEditor, childPath, value)
    }
  })
}

function convertOldDefaultsToDeltas(
  deltaEditor: DeltaEditor,
  defaults: object
) {
  const deltas: any[] = []
  const self: any = _.get(defaults, 'vessels.self')
  if (self) {
    _.keys(self).forEach((key: any) => {
      const value = self[key]
      if (!_.isString(value)) {
        scanDefaults(deltaEditor, key, value)
      } else {
        deltaEditor.setSelfValue(key, value)
      }
    })
    if (self.communication) {
      deltaEditor.setSelfValue('communication', self.communication)
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
  sendBaseDeltas,
  writeBaseDeltasFile,
  package: packageJson
}
