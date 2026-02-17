/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
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

import { spawn } from 'child_process'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import semver, { SemVer } from 'semver'
import { Config } from './config/config'
import { createDebug } from './debug'
const debug = createDebug('signalk:modules')
const npmDebug = createDebug('signalk:modules:npm')

interface ModuleData {
  module: string
  metadata: object
  location: string
}

export interface NpmDistTags {
  latest: string
  [prerelease: string]: string
}

export interface WasmCapabilities {
  network?: boolean
  storage?: 'vfs-only' | 'none'
  dataRead?: boolean
  dataWrite?: boolean
  serialPorts?: boolean
  putHandlers?: boolean
  httpEndpoints?: boolean
  resourceProvider?: boolean
  weatherProvider?: boolean
  radarProvider?: boolean
  rawSockets?: boolean
}

export interface NpmPackageData {
  name: string
  version: string
  date: string
  keywords: string[]
  description?: string
  // WASM plugin fields
  wasmManifest?: string // Path to WASM binary (e.g., "build/plugin.wasm")
  wasmCapabilities?: WasmCapabilities
  signalk?: {
    displayName?: string
  }
}

interface NpmSearchResponse {
  total: number
  objects: NpmModuleData[]
}

interface NpmModuleData {
  package: NpmPackageData
}

export interface Package {
  name: string
  publisher?: {
    username: string
  }
  dependencies: { [key: string]: any }
  version: string
  description: string
  license: string
}

function findModulesInDir(dir: string, keyword: string): ModuleData[] {
  // If no directory by name return empty array.
  if (!fs.existsSync(dir)) {
    return []
  }
  debug('findModulesInDir: ' + dir)
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .reduce<ModuleData[]>((result, filename) => {
      if (filename.indexOf('@') === 0) {
        return result.concat(
          findModulesInDir(dir + filename + '/', keyword).map((entry) => {
            return {
              module: entry.module,
              metadata: entry.metadata,
              location: dir
            }
          })
        )
      } else {
        let metadata
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          metadata = require(path.join(dir, filename, 'package.json'))
        } catch (err) {
          debug(err)
        }
        if (
          metadata &&
          metadata.keywords &&
          metadata.keywords.includes(keyword)
        ) {
          result.push({
            module: metadata.name,
            metadata,
            location: dir
          })
        }
      }
      return result
    }, [])
}

// Extract unique directory paths from app object.
function getModulePaths(config: Config) {
  // appPath is the app working directory.
  const { appPath, configPath } = config
  return (appPath === configPath ? [appPath] : [configPath, appPath]).map(
    (pathOption) => path.join(pathOption, 'node_modules/')
  )
}

const getModuleSortName = (x: ModuleData) =>
  (x.module || '').replace('@signalk', ' ')

// Sort handler that puts strings with '@signalk' first.
const priorityPrefix = (a: ModuleData, b: ModuleData) =>
  getModuleSortName(a).localeCompare(getModuleSortName(b))

// Searches for installed modules that contain `keyword`.
export function modulesWithKeyword(config: Config, keyword: string) {
  return _.uniqBy(
    // _.flatten since values are inside an array. [[modules...], [modules...]]
    _.flatten(
      getModulePaths(config).map((pathOption) =>
        findModulesInDir(pathOption, keyword)
      )
    ),
    (moduleData) => moduleData.module
  ).sort(priorityPrefix)
}
function installModule(
  config: Config,
  name: string,
  version: string,
  onData: () => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  runNpm(config, name, version, 'install', onData, onErr, onClose)
}

function removeModule(
  config: Config,
  name: string,
  version: any,
  onData: () => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  runNpm(config, name, null, 'remove', onData, onErr, onClose)
}

export function restoreModules(
  config: Config,
  onData: (output: any) => void,
  onErr: (err: Error) => void,
  onClose: (code: number) => any
) {
  runNpm(config, null, null, 'remove', onData, onErr, onClose)
}

export function runNpm(
  config: Config,
  name: any,
  version: string | null,
  command: string,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  if (version && version !== '' && !semver.valid(version)) {
    onErr(new Error('Invalid version: ' + version))
    onClose(-1)
    return
  }
  let npm

  const opts: { cwd?: string; shell?: boolean } = {}
  let packageString

  if (process.platform === 'win32') {
    opts['shell'] = true
  }

  if (name) {
    packageString = version ? `${name}@${version}` : name
  } else {
    packageString = ''
  }

  debug(`${command}: ${packageString}`)

  const npmArgs = isTheServerModule(name, config)
    ? [command, '-g']
    : ['--save', '--ignore-scripts', command]

  if (packageString) {
    npmArgs.push(packageString)
  }

  if (isTheServerModule(name, config)) {
    if (process.platform === 'win32') {
      npm = spawn('npm.cmd', npmArgs, opts)
    } else {
      npm = spawn('sudo', ['npm', ...npmArgs], opts)
    }
  } else {
    opts.cwd = config.configPath

    if (process.platform === 'win32') {
      npm = spawn('npm.cmd', npmArgs, opts)
    } else {
      npm = spawn('npm', npmArgs, opts)
    }
  }

  npm.stdout.on('data', onData)
  npm.stderr.on('data', onErr)
  npm.on('close', onClose)
  npm.on('error', (err: Error) => {
    onErr(err)
    onClose(-1)
  })
}

function isTheServerModule(moduleName: string, config: Config) {
  return moduleName === config.name
}

const modulesByKeyword: Record<
  string,
  { time: number; packages: NpmModuleData[] }
> = {}

async function findModulesWithKeyword(
  keyword: string
): Promise<NpmModuleData[]> {
  if (
    modulesByKeyword[keyword] &&
    Date.now() - modulesByKeyword[keyword].time < 60 * 1000
  ) {
    return modulesByKeyword[keyword].packages
  }

  const moduleData = await searchByKeyword(keyword)
  npmDebug(
    `npm search returned ${moduleData.length} modules with keyword ${keyword}`
  )

  const result = moduleData.reduce(
    (acc: Record<string, NpmModuleData>, module: NpmModuleData) => {
      const name = module.package.name
      if (
        !acc[name] ||
        semver.gt(module.package.version, acc[name].package.version)
      ) {
        acc[name] = module
      }
      return acc
    },
    {}
  )

  const packages = Object.values(result)
  modulesByKeyword[keyword] = { time: Date.now(), packages }
  return packages
}

async function searchByKeyword(keyword: string): Promise<NpmModuleData[]> {
  let fetchedCount = 0
  let toFetchCount = 1
  let moduleData: NpmModuleData[] = []

  while (fetchedCount < toFetchCount) {
    npmDebug(`searching ${keyword} from ${fetchedCount + 1} of ${toFetchCount}`)
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?size=250&from=${
        fetchedCount > 0 ? fetchedCount : 0
      }&text=keywords:${keyword}`
    )
    if (!res.ok) {
      npmDebug(`npm search failed with status ${res.status}: ${res.statusText}`)
      break
    }
    const parsed = (await res.json()) as NpmSearchResponse

    moduleData = moduleData.concat(parsed.objects)
    fetchedCount += parsed.objects.length
    toFetchCount = parsed.total
  }

  return moduleData
}

let distTagsCache: { time: number; data: Record<string, NpmDistTags> } = {
  time: 0,
  data: {}
}

async function fetchDistTagsForPackages(
  packageNames: string[]
): Promise<Record<string, NpmDistTags>> {
  if (Date.now() - distTagsCache.time < 60 * 1000) {
    return distTagsCache.data
  }

  const result: Record<string, NpmDistTags> = {}
  const CONCURRENCY = 10
  let i = 0

  while (i < packageNames.length) {
    const batch = packageNames.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map(async (name) => {
        const res = await fetch(
          `https://registry.npmjs.org/-/package/${name}/dist-tags`
        )
        if (!res.ok) return null
        const tags = (await res.json()) as NpmDistTags
        return { name, tags }
      })
    )
    for (const entry of settled) {
      if (entry.status === 'fulfilled' && entry.value) {
        result[entry.value.name] = entry.value.tags
      }
    }
    i += CONCURRENCY
  }

  distTagsCache = { time: Date.now(), data: result }
  return result
}

function doFetchDistTags() {
  return fetch('https://registry.npmjs.org/-/package/signalk-server/dist-tags')
}

async function getLatestServerVersion(
  currentVersion: string,
  distTags = doFetchDistTags
): Promise<string> {
  const res = await distTags()
  if (!res.ok) {
    throw new Error(
      `Failed to fetch dist-tags: ${res.status} ${res.statusText}`
    )
  }
  const versions = (await res.json()) as NpmDistTags

  const prereleaseData = semver.prerelease(currentVersion)
  if (prereleaseData) {
    if (semver.satisfies(versions.latest, `>${currentVersion}`)) {
      return versions.latest
    } else {
      return versions[prereleaseData[0]]
    }
  } else {
    return versions.latest
  }
}

export function checkForNewServerVersion(
  currentVersion: string,
  serverUpgradeIsAvailable: (
    errMessage: string | void,
    version?: string
  ) => any,
  getLatestServerVersionP: (
    version: string
  ) => Promise<string> = getLatestServerVersion
) {
  getLatestServerVersionP(currentVersion)
    .then((version: string) => {
      if (semver.satisfies(new SemVer(version), `>${currentVersion}`)) {
        serverUpgradeIsAvailable(undefined, version)
      }
    })
    .catch((err: any) => {
      serverUpgradeIsAvailable(`unable to check for new server version: ${err}`)
    })
}

export function getAuthor(thePackage: Package): string {
  return `${thePackage.publisher?.username}${
    thePackage.name.startsWith('@signalk/') ? ' (Signal K team)' : ''
  }`
}

export function getKeywords(thePackage: NpmPackageData): string[] {
  const keywords = thePackage.keywords
  debug('%s keywords: %j', thePackage.name, keywords)
  return keywords
}

export async function importOrRequire(moduleDir: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(moduleDir)

    // Starting with version 20.19.0 and 22 Node will load ESM modules with require
    // https://nodejs.org/en/blog/release/v20.19.0
    return mod.default ?? mod
  } catch (err) {
    debug(`Failed to require("${moduleDir}") module, trying import()`)

    // `import()` only works with file paths or npm module names. It can't
    // directly load a path to a directory. One solution would be to refactor
    // module loading to update `NODE_PATH` with plugin directories, and
    // then import/require them here using just their module name (e.g.
    // `import("@signalk/plugin-name")`), which would allow NodeJS to resolve
    // and load the module. This would be a little more extensive refactoring
    // that may be worth while once the whole project is entirely using ESM.
    // For now, this `esm-resolve` package work

    const { buildResolver } = await import('esm-resolve')
    const resolver = buildResolver(moduleDir, {
      isDir: true,
      resolveToAbsolute: true
    })
    const modulePath = resolver('.')

    if (modulePath) {
      const module = await import(modulePath)
      return module.default
    } else {
      // Could not resolve, throw the original error.
      throw err
    }
  }
}

module.exports = {
  modulesWithKeyword,
  installModule,
  removeModule,
  isTheServerModule,
  findModulesWithKeyword,
  fetchDistTagsForPackages,
  getLatestServerVersion,
  checkForNewServerVersion,
  getAuthor,
  getKeywords,
  restoreModules,
  importOrRequire,
  runNpm
}
