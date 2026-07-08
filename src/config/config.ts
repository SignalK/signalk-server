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
import {
  getPrioritiesFilePath,
  loadPrioritiesIntoSettings,
  migratePrioritiesIntoSeparateFile,
  splitPrioritiesFromSettings
} from './priorities-file'
import {
  loadAll as loadUnitPreferences,
  setApplicationDataPath
} from '../unitpreferences'
const debug = createDebug('signalk-server:config')

let disableWriteSettings = false

// Serialises every settings.json (and priorities.json) write. Callers
// commonly mutate app.config.settings in place and pass it here; without a
// queue two overlapping writes can interleave their priorities.json and
// settings.json phases, and a slow write can land on disk after a newer one.
// Chaining on this promise runs the file I/O one write at a time in call
// order. The payload is stringified synchronously at call time (below) so a
// later in-place mutation of the settings object cannot change what an
// already-queued write persists.
let settingsWriteQueue: Promise<void> = Promise.resolve()

// use dynamic path so that ts compiler does not detect this
// json file, as ts compile needs to copy all (other) used
// json files under /dist
// tslint:disable-next-line
const packageJson = require('../../' + 'package.json')

export interface Config {
  getExternalHostname: () => string
  getExternalPort: () => number
  isExternalSsl: () => boolean
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
    wsPingInterval?: number | false
    accessLogging?: boolean
    landingPage?: string
    proxy_host?: string
    proxy_port?: number
    proxy_ssl?: boolean
    hostname?: string
    pruneContextsMinutes?: number
    mdns?: boolean
    sslport?: number
    port?: number
    keepMostRecentLogsOnly?: boolean
    logCountToKeep?: number
    enablePluginLogging?: boolean
    loggingDirectory?: string
    /** Per-path explicit overrides. The engine consults this map first;
     * if a path has an entry here, that ranking is used. Includes the
     * fan-out sentinel `[{ sourceRef: '*', timeout: 0 }]` for paths the
     * user has marked as "deliver every source's value". Paths with no
     * entry here fall through to group resolution (see priorityGroups). */
    priorityOverrides?: Record<
      string,
      Array<{ sourceRef: string; timeout: number }>
    >

    /** Ordered list of sources per priority group. The engine resolves
     * a path's ranking dynamically: if a delta's source is in an active
     * group, the group's ordering applies to the path. */
    priorityGroups?: Array<{
      id: string
      sources: string[]
      /** When true, the group is excluded from engine resolution —
       * paths whose only ranking would have come from this group accept
       * all sources first-come-first-served. Lets a user temporarily
       * disable a ranking without losing the order they configured. */
      inactive?: boolean
    }>

    /** Global default fallback in ms applied to ranks below rank-1
     * when the engine derives a path's ranking from a group. Per-path
     * overrides can still specify their own timeouts. */
    priorityDefaults?: { fallbackMs?: number }

    /** Map of sourceRef → user-defined display alias for that source */
    sourceAliases?: Record<string, string>
    /** Map of "sourceRefA+sourceRefB" (sorted) → ISO timestamp when the
     * conflict was dismissed by the user */
    ignoredInstanceConflicts?: Record<string, string>
    gnssSensors?: {
      sensorId: string
      $source: string
      fromBow: number | null
      fromCenter: number | null
    }[]
    /** How configured GNSS antenna offsets are applied to
     * navigation.position: 'off' stores the geometry without touching
     * data (default), 'replace' rewrites matching deltas to the CCRP,
     * 'both' additionally publishes the corrected position under
     * `<sensorId>.ccrp` while leaving the original untouched. */
    gnssCorrection?: 'off' | 'replace' | 'both'
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
  config.isExternalSsl = isExternalSsl.bind(null, config)

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

  // TRUST_PROXY env var overrides settings file — useful for container deployments
  if (process.env.TRUST_PROXY !== undefined) {
    const envVal = process.env.TRUST_PROXY
    app.config.settings.trustProxy =
      envVal === 'true'
        ? true
        : envVal === 'false'
          ? false
          : isNaN(Number(envVal))
            ? envVal
            : Number(envVal)
  }

  // Load unit preferences
  try {
    setApplicationDataPath(app.config.configPath)
    loadUnitPreferences()
    debug('Unit preferences loaded')
  } catch (err) {
    console.error('Failed to load unit preferences:', err)
    // Non-fatal - server can run without unit preferences
  }

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

  if (app.argv.data) {
    if (typeof app.argv.data !== 'string') {
      console.error('--data requires a single raw log filename')
      process.exit(1)
    }
    const filename = path.resolve(app.argv.data)
    console.log(
      `Disabling all data connections and playing back raw log ${filename}`
    )
    if (!app.argv['override-timestamps']) {
      console.log(
        'Add --override-timestamps to replace timestamps from the data log file with the current date and time.'
      )
    }
    app.config.settings.pipedProviders.forEach((provider) => {
      provider.enabled = false
    })
    const providerId = `fs-${Math.floor(Date.now() / 1000)}`
    app.config.settings.pipedProviders.push({
      id: providerId,
      pipeElements: [
        {
          type: 'providers/simple',
          options: {
            logging: false,
            type: 'FileStream',
            subOptions: {
              useCanName: true,
              dataType: 'Multiplexed',
              filename
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
  const isOptional = Boolean(pkg.optionalDependencies?.[name])
  const expected = pkg.dependencies?.[name] ?? pkg.optionalDependencies?.[name]
  if (!expected) {
    return
  }
  let modulePackageJsonPath = path.join(
    appPath,
    'node_modules',
    name,
    'package.json'
  )
  if (!fs.existsSync(modulePackageJsonPath)) {
    modulePackageJsonPath = path.join(appPath, '..', name, 'package.json')
  }
  if (!fs.existsSync(modulePackageJsonPath) && isOptional) {
    // Optional package not installed (e.g. core image with --omit=optional).
    return
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
  loadPrioritiesIntoSettings(app)
  const migrated = migratePrioritiesIntoSeparateFile(app)
  if (migrated && !disableWriteSettings) {
    // Persist settings.json without the priority keys so it stays clean.
    atomicWriteFile(
      getSettingsFilename(app),
      JSON.stringify(app.config.settings, null, 2)
    ).catch((e) => {
      console.error(
        'Failed to strip migrated priority keys from settings.json:',
        e
      )
    })
  }
}

export function writeSettingsFile(app: ConfigApp, settings: any, cb: any) {
  if (disableWriteSettings) {
    cb()
    return
  }
  // Capture the exact bytes now, before the write is queued: callers hand
  // us app.config.settings and may mutate it (even nested) before this
  // deferred write actually runs. Stringifying up front pins each queued
  // write to the state at call time. Do it inside try/catch so a stringify
  // failure (e.g. a circular reference in settings) reaches the caller via
  // cb, matching the async error path, instead of throwing synchronously.
  let settingsJson: string
  let prioritiesJson: string
  let prioritiesFile: string
  let settingsFile: string
  try {
    const { settingsWithoutPriorities, priorities } =
      splitPrioritiesFromSettings(settings)
    settingsJson = JSON.stringify(settingsWithoutPriorities, null, 2)
    prioritiesJson = JSON.stringify(priorities, null, 2)
    prioritiesFile = getPrioritiesFilePath(app)
    settingsFile = getSettingsFilename(app)
  } catch (err) {
    cb(err)
    return
  }

  // Always overwrite priorities.json — when the user resets all priority
  // state, the in-memory `priorities` is `{}` and the file must be cleared
  // too, otherwise stale entries from a previous save reload on next start.
  //
  // Sequence the writes (priorities first, then settings) so that if the
  // priorities write fails, settings.json is left untouched — on restart
  // the loader still has legacy priority keys to fold back in. If the
  // settings write fails after priorities succeeded, only the
  // non-priority slice is stale, which is the safer half: the engine
  // keeps using the just-saved priorities.json on next load.
  //
  // The whole two-file write is queued behind any earlier write so
  // concurrent callers cannot interleave their phases or land out of order.
  const write = () =>
    atomicWriteFile(prioritiesFile, prioritiesJson).then(() =>
      atomicWriteFile(settingsFile, settingsJson)
    )
  const done = settingsWriteQueue.then(write, write)
  // Keep the queue alive regardless of this write's outcome so a failed
  // write doesn't wedge every later one; each caller still gets its own
  // success/failure via cb.
  settingsWriteQueue = done.then(
    () => undefined,
    () => undefined
  )
  done.then(() => cb()).catch(cb)
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

function isExternalSsl(config: Config): boolean {
  if (process.env.EXTERNALSSL) {
    return (
      process.env.EXTERNALSSL === '1' ||
      process.env.EXTERNALSSL.toLowerCase() === 'true'
    )
  }
  return !!config.settings.proxy_ssl
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

// Walks an object emitted under a parent path and recursively sets a
// leaf delta per terminal value (strings, numbers, booleans, arrays).
// Used for legacy defaults.json shapes that nest bare values directly
// (e.g. `communication: { callsignVhf: "OH..." }`) — scanDefaults only
// reads `{ value: ... }` leaves so it silently drops bare values, and
// emitting the whole object at the parent path leaks an out-of-date
// snapshot of every child every time anyone GETs the parent.
function emitBareLeafDeltas(
  deltaEditor: DeltaEditor,
  parentPath: string,
  item: unknown
) {
  if (!_.isPlainObject(item)) return
  const obj = item as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const childPath = parentPath.length > 0 ? `${parentPath}.${key}` : key
    if (_.isPlainObject(value)) {
      // Skip {value:..., meta:...} shapes — scanDefaults already handled
      // those in the main pass. Recurse into anything else to reach the
      // bare leaves below.
      const child = value as Record<string, unknown>
      if ('value' in child || 'meta' in child) continue
      emitBareLeafDeltas(deltaEditor, childPath, child)
    } else if (value !== undefined && value !== null) {
      deltaEditor.setSelfValue(childPath, value)
    }
  }
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
      // Legacy shape stores `communication.*` as bare values, not the
      // `{ value: ... }` shape scanDefaults walks. Emit them as separate
      // leaf deltas so they don't collide with paths the spec keeps
      // under `communication` (e.g. communication.crewNames written by
      // signalk-logbook), which a parent-path snapshot would otherwise
      // serve as stale, defaults-sourced JSON in the Data Browser.
      emitBareLeafDeltas(deltaEditor, 'communication', self.communication)
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
