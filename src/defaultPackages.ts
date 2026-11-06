import { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import semver from 'semver'
import { atomicWriteFileSync } from './atomicWrite'
import { Config } from './config/config'
import { SERVERROUTESPREFIX } from './constants'
import { createDebug } from './debug'
import { getModulePaths, installModule, NpmOptions } from './modules'

const debug = createDebug('signalk:defaultPackages')

export const DEFAULT_PACKAGES_EVENT = 'DEFAULT_PACKAGES'
export const RESTART_REQUIRED_EVENT = 'RESTART_REQUIRED'
export const SKIP_DEFAULT_PACKAGES_ENV = 'SIGNALK_SKIP_DEFAULT_PACKAGES'

export type DefaultPackageState =
  'pending' | 'bundled' | 'installed' | 'declined'
export type DefaultPackageStates = Record<string, DefaultPackageState>
export type PackageVersions = Record<string, string>
export type PackageLocation = 'config' | 'server'

export interface ConfigPackageJson {
  dependencies?: PackageVersions
  signalkDefaultPackages?: DefaultPackageStates
  [key: string]: unknown
}

export interface ServerPackageJson {
  optionalDependencies?: PackageVersions
  signalk?: { defaultPackages?: PackageVersions }
}

export interface DefaultPackagesInput {
  defaults: PackageVersions
  bundled: ReadonlySet<string>
  states: DefaultPackageStates
  dependencies: PackageVersions
  freshConfig: boolean
  locate: (name: string) => PackageLocation | undefined
  outdated: (name: string, range: string) => boolean
}

export interface DefaultPackagesPlan {
  states: DefaultPackageStates
  install: PackageVersions
  offer: PackageVersions
}

export type DefaultPackagesStatus = 'offer' | 'installing' | 'failed' | 'done'

export interface DefaultPackagesEventData {
  status: DefaultPackagesStatus
  packages: PackageVersions
  failed?: PackageVersions
}

export interface RestartRequiredEventData {
  reason: 'defaultPackagesInstalled'
  packages: string[]
}

export function planDefaultPackages(
  input: DefaultPackagesInput
): DefaultPackagesPlan {
  const states: DefaultPackageStates = { ...input.states }
  const install: PackageVersions = {}
  const offer: PackageVersions = {}
  for (const [name, version] of Object.entries(input.defaults)) {
    const state = input.states[name]
    if (state === 'declined') {
      continue
    }
    const location = input.locate(name)
    const listed = input.dependencies[name] !== undefined
    // A bundled package can have left an older copy in the configuration
    // directory, which the bundled copy shadowed; without the bundled copy it
    // would become the one in use, so the default range is installed over it.
    const toInstall = state === 'bundled' || state === 'pending'
    if (
      location === 'config' &&
      listed &&
      !(toInstall && input.outdated(name, version))
    ) {
      states[name] = 'installed'
    } else if (state === 'installed') {
      if (!listed) {
        states[name] = location === 'server' ? 'bundled' : 'declined'
      }
    } else if (state === 'pending') {
      install[name] = version
    } else if (location === 'server') {
      states[name] = 'bundled'
    } else if (state === 'bundled') {
      states[name] = 'pending'
      install[name] = version
    } else if (input.bundled.has(name)) {
      states[name] = 'declined'
    } else if (input.freshConfig) {
      states[name] = 'pending'
      install[name] = version
    } else {
      offer[name] = version
    }
  }
  return { states, install, offer }
}

function packageVersion(dir: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, name, 'package.json'), 'utf-8')
    )
    return typeof pkg?.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

// Mirrors modulesWithKeyword, which loads the newer of the two copies.
function isOlder(version: string | undefined, other: string | undefined) {
  return (
    semver.valid(version) !== null &&
    semver.valid(other) !== null &&
    semver.gt(other as string, version as string)
  )
}

// 'config' when the copy in the configuration directory is the one the
// server loads, 'server' when only a copy that came with the server is.
export function locatePackage(
  config: Config,
  name: string
): PackageLocation | undefined {
  const [configModules, ...serverModules] = getModulePaths(config)
  const has = (dir: string) =>
    fs.existsSync(path.join(dir, name, 'package.json'))
  const serverDir = serverModules.find(has)
  if (
    config.configPath !== config.appPath &&
    has(configModules) &&
    !(
      serverDir &&
      isOlder(
        packageVersion(configModules, name),
        packageVersion(serverDir, name)
      )
    )
  ) {
    return 'config'
  }
  if (serverDir || has(configModules)) {
    return 'server'
  }
  return undefined
}

function isOutdated(config: Config, name: string, range: string) {
  const [configModules] = getModulePaths(config)
  const version = packageVersion(configModules, name)
  return (
    version !== undefined &&
    semver.valid(version) !== null &&
    semver.validRange(range) !== null &&
    semver.ltr(version, range)
  )
}

function configPackageJsonPath(config: Config) {
  return path.join(config.configPath, 'package.json')
}

function readConfigPackageJson(config: Config): ConfigPackageJson {
  const file = configPackageJsonPath(config)
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} does not hold a JSON object`)
  }
  return parsed as ConfigPackageJson
}

function writeConfigPackageJson(config: Config, pkg: ConfigPackageJson) {
  atomicWriteFileSync(
    configPackageJsonPath(config),
    JSON.stringify(pkg, null, 2) + '\n'
  )
}

function updateStates(config: Config, update: DefaultPackageStates) {
  const pkg = readConfigPackageJson(config)
  writeConfigPackageJson(config, {
    ...pkg,
    signalkDefaultPackages: { ...pkg.signalkDefaultPackages, ...update }
  })
}

function statesEqual(a: DefaultPackageStates, b: DefaultPackageStates) {
  const aKeys = Object.keys(a)
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => a[key] === b[key])
  )
}

export function createConfigPackageJson(
  configPath: string,
  template: object
): boolean {
  const configPackage = path.join(configPath, 'package.json')
  if (fs.existsSync(configPackage)) {
    return false
  }
  fs.writeFileSync(configPackage, JSON.stringify(template, null, 2))
  return true
}

export function prepareDefaultPackages(
  config: Config,
  serverPackageJson: ServerPackageJson,
  freshConfig: boolean
): DefaultPackagesPlan | undefined {
  if (process.env[SKIP_DEFAULT_PACKAGES_ENV] === 'true') {
    return undefined
  }
  const defaults = serverPackageJson.signalk?.defaultPackages ?? {}
  if (Object.keys(defaults).length === 0) {
    return undefined
  }
  try {
    const pkg = readConfigPackageJson(config)
    const states = pkg.signalkDefaultPackages ?? {}
    const plan = planDefaultPackages({
      defaults,
      bundled: new Set(
        Object.keys(serverPackageJson.optionalDependencies ?? {})
      ),
      states,
      dependencies: pkg.dependencies ?? {},
      freshConfig,
      locate: (name) => locatePackage(config, name),
      outdated: (name, range) => isOutdated(config, name, range)
    })
    if (!statesEqual(pkg.signalkDefaultPackages ?? {}, plan.states)) {
      writeConfigPackageJson(config, {
        ...pkg,
        signalkDefaultPackages: plan.states
      })
    }
    debug.enabled && debug('plan: ' + JSON.stringify(plan))
    return plan
  } catch (err) {
    console.error(
      `Default packages are left alone, ${configPackageJsonPath(config)} could not be updated:`,
      err
    )
    return undefined
  }
}

export interface DefaultPackagesApp {
  config: Config
  emit: (event: string, data: unknown) => boolean
  securityStrategy: {
    isDummy: () => boolean
    allowConfigure: (req: Request) => boolean
  }
  post: (path: string, handler: (req: Request, res: Response) => void) => void
  queueModuleInstall?: (
    name: string,
    version: string,
    options: { npm: NpmOptions; onClose: (code: number) => void }
  ) => void
}

function emitStatus(
  app: DefaultPackagesApp,
  status: DefaultPackagesStatus,
  packages: PackageVersions,
  failed: PackageVersions = {}
) {
  const data: DefaultPackagesEventData =
    Object.keys(failed).length > 0
      ? { status, packages, failed }
      : { status, packages }
  app.emit('serverevent', { type: DEFAULT_PACKAGES_EVENT, data })
}

// Installs one at a time so a package npm cannot resolve does not hold back
// the others, and offline first so a Docker image's npm cache or an earlier
// download is used without the network.
function installOne(
  app: DefaultPackagesApp,
  name: string,
  version: string,
  onClose: (code: number) => void
) {
  const npm: NpmOptions = { preferOffline: true }
  if (app.queueModuleInstall) {
    app.queueModuleInstall(name, version, { npm, onClose })
    return
  }
  const output: string[] = []
  installModule(
    app.config,
    name,
    version,
    (data) => output.push(String(data)),
    (err) => output.push(String(err)),
    (code) => {
      if (code !== 0) {
        console.error(`npm install ${name}@${version}:\n${output.join('')}`)
      }
      onClose(code)
    },
    npm
  )
}

// The state is read again before each install, because the Appstore can
// install or remove a package while the ones before it install.
function stillPending(config: Config, name: string, range: string): boolean {
  const pkg = readConfigPackageJson(config)
  if (pkg.signalkDefaultPackages?.[name] !== 'pending') {
    return false
  }
  if (
    locatePackage(config, name) === 'config' &&
    pkg.dependencies?.[name] !== undefined &&
    !isOutdated(config, name, range)
  ) {
    updateStates(config, { [name]: 'installed' })
    return false
  }
  return true
}

function installPackages(
  app: DefaultPackagesApp,
  packages: PackageVersions,
  onFinish?: (failed: PackageVersions) => void
) {
  emitStatus(app, 'installing', packages)
  app.config.defaultPackagesInstalling = true
  const entries = Object.entries(packages)
  const installed: string[] = []
  const failed: PackageVersions = {}
  const finish = () => {
    app.config.defaultPackagesInstalling = false
    if (installed.length > 0) {
      console.log(`Installed default packages ${installed.join(', ')}`)
      // Every package installed since the start waits for the same restart.
      const waiting = [
        ...(app.config.defaultPackagesInstalled ?? []),
        ...installed
      ]
      app.config.defaultPackagesInstalled = waiting
      const data: RestartRequiredEventData = {
        reason: 'defaultPackagesInstalled',
        packages: waiting
      }
      app.emit('serverevent', { type: RESTART_REQUIRED_EVENT, data })
    }
    if (Object.keys(failed).length > 0) {
      console.error(
        `Installing default packages ${Object.keys(failed).join(', ')} failed, they are tried again on the next start`
      )
      emitStatus(app, 'failed', failed)
    } else {
      emitStatus(app, 'done', packages)
    }
    onFinish?.(failed)
  }
  const next = (index: number) => {
    if (index === entries.length) {
      finish()
      return
    }
    const [name, version] = entries[index]
    let pending: boolean
    try {
      pending = stillPending(app.config, name, version)
    } catch (err) {
      console.error(`Could not read the state of ${name}:`, err)
      failed[name] = version
      pending = false
    }
    if (!pending) {
      next(index + 1)
      return
    }
    installOne(app, name, version, (code) => {
      if (code === 0) {
        installed.push(name)
        markInstalled(app.config, name)
      } else {
        failed[name] = version
      }
      next(index + 1)
    })
  }
  next(0)
}

function markInstalled(config: Config, name: string) {
  try {
    const pkg = readConfigPackageJson(config)
    if (pkg.signalkDefaultPackages?.[name] === 'pending') {
      updateStates(config, { [name]: 'installed' })
    }
  } catch (err) {
    console.error(`Could not record ${name} as installed:`, err)
  }
}

export function startDefaultPackages(app: DefaultPackagesApp) {
  const plan = app.config.defaultPackagesPlan
  if (!plan) {
    return
  }
  app.config.defaultPackagesPlan = undefined
  // The offer carries a failed startup install, which it would otherwise
  // replace as the last status before the user could see it.
  const offer = (failed: PackageVersions = {}) => {
    if (Object.keys(plan.offer).length > 0) {
      app.config.defaultPackagesOffer = plan.offer
      emitStatus(app, 'offer', plan.offer, failed)
    }
  }
  // The offer waits for the startup install, so that a choice never runs npm
  // in the configuration directory while that install is still running.
  if (Object.keys(plan.install).length > 0) {
    installPackages(app, plan.install, offer)
  } else {
    offer()
  }
}

function chooseOffered(
  config: Config,
  offer: PackageVersions,
  chosen: ReadonlySet<string>
): PackageVersions {
  const pkg = readConfigPackageJson(config)
  const update: DefaultPackageStates = {}
  const install: PackageVersions = {}
  for (const [name, version] of Object.entries(offer)) {
    if (!chosen.has(name)) {
      update[name] = 'declined'
    } else if (
      locatePackage(config, name) === 'config' &&
      pkg.dependencies?.[name] !== undefined &&
      !isOutdated(config, name, version)
    ) {
      update[name] = 'installed'
    } else {
      update[name] = 'pending'
      install[name] = version
    }
  }
  updateStates(config, update)
  return install
}

export function registerDefaultPackagesRoutes(app: DefaultPackagesApp) {
  app.post(
    `${SERVERROUTESPREFIX}/appstore/defaultPackages`,
    (req: Request, res: Response) => {
      if (
        !app.securityStrategy.isDummy() &&
        !app.securityStrategy.allowConfigure(req)
      ) {
        res.status(401).json('Not allowed')
        return
      }
      const offer = app.config.defaultPackagesOffer
      if (!offer) {
        res.status(409).json('No default packages are on offer')
        return
      }
      const chosen: unknown = req.body?.install
      if (
        !Array.isArray(chosen) ||
        !chosen.every(
          (name) => typeof name === 'string' && Object.hasOwn(offer, name)
        )
      ) {
        res.status(400).json('install must list offered package names')
        return
      }
      let install: PackageVersions
      try {
        install = chooseOffered(app.config, offer, new Set<string>(chosen))
      } catch (err) {
        console.error('Could not record the default packages choice:', err)
        res.status(500).json('Could not record the choice')
        return
      }
      app.config.defaultPackagesOffer = undefined
      if (Object.keys(install).length > 0) {
        installPackages(app, install)
      } else {
        emitStatus(app, 'done', {})
      }
      res.json({ installing: Object.keys(install) })
    }
  )
}
