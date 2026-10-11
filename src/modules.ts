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

import { ChildProcess, execFile, spawn } from 'child_process'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import semver, { SemVer } from 'semver'
import { atomicWriteFileSync } from './atomicWrite'
import { findBundledPackages, findPackageLocation } from './bundled-packages'
import { Config } from './config/config'
import { createDebug } from './debug'
import { pluginConfigPath, pluginDataDir } from './plugin-paths'
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
  maintainers?: Array<{ username?: string; email?: string }>
  author?: string | { name?: string; email?: string; url?: string }
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

// Bundled packages outside appPath/node_modules, where hoisting or a pnpm
// store places them, are not found by scanning the module paths.
function findBundledModules(config: Config, keyword: string): ModuleData[] {
  const result: ModuleData[] = []
  for (const { name, location } of findBundledPackages(config.appPath)) {
    let metadata
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      metadata = require(path.join(location, name, 'package.json'))
    } catch (err) {
      debug(err)
      continue
    }
    if (metadata.keywords?.includes(keyword)) {
      result.push({ module: metadata.name, metadata, location })
    }
  }
  return result
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
    _.flatten([
      ...getModulePaths(config).map((pathOption) =>
        findModulesInDir(pathOption, keyword)
      ),
      findBundledModules(config, keyword)
    ]),
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
  runPackageManager(config, name, version, 'install', onData, onErr, onClose)
}

export function removeModule(
  config: Config,
  name: string,
  version: any,
  onData: () => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any,
  pluginId?: string,
  deleteData: boolean = false
) {
  // require.cache is keyed by real paths, and pnpm links packages into
  // node_modules from its store, so resolve the link while it still exists.
  const moduleDir = path.join(config.configPath, 'node_modules', name)
  const loadedDir = fs.existsSync(moduleDir)
    ? fs.realpathSync(moduleDir)
    : moduleDir
  const finish = (code: number) => {
    cleanupAfterRemove(config.configPath, name, loadedDir, pluginId, deleteData)
    onClose(code)
  }
  // pnpm refuses to remove a package that package.json does not declare,
  // such as one copied into node_modules by hand
  if (!isDeclaredDependency(config.configPath, name)) {
    finish(0)
    return
  }
  runPackageManager(config, name, null, 'remove', onData, onErr, finish)
}

function isDeclaredDependency(configPath: string, name: string): boolean {
  const packageJson = readJson(path.join(configPath, 'package.json'))
  return Boolean(packageJson?.dependencies?.[name])
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function cleanupAfterRemove(
  configPath: string,
  packageName: string,
  loadedDir: string,
  pluginId?: string,
  deleteData: boolean = false
) {
  const moduleDir = path.join(configPath, 'node_modules', packageName)
  if (fs.existsSync(moduleDir)) {
    console.warn(`${packageName}: removing directory left in node_modules`)
    try {
      fs.rmSync(moduleDir, { recursive: true, force: true })
    } catch (e: any) {
      console.error(`Failed to remove ${moduleDir}: ${e.message}`)
    }
  }

  const resolvedDir = path.resolve(loadedDir)
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(resolvedDir)) {
      delete require.cache[key]
    }
  }

  const packageJsonPath = path.join(configPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (packageJson.dependencies && packageJson.dependencies[packageName]) {
        delete packageJson.dependencies[packageName]
        atomicWriteFileSync(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + '\n'
        )
        console.warn(`${packageName}: removed from settings package.json`)
      }
    } catch (e: any) {
      console.error(`Failed to update settings package.json: ${e.message}`)
    }
  }

  if (pluginId && deleteData) {
    const configFile = pluginConfigPath(configPath, pluginId)
    if (fs.existsSync(configFile)) {
      try {
        fs.unlinkSync(configFile)
      } catch (e: any) {
        console.error(`Failed to remove ${configFile}: ${e.message}`)
      }
    }
    const dataDir = pluginDataDir(configPath, pluginId)
    if (fs.existsSync(dataDir)) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true })
      } catch (e: any) {
        console.error(`Failed to remove ${dataDir}: ${e.message}`)
      }
    }
  }
}

async function getPluginDataSize(
  configPath: string,
  pluginId: string
): Promise<{ totalBytes: number; fileCount: number; hasData: boolean }> {
  let totalBytes = 0
  let fileCount = 0

  const configFile = pluginConfigPath(configPath, pluginId)
  try {
    const stats = await fs.promises.lstat(configFile)
    if (stats.isFile()) {
      totalBytes += stats.size
      fileCount++
    }
  } catch {
    // file does not exist or inaccessible
  }

  const dataDir = pluginDataDir(configPath, pluginId)
  try {
    const dirStats = await fs.promises.lstat(dataDir)
    if (dirStats.isDirectory()) {
      const { default: getFolderSize } = await import('get-folder-size')
      totalBytes += await getFolderSize.loose(dataDir)

      async function countFiles(d: string): Promise<number> {
        let entries: string[]
        try {
          entries = await fs.promises.readdir(d)
        } catch {
          return 0
        }
        let count = 0
        for (const entry of entries) {
          try {
            const stats = await fs.promises.lstat(path.join(d, entry))
            if (stats.isFile()) {
              count++
            } else if (stats.isDirectory()) {
              count += await countFiles(path.join(d, entry))
            }
          } catch {
            // entry removed or inaccessible between readdir and lstat
          }
        }
        return count
      }

      fileCount += await countFiles(dataDir)
    }
  } catch {
    // directory does not exist or inaccessible
  }

  return { totalBytes, fileCount, hasData: totalBytes > 0 }
}

export function restoreModules(
  config: Config,
  onData: (output: any) => void,
  onErr: (err: Error) => void,
  onClose: (code: number) => any
) {
  runConfigDirPnpm(config.configPath, 'install', '', onData, onErr, onClose)
}

type ModuleCommand = 'install' | 'update' | 'remove'

const PNPM_MISSING_MESSAGE =
  'The pnpm that ships with the server is missing, so plugins and webapps cannot be installed. Reinstall signalk-server to restore it.'
// pnpm writes this into every node_modules directory it manages
const PNPM_MODULES_MARKER = '.modules.yaml'
export const PREVIOUS_MODULES_BACKUP = 'node_modules.previous'
export const DISCARDED_MODULES = 'node_modules.discarded'

// An npm package name: an optional scope and URL-safe lowercase characters.
// Anything else (a path, URL or git spec) would make pnpm install from
// outside the registry.
const PACKAGE_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

// Plugins are installed without running their dependencies' build scripts.
// The pnpm-lock.yaml kept in the config directory lets a plugin be removed,
// and the installed set be restored, without the registry. Release age gating
// is off so that a version can be installed as soon as it is published. A
// plugin's dependencies may themselves depend on git or URL packages, as they
// may with npm. A node_modules directory left by another pnpm is rebuilt
// without a prompt, and a repeated install re-links packages that have gone
// missing. The settings use the --config form because not every pnpm command
// accepts them as options.
const PNPM_CONFIG_DIR_ARGS = [
  '--config.ignore-scripts=true',
  '--config.minimum-release-age=0',
  '--config.block-exotic-subdeps=false',
  '--config.confirm-modules-purge=false',
  '--config.optimistic-repeat-install=false'
]

export function runPackageManager(
  config: Config,
  name: any,
  version: string | null,
  command: ModuleCommand,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  if (name && !PACKAGE_NAME_PATTERN.test(name)) {
    onErr(new Error('Invalid package name: ' + name))
    onClose(-1)
    return
  }
  if (version && version !== '' && !semver.valid(version)) {
    onErr(new Error('Invalid version: ' + version))
    onClose(-1)
    return
  }

  const packageString = name ? (version ? `${name}@${version}` : name) : ''
  debug(`${command}: ${packageString}`)

  if (isTheServerModule(name, config)) {
    runServerNpm(command, packageString, onData, onErr, onClose)
  } else {
    runConfigDirPnpm(
      config.configPath,
      command,
      packageString,
      onData,
      onErr,
      onClose
    )
  }
}

// The server is installed globally with npm, and only npm can update that
// install in place.
function runServerNpm(
  command: ModuleCommand,
  packageString: string,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  // npm 12 blocks dependency install scripts unless allowlisted. The server
  // depends on @canboat/canboatjs, which builds its native SocketCAN addon from
  // an install script; without this the CAN interface disappears after a global
  // self-update. Older npm ignores the flag.
  const npmArgs =
    command === 'install' || command === 'update'
      ? [command, '-g', '--allow-scripts=@canboat/canboatjs']
      : [command, '-g']
  if (packageString) {
    npmArgs.push(packageString)
  }

  const npm =
    process.platform === 'win32'
      ? spawn('npm.cmd', npmArgs, { shell: true })
      : spawn('sudo', ['npm', ...npmArgs], {})
  attachHandlers(npm, onData, onErr, onClose)
}

export interface BundledPnpm {
  version: string
  /** The script that starts pnpm */
  bin: string
  /** The Node.js versions that this pnpm runs on */
  node: string
}

let bundledPnpm: BundledPnpm | undefined

// Plugins are installed with the pnpm that ships with the server, run by the
// server's own Node.js: the App Store needs no pnpm on PATH, and installs with
// the pnpm version that the server was released with.
export function getBundledPnpm(): BundledPnpm {
  if (!bundledPnpm) {
    const location = findPackageLocation(__dirname, 'pnpm')
    if (!location) {
      throw new Error(PNPM_MISSING_MESSAGE)
    }
    const dir = path.join(location, 'pnpm')
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    )
    const bin =
      typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.pnpm
    bundledPnpm = {
      version: manifest.version,
      bin: path.join(dir, bin),
      node: manifest.engines?.node ?? '*'
    }
  }
  return bundledPnpm
}

export function bundledPnpmVersion(): string | undefined {
  try {
    return getBundledPnpm().version
  } catch {
    return undefined
  }
}

let storeDir: Promise<string | undefined> | undefined

// The store does not change while the server runs, so it is probed once. A
// failed probe is retried.
function getStoreDir(): Promise<string | undefined> {
  if (!storeDir) {
    storeDir = pnpmOutput(['store', 'path']).catch(() => {
      storeDir = undefined
      return undefined
    })
  }
  return storeDir
}

function pnpmOutput(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [getBundledPnpm().bin, ...args],
      {},
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
    )
  })
}

// pnpm takes no lock on the project, so runs in the config directory are
// serialised here: the App Store queues its own installs, but a settings
// restore runs alongside them. A callback that throws must not leave the
// chain rejected, which would skip every later run.
let configDirRun: Promise<void> = Promise.resolve()

function runConfigDirPnpm(
  configPath: string,
  command: ModuleCommand,
  packageString: string,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  const pnpmCommand =
    command === 'remove' ? 'remove' : packageString ? 'add' : 'install'
  const pnpmArgs = [pnpmCommand, ...PNPM_CONFIG_DIR_ARGS]
  if (packageString) {
    pnpmArgs.push(packageString)
  }
  configDirRun = configDirRun.then(() =>
    runPnpm(configPath, pnpmArgs, onData, onErr)
      .then(onClose, (err) => {
        onErr(err)
        onClose(-1)
      })
      .catch((err) => console.error(err))
  )
}

async function runPnpm(
  configPath: string,
  args: string[],
  onData: (output: any) => any,
  onErr: (err: Error) => any
): Promise<number> {
  const pnpm = getBundledPnpm()
  if (!semver.satisfies(process.versions.node, pnpm.node)) {
    throw new Error(
      `Installing plugins and webapps needs Node.js ${pnpm.node}, but the server runs on Node.js ${process.versions.node}`
    )
  }
  const finish = await setAsideForeignModules(configPath, await getStoreDir())
  const code = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [pnpm.bin, ...args], {
      cwd: configPath
    })
    attachHandlers(child, onData, onErr, resolve)
  })
  try {
    await finish(code)
  } catch (err) {
    onErr(err instanceof Error ? err : new Error(String(err)))
  }
  return code
}

// pnpm only adopts a node_modules directory that it created itself with the
// store it uses now: packages installed by npm are moved to
// node_modules/.ignored and a directory bound to another store stops the
// install. Such a directory is moved aside so that pnpm rebuilds it from
// package.json, with the installed plugin versions pinned there first so that
// the rebuild keeps them. If pnpm fails, both are put back as they were.
async function setAsideForeignModules(
  configPath: string,
  storeDir?: string
): Promise<(code: number) => Promise<void>> {
  const modulesDir = path.join(configPath, 'node_modules')
  const backupDir = path.join(configPath, PREVIOUS_MODULES_BACKUP)
  const discardedDir = path.join(configPath, DISCARDED_MODULES)
  // Left behind when removing the backup of a completed rebuild failed or was
  // cut short. Nothing needs it, so it does not hold up this run if it still
  // cannot be removed, as on Windows while the server has its addons loaded.
  await fs.promises
    .rm(discardedDir, { recursive: true, force: true })
    .catch(() => undefined)
  if (fs.existsSync(backupDir)) {
    if (isManagedByThisPnpm(modulesDir, storeDir)) {
      // pnpm writes its manifest only once every package is linked, so the
      // rebuild completed and only discarding the backup did not. Like the
      // removal above, that is retried on the next run if it fails again.
      await discardBackup(backupDir, discardedDir).catch(() => undefined)
    } else {
      // The rebuild did not complete: the backup holds the user's
      // installation and whatever the rebuild left behind is discarded
      await fs.promises.rm(modulesDir, { recursive: true, force: true })
      fs.renameSync(backupDir, modulesDir)
    }
  }
  if (!fs.existsSync(modulesDir) || isManagedByThisPnpm(modulesDir, storeDir)) {
    return async () => {}
  }
  const packageJsonPath = path.join(configPath, 'package.json')
  const originalPackageJson = fs.existsSync(packageJsonPath)
    ? fs.readFileSync(packageJsonPath, 'utf8')
    : undefined
  const restorePackageJson = () => {
    if (originalPackageJson !== undefined) {
      atomicWriteFileSync(packageJsonPath, originalPackageJson)
    }
  }
  pinInstalledVersions(configPath)
  try {
    fs.renameSync(modulesDir, backupDir)
  } catch (err) {
    restorePackageJson()
    throw err
  }
  return async (code: number) => {
    if (code === 0) {
      await discardBackup(backupDir, discardedDir)
    } else {
      await fs.promises.rm(modulesDir, { recursive: true, force: true })
      fs.renameSync(backupDir, modulesDir)
      restorePackageJson()
    }
  }
}

// Removal takes a while and can be cut short, so the backup is renamed first:
// a partial one must never be taken for the user's installation
async function discardBackup(backupDir: string, discardedDir: string) {
  fs.renameSync(backupDir, discardedDir)
  await fs.promises.rm(discardedDir, { recursive: true, force: true })
}

function isManagedByThisPnpm(modulesDir: string, storeDir?: string): boolean {
  const markerPath = path.join(modulesDir, PNPM_MODULES_MARKER)
  if (!fs.existsSync(markerPath)) {
    return false
  }
  const markedStore = readStoreDir(markerPath)
  return (
    !storeDir ||
    !markedStore ||
    path.resolve(markedStore) === path.resolve(storeDir)
  )
}

// The marker is JSON in current pnpm versions and YAML in older ones
function readStoreDir(markerPath: string): string | undefined {
  const contents = fs.readFileSync(markerPath, 'utf8')
  try {
    return JSON.parse(contents).storeDir
  } catch {
    return /^storeDir:\s*(.+?)\s*$/m.exec(contents)?.[1]
  }
}

// Rewrites the ranges in package.json to the versions found in node_modules
function pinInstalledVersions(configPath: string) {
  const packageJsonPath = path.join(configPath, 'package.json')
  const packageJson = readJson(packageJsonPath)
  const dependencies: Record<string, unknown> = packageJson?.dependencies ?? {}
  let changed = false
  for (const [name, range] of Object.entries(dependencies)) {
    const installed = readJson(
      path.join(configPath, 'node_modules', name, 'package.json')
    )?.version
    if (
      typeof range === 'string' &&
      typeof installed === 'string' &&
      installed !== range &&
      semver.validRange(range) &&
      semver.satisfies(installed, range)
    ) {
      dependencies[name] = installed
      changed = true
    }
  }
  if (changed) {
    atomicWriteFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n'
    )
  }
}

function attachHandlers(
  child: ChildProcess,
  onData: (output: any) => any,
  onErr: (err: Error) => any,
  onClose: (code: number) => any
) {
  // A process that fails to start emits both 'error' and 'close', but no
  // 'close' when an 'error' listener throws, so the 'error' handler ends the
  // run itself whatever the callback does
  let closed = false
  const close = (code: number) => {
    if (!closed) {
      closed = true
      onClose(code)
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onErr)
  child.on('close', close)
  child.on('error', (err: NodeJS.ErrnoException) => {
    try {
      onErr(err)
    } finally {
      close(-1)
    }
  })
}

function isTheServerModule(moduleName: string, config: Config) {
  return moduleName === config.name
}

const modulesByKeyword: Record<
  string,
  { time: number; packages: NpmModuleData[] }
> = {}

// Coalesces concurrent searches for the same keyword so parallel
// /appstore/available requests share one npm search instead of each
// paging through the registry on their own.
const searchInFlight: Map<string, Promise<NpmModuleData[]>> = new Map()

// Bumped by resetModuleCaches so a request that was already in flight
// cannot commit its result into the caches the reset emptied.
let cacheGeneration = 0

// Both caches above are module scope with a 60s TTL, which is what a running
// server wants. A test process runs many servers in sequence, so a suite that
// stubs the npm registry still reads whatever an earlier suite cached —
// stubbing replaces the transport, not the cached result. Reset between test
// servers, the same way requestResponse.resetRequests() is.
export function resetModuleCaches() {
  // A search or dist-tag fetch started before this call still resolves
  // afterwards — the appstore's background refresh is fire-and-forget and
  // outlives the server that scheduled it — and would write its result
  // into the caches this reset just emptied. Bump the generation so those
  // late writes are discarded instead.
  cacheGeneration++
  for (const keyword of Object.keys(modulesByKeyword)) {
    delete modulesByKeyword[keyword]
  }
  searchInFlight.clear()
  distTagsCache = { time: 0, data: {} }
  bundledPnpm = undefined
  storeDir = undefined
}

async function findModulesWithKeyword(
  keyword: string
): Promise<NpmModuleData[]> {
  const generation = cacheGeneration
  if (
    modulesByKeyword[keyword] &&
    Date.now() - modulesByKeyword[keyword].time < 60 * 1000
  ) {
    return modulesByKeyword[keyword].packages
  }

  const existing = searchInFlight.get(keyword)
  if (existing) {
    return existing
  }

  const search = (async () => {
    const moduleData = await searchByKeyword(keyword)
    npmDebug.enabled &&
      npmDebug(
        `npm search returned ${moduleData.length} modules with keyword ${keyword}`
      )

    // Map, not a plain object: package names like 'constructor' would
    // collide with Object.prototype keys
    const result = moduleData.reduce(
      (acc: Map<string, NpmModuleData>, module: NpmModuleData) => {
        const name = module.package.name
        const current = acc.get(name)
        if (
          !current ||
          semver.gt(module.package.version, current.package.version)
        ) {
          acc.set(name, module)
        }
        return acc
      },
      new Map<string, NpmModuleData>()
    )

    const packages = [...result.values()]
    if (generation === cacheGeneration) {
      modulesByKeyword[keyword] = { time: Date.now(), packages }
    }
    return packages
  })()
  searchInFlight.set(keyword, search)
  try {
    return await search
  } finally {
    // Only drop our own entry: a reset may have cleared the map and a
    // newer search may already have registered under this keyword.
    if (searchInFlight.get(keyword) === search) {
      searchInFlight.delete(keyword)
    }
  }
}

const NPM_SEARCH_TIMEOUT_MS = 60_000
const NPM_DIST_TAGS_TIMEOUT_MS = 20_000
const NPM_SEARCH_MAX_PAGES = 20

async function searchByKeyword(keyword: string): Promise<NpmModuleData[]> {
  let fetchedCount = 0
  let toFetchCount = 1
  let pageCount = 0
  let moduleData: NpmModuleData[] = []

  while (fetchedCount < toFetchCount && pageCount < NPM_SEARCH_MAX_PAGES) {
    pageCount++
    npmDebug(`searching ${keyword} from ${fetchedCount + 1} of ${toFetchCount}`)
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?size=250&from=${
        fetchedCount > 0 ? fetchedCount : 0
      }&text=keywords:${keyword}`,
      { signal: AbortSignal.timeout(NPM_SEARCH_TIMEOUT_MS) }
    )
    if (!res.ok) {
      npmDebug(`npm search failed with status ${res.status}: ${res.statusText}`)
      break
    }
    const parsed = (await res.json()) as NpmSearchResponse

    if (!Array.isArray(parsed?.objects) || parsed.objects.length === 0) {
      // npm's total is an estimate that can exceed what the search
      // actually delivers; treat an empty (or malformed) page as the
      // end instead of retrying the same offset forever
      npmDebug.enabled &&
        npmDebug(
          `npm search for ${keyword} ended early at ${fetchedCount} of ${toFetchCount}`
        )
      break
    }

    moduleData = moduleData.concat(
      parsed.objects.filter(
        (entry) =>
          typeof entry?.package?.name === 'string' &&
          semver.valid(entry.package.version) !== null
      )
    )
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
  const generation = cacheGeneration
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
          `https://registry.npmjs.org/-/package/${name}/dist-tags`,
          { signal: AbortSignal.timeout(NPM_DIST_TAGS_TIMEOUT_MS) }
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

  if (generation === cacheGeneration) {
    distTagsCache = { time: Date.now(), data: result }
  }
  return result
}

function doFetchDistTags() {
  return fetch(
    'https://registry.npmjs.org/-/package/signalk-server/dist-tags',
    {
      signal: AbortSignal.timeout(NPM_DIST_TAGS_TIMEOUT_MS)
    }
  )
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
  // Only use package.json's author field. npm maintainers and publisher
  // are publish-access identities (and OIDC sets publisher to "GitHub
  // Actions"), so falling back to them surfaces whoever happens to hold
  // publish rights as the "author" — not who wrote the package.
  const authorField = thePackage.author
  if (typeof authorField === 'string') return authorField
  return authorField?.name ?? ''
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
  runPackageManager,
  getPluginDataSize,
  resetModuleCaches,
  getBundledPnpm,
  bundledPnpmVersion,
  PREVIOUS_MODULES_BACKUP,
  DISCARDED_MODULES
}
