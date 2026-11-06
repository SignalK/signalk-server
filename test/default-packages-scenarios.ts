import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { Request, Response } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import semver from 'semver'
import { Config } from '../src/config/config'
import {
  ConfigPackageJson,
  createConfigPackageJson,
  PackageVersions,
  prepareDefaultPackages,
  registerDefaultPackagesRoutes,
  ServerPackageJson,
  SKIP_DEFAULT_PACKAGES_ENV,
  DEFAULT_CONFIG_DIR_ENV,
  startDefaultPackages
} from '../src/defaultPackages'
import { removeModule } from '../src/modules'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

const KIP = '@mxtommy/kip'
const FREEBOARD = '@signalk/freeboard-sk'
const TO_N2K = 'signalk-to-nmea2000'
const DEFAULTS: PackageVersions = {
  [KIP]: '^4.8.0',
  [FREEBOARD]: '^3.2.1',
  [TO_N2K]: '^2.24.0'
}
const TEMPLATE = { name: 'signalk-server-config', version: '0.0.1' }

const bundlingRelease = (defaults = DEFAULTS): ServerPackageJson => ({
  optionalDependencies: { ...defaults },
  signalk: { defaultPackages: defaults }
})
const unbundledRelease = (defaults = DEFAULTS): ServerPackageJson => ({
  signalk: { defaultPackages: defaults }
})

interface ServerEvent {
  type: string
  data: { status?: string; packages?: unknown }
}

interface StartResult {
  events: ServerEvent[]
  npmRuns: string[][]
  post: (install: unknown) => { status: number; body: unknown }
}

describe('default packages over the life of an installation', () => {
  let appDir: string
  let configDir: string
  let config: Config
  let npmFails: boolean
  let failing: Set<string>
  let npmRuns: string[][]
  let originalSpawn: typeof childProcess.spawn
  let originalSkip: string | undefined

  const configPackageJsonPath = () => path.join(configDir, 'package.json')
  const readConfigPackageJson = (): ConfigPackageJson =>
    JSON.parse(fs.readFileSync(configPackageJsonPath(), 'utf-8'))
  const writeConfigPackageJson = (pkg: ConfigPackageJson) =>
    fs.writeFileSync(configPackageJsonPath(), JSON.stringify(pkg, null, 2))

  const writeModule = (dir: string, name: string, version = '1.0.0') => {
    const moduleDir = path.join(dir, 'node_modules', name)
    fs.mkdirSync(moduleDir, { recursive: true })
    fs.writeFileSync(
      path.join(moduleDir, 'package.json'),
      JSON.stringify({ name, version })
    )
  }
  const removeModuleDir = (dir: string, name: string) =>
    fs.rmSync(path.join(dir, 'node_modules', name), {
      recursive: true,
      force: true
    })
  const isInConfigDir = (name: string) =>
    fs.existsSync(path.join(configDir, 'node_modules', name, 'package.json'))

  function bundleWithServer(names: string[]) {
    fs.rmSync(path.join(appDir, 'node_modules'), {
      recursive: true,
      force: true
    })
    for (const name of names) {
      writeModule(appDir, name)
    }
  }

  function fakeNpm(_cmd: string, args: string[], opts: { cwd: string }) {
    npmRuns.push(args)
    const command = args.includes('remove') ? 'remove' : 'install'
    const separator = args.indexOf('--')
    const named = separator >= 0 ? args[separator + 1] : undefined
    const at = named ? named.lastIndexOf('@') : -1
    const name = named && at > 0 ? named.slice(0, at) : named
    const fails = npmFails || (name !== undefined && failing.has(name))
    if (!fails) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(opts.cwd, 'package.json'), 'utf-8')
      )
      if (command === 'remove' && name) {
        removeModuleDir(opts.cwd, name)
        delete pkg.dependencies?.[name]
      } else if (name) {
        writeModule(opts.cwd, name)
        pkg.dependencies = { ...pkg.dependencies, [name]: named!.slice(at + 1) }
      } else {
        for (const dependency of Object.keys(pkg.dependencies ?? {})) {
          writeModule(opts.cwd, dependency)
        }
      }
      fs.writeFileSync(
        path.join(opts.cwd, 'package.json'),
        JSON.stringify(pkg, null, 2)
      )
    }
    return {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(fails ? 1 : 0)
      }
    } as unknown as ChildProcess
  }

  function startServer(serverPackageJson: ServerPackageJson): StartResult {
    const freshConfig = createConfigPackageJson(configDir, TEMPLATE)
    const runsBefore = npmRuns.length
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      freshConfig
    )
    const events: ServerEvent[] = []
    let handler: ((req: Request, res: Response) => void) | undefined
    const app = {
      config,
      emit: (event: string, data: unknown) => {
        if (event === 'serverevent') {
          events.push(data as ServerEvent)
        }
        return true
      },
      securityStrategy: { isDummy: () => false, allowConfigure: () => true },
      post: (_path: string, h: (req: Request, res: Response) => void) => {
        handler = h
      }
    }
    config.defaultPackagesOffer = undefined
    config.defaultPackagesInstalled = undefined
    registerDefaultPackagesRoutes(app)
    startDefaultPackages(app)
    const post = (install: unknown) => {
      const res = {
        status: 200,
        body: undefined as unknown
      }
      const response = {
        status(code: number) {
          res.status = code
          return this
        },
        json(value: unknown) {
          res.body = value
          return this
        }
      }
      handler!(
        { body: { install } } as Request,
        response as unknown as Response
      )
      return res
    }
    return {
      events,
      get npmRuns() {
        return npmRuns.slice(runsBefore)
      },
      post
    }
  }

  const eventTypes = (result: StartResult) => result.events.map((e) => e.type)
  const states = () => readConfigPackageJson().signalkDefaultPackages
  const restartPackages = (result: StartResult) =>
    result.events.find((e) => e.type === 'RESTART_REQUIRED')?.data.packages

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-scenario-app-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-scenario-config-'))
    config = { appPath: appDir, configPath: configDir } as Config
    npmFails = false
    failing = new Set()
    npmRuns = []
    originalSpawn = childProcess.spawn
    childProcess.spawn = fakeNpm
    originalSkip = process.env[SKIP_DEFAULT_PACKAGES_ENV]
    delete process.env[SKIP_DEFAULT_PACKAGES_ENV]
  })

  afterEach(() => {
    childProcess.spawn = originalSpawn
    delete process.env[DEFAULT_CONFIG_DIR_ENV]
    if (originalSkip === undefined) {
      delete process.env[SKIP_DEFAULT_PACKAGES_ENV]
    } else {
      process.env[SKIP_DEFAULT_PACKAGES_ENV] = originalSkip
    }
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  describe('fresh installs', () => {
    it('installs every default once and asks for a restart', () => {
      const first = startServer(unbundledRelease())
      expect(first.npmRuns).to.have.length(3)
      expect(
        first.npmRuns.every((args) => args.includes('--prefer-offline'))
      ).to.equal(true)
      expect(restartPackages(first)).to.deep.equal([KIP, FREEBOARD, TO_N2K])
      expect(readConfigPackageJson().dependencies).to.deep.equal(DEFAULTS)
      expect(Object.keys(DEFAULTS).every(isInConfigDir)).to.equal(true)

      const second = startServer(unbundledRelease())
      expect(second.npmRuns).to.have.length(0)
      expect(second.events).to.deep.equal([])
    })

    it('only records defaults the server still bundles', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      const result = startServer(bundlingRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(result.events).to.deep.equal([])
      expect(states()).to.deep.equal({
        [KIP]: 'bundled',
        [FREEBOARD]: 'bundled',
        [TO_N2K]: 'bundled'
      })
      expect(readConfigPackageJson().dependencies).to.equal(undefined)
    })

    it('records defaults omitted with --omit=optional as declined', () => {
      bundleWithServer([KIP])
      const result = startServer(bundlingRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(states()).to.deep.equal({
        [KIP]: 'bundled',
        [FREEBOARD]: 'declined',
        [TO_N2K]: 'declined'
      })
    })

    function dockerImage(edition: 'full' | 'core') {
      const seedDir = path.join(appDir, 'default-config')
      fs.mkdirSync(seedDir, { recursive: true })
      fs.writeFileSync(path.join(seedDir, '.npmrc'), 'package-lock=false\n')
      const state = edition === 'full' ? 'installed' : 'declined'
      const pkg: ConfigPackageJson = {
        ...TEMPLATE,
        dependencies: edition === 'full' ? DEFAULTS : {},
        signalkDefaultPackages: {
          [KIP]: state,
          [FREEBOARD]: state,
          [TO_N2K]: state
        }
      }
      fs.writeFileSync(path.join(seedDir, 'package.json'), JSON.stringify(pkg))
      if (edition === 'full') {
        for (const name of Object.keys(DEFAULTS)) {
          writeModule(seedDir, name)
        }
      }
      process.env[DEFAULT_CONFIG_DIR_ENV] = seedDir
    }

    it('uses the packages a full Docker image ships', () => {
      dockerImage('full')
      const result = startServer(unbundledRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(result.events).to.deep.equal([])
      expect(isInConfigDir(KIP)).to.equal(true)
      expect(states()).to.deep.equal({
        [KIP]: 'installed',
        [FREEBOARD]: 'installed',
        [TO_N2K]: 'installed'
      })
    })

    it('installs nothing from the record a core Docker image ships', () => {
      dockerImage('core')
      const result = startServer(unbundledRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(result.events).to.deep.equal([])
      expect(readConfigPackageJson().dependencies).to.deep.equal({})
    })

    it('keeps files already in a mounted config directory', () => {
      dockerImage('full')
      fs.writeFileSync(path.join(configDir, '.npmrc'), 'registry=local\n')
      startServer(unbundledRelease())
      expect(fs.readFileSync(path.join(configDir, '.npmrc'), 'utf-8')).to.equal(
        'registry=local\n'
      )
      expect(isInConfigDir(KIP)).to.equal(true)
    })

    it('does not copy the image defaults into an existing configuration', () => {
      writeConfigPackageJson({ ...TEMPLATE, signalkDefaultPackages: {} })
      dockerImage('full')
      startServer(unbundledRelease())
      expect(isInConfigDir(KIP)).to.equal(false)
    })

    it('installs what a full image ships into a volume from an older image', () => {
      writeConfigPackageJson(TEMPLATE)
      dockerImage('full')
      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(3)
      expect(
        upgraded.npmRuns.every((args) => args.includes('--prefer-offline'))
      ).to.equal(true)
      expect(upgraded.events.map((e) => e.data.status)).to.not.include('offer')
      expect(upgraded.events[0].data.status).to.equal('installing')
      expect(restartPackages(upgraded)).to.deep.equal([KIP, FREEBOARD, TO_N2K])

      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(restarted.events).to.deep.equal([])
    })

    it('declines what a core image leaves out in a volume from an older image', () => {
      writeConfigPackageJson(TEMPLATE)
      dockerImage('core')
      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(0)
      expect(upgraded.events).to.deep.equal([])
      expect(Object.values(states() ?? {})).to.deep.equal([
        'declined',
        'declined',
        'declined'
      ])
    })

    it('does nothing at all when turned off', () => {
      dockerImage('full')
      process.env[SKIP_DEFAULT_PACKAGES_ENV] = 'true'
      const result = startServer(unbundledRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(result.events).to.deep.equal([])
      expect(readConfigPackageJson()).to.deep.equal(TEMPLATE)
    })
  })

  describe('offline first start', () => {
    it('reports the failure and retries on the next start until it succeeds', () => {
      npmFails = true
      const first = startServer(unbundledRelease())
      expect(first.npmRuns).to.have.length(3)
      expect(eventTypes(first)).to.deep.equal([
        'DEFAULT_PACKAGES',
        'DEFAULT_PACKAGES'
      ])
      expect(first.events[1].data.status).to.equal('failed')
      expect(readConfigPackageJson().dependencies).to.equal(undefined)
      expect(states()?.[KIP]).to.equal('pending')

      const stillOffline = startServer(unbundledRelease())
      expect(stillOffline.npmRuns).to.have.length(3)
      expect(stillOffline.events[1].data.status).to.equal('failed')

      npmFails = false
      const online = startServer(unbundledRelease())
      expect(online.npmRuns).to.have.length(3)
      expect(restartPackages(online)).to.deep.equal([KIP, FREEBOARD, TO_N2K])
      expect(states()).to.deep.equal({
        [KIP]: 'installed',
        [FREEBOARD]: 'installed',
        [TO_N2K]: 'installed'
      })

      const later = startServer(unbundledRelease())
      expect(later.npmRuns).to.have.length(0)
      expect(later.events).to.deep.equal([])
    })

    it('does not retry a default removed while it was still pending', () => {
      npmFails = true
      startServer(unbundledRelease())
      npmFails = false
      removeModule(
        config,
        KIP,
        null,
        () => {},
        () => {},
        () => {}
      )
      expect(states()?.[KIP]).to.equal('declined')

      const online = startServer(unbundledRelease())
      expect(restartPackages(online)).to.deep.equal([FREEBOARD, TO_N2K])
      expect(isInConfigDir(KIP)).to.equal(false)
    })

    it('records a pending default as installed once the user installs it', () => {
      npmFails = true
      startServer(unbundledRelease())
      npmFails = false
      for (const [name, range] of Object.entries(DEFAULTS)) {
        writeModule(configDir, name, semver.minVersion(range)!.version)
      }
      writeConfigPackageJson({
        ...readConfigPackageJson(),
        dependencies: DEFAULTS
      })
      const next = startServer(unbundledRelease())
      expect(next.npmRuns).to.have.length(0)
      expect(states()?.[FREEBOARD]).to.equal('installed')
    })

    it('installs again a default an interrupted install left half done', () => {
      npmFails = true
      startServer(unbundledRelease())
      npmFails = false
      writeModule(configDir, KIP)
      const next = startServer(unbundledRelease())
      expect(next.npmRuns).to.have.length(3)
      expect(states()?.[KIP]).to.equal('installed')
    })

    it('installs the others when one default cannot be installed', () => {
      failing = new Set([KIP])
      const first = startServer(unbundledRelease())
      expect(restartPackages(first)).to.deep.equal([FREEBOARD, TO_N2K])
      expect(first.events.at(-1)?.data).to.deep.equal({
        status: 'failed',
        packages: { [KIP]: DEFAULTS[KIP] }
      })

      failing = new Set()
      const next = startServer(unbundledRelease())
      expect(next.npmRuns).to.have.length(1)
      expect(restartPackages(next)).to.deep.equal([KIP])
    })
  })

  describe('upgrades', () => {
    it('installs once what the user had when the server stops bundling it', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      startServer(bundlingRelease())

      bundleWithServer([])
      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(3)
      expect(restartPackages(upgraded)).to.deep.equal([KIP, FREEBOARD, TO_N2K])
      expect(Object.keys(DEFAULTS).every(isInConfigDir)).to.equal(true)

      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(restarted.events).to.deep.equal([])
    })

    it('never installs a default the user left out', () => {
      bundleWithServer([KIP])
      startServer(bundlingRelease())

      bundleWithServer([])
      const upgraded = startServer(unbundledRelease())
      expect(restartPackages(upgraded)).to.deep.equal([KIP])
      expect(isInConfigDir(FREEBOARD)).to.equal(false)
      expect(isInConfigDir(TO_N2K)).to.equal(false)
    })

    it('keeps a default the user already installed from the Appstore', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      writeConfigPackageJson({ ...TEMPLATE, dependencies: { [KIP]: '5.0.0' } })
      writeModule(configDir, KIP, '5.0.0')
      startServer(bundlingRelease())

      bundleWithServer([])
      const upgraded = startServer(unbundledRelease())
      expect(restartPackages(upgraded)).to.deep.equal([FREEBOARD, TO_N2K])
      expect(readConfigPackageJson().dependencies?.[KIP]).to.equal('5.0.0')
    })

    it('asks once when an older server left no record', () => {
      writeConfigPackageJson(TEMPLATE)
      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(0)
      expect(upgraded.events).to.deep.equal([
        {
          type: 'DEFAULT_PACKAGES',
          data: { status: 'offer', packages: DEFAULTS }
        }
      ])

      const chosen = upgraded.post([KIP, TO_N2K])
      expect(chosen.body).to.deep.equal({ installing: [KIP, TO_N2K] })
      expect(states()).to.deep.equal({
        [KIP]: 'installed',
        [FREEBOARD]: 'declined',
        [TO_N2K]: 'installed'
      })
      expect(isInConfigDir(KIP)).to.equal(true)
      expect(isInConfigDir(FREEBOARD)).to.equal(false)
      expect(restartPackages(upgraded)).to.deep.equal([KIP, TO_N2K])
      expect(upgraded.post([]).status).to.equal(409)

      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(restarted.events).to.deep.equal([])
    })

    it('records every default as declined when the user installs none', () => {
      writeConfigPackageJson(TEMPLATE)
      const upgraded = startServer(unbundledRelease())
      upgraded.post([])
      expect(upgraded.npmRuns).to.have.length(0)
      expect(eventTypes(upgraded)).to.not.include('RESTART_REQUIRED')
      expect(Object.values(states() ?? {})).to.deep.equal([
        'declined',
        'declined',
        'declined'
      ])
      expect(startServer(unbundledRelease()).events).to.deep.equal([])
    })

    it('keeps asking until the user answers the offer', () => {
      writeConfigPackageJson(TEMPLATE)
      startServer(unbundledRelease())
      const again = startServer(unbundledRelease())
      expect(again.events[0].data.status).to.equal('offer')
    })

    it('offers a default added by a later server to existing installations', () => {
      startServer(unbundledRelease({ [KIP]: DEFAULTS[KIP] }))
      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(0)
      expect(upgraded.events[0].data).to.deep.equal({
        status: 'offer',
        packages: {
          [FREEBOARD]: DEFAULTS[FREEBOARD],
          [TO_N2K]: DEFAULTS[TO_N2K]
        }
      })
    })

    it('leaves a default the server no longer lists where it is', () => {
      startServer(unbundledRelease())
      const upgraded = startServer(unbundledRelease({ [KIP]: DEFAULTS[KIP] }))
      expect(upgraded.npmRuns).to.have.length(0)
      expect(isInConfigDir(FREEBOARD)).to.equal(true)
      expect(states()?.[FREEBOARD]).to.equal('installed')
    })
  })

  describe('removals', () => {
    function removeFromAppstore(name: string) {
      removeModule(
        config,
        name,
        null,
        () => {},
        () => {},
        () => {}
      )
    }

    it('never reinstalls a default removed in the Appstore', () => {
      startServer(unbundledRelease())
      removeFromAppstore(FREEBOARD)
      expect(isInConfigDir(FREEBOARD)).to.equal(false)
      expect(states()?.[FREEBOARD]).to.equal('declined')

      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(isInConfigDir(FREEBOARD)).to.equal(false)
    })

    it('keeps a removed default out across a later upgrade', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      startServer(bundlingRelease())
      bundleWithServer([])
      startServer(unbundledRelease())
      removeFromAppstore(KIP)

      const upgraded = startServer(unbundledRelease())
      expect(upgraded.npmRuns).to.have.length(0)
      expect(isInConfigDir(KIP)).to.equal(false)
    })

    it('keeps a default whose Appstore copy is removed while the server bundles it', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      writeModule(configDir, KIP)
      writeConfigPackageJson({ dependencies: { [KIP]: DEFAULTS[KIP] } })
      startServer(bundlingRelease())
      expect(states()?.[KIP]).to.equal('installed')
      removeFromAppstore(KIP)
      expect(states()?.[KIP]).to.equal('bundled')

      bundleWithServer([])
      const upgraded = startServer(unbundledRelease())
      expect(restartPackages(upgraded)).to.include(KIP)
      expect(isInConfigDir(KIP)).to.equal(true)
    })

    it('leaves other packages alone when a non-default is removed', () => {
      startServer(unbundledRelease())
      writeConfigPackageJson({
        ...readConfigPackageJson(),
        dependencies: {
          ...readConfigPackageJson().dependencies,
          other: '1.0.0'
        }
      })
      writeModule(configDir, 'other')
      const before = states()
      removeFromAppstore('other')
      expect(states()).to.deep.equal(before)
    })
  })

  describe('changes made by the user', () => {
    it('keeps a version the user pinned in package.json', () => {
      startServer(unbundledRelease())
      writeConfigPackageJson({
        ...readConfigPackageJson(),
        dependencies: {
          ...readConfigPackageJson().dependencies,
          [KIP]: '4.9.1'
        }
      })
      startServer(unbundledRelease())
      expect(readConfigPackageJson().dependencies?.[KIP]).to.equal('4.9.1')
    })

    it('keeps other fields and packages the user added', () => {
      startServer(unbundledRelease())
      writeConfigPackageJson({
        ...readConfigPackageJson(),
        description: 'my boat',
        dependencies: {
          ...readConfigPackageJson().dependencies,
          'signalk-other-plugin': '1.0.0'
        }
      })
      startServer(unbundledRelease())
      const pkg = readConfigPackageJson()
      expect(pkg.description).to.equal('my boat')
      expect(pkg.dependencies?.['signalk-other-plugin']).to.equal('1.0.0')
    })

    it('never reinstalls a default the user removed with npm', () => {
      startServer(unbundledRelease())
      removeModuleDir(configDir, KIP)
      const pkg = readConfigPackageJson()
      delete pkg.dependencies?.[KIP]
      writeConfigPackageJson(pkg)

      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(states()?.[KIP]).to.equal('declined')
      expect(startServer(unbundledRelease()).npmRuns).to.have.length(0)
    })

    it('does not reinstall a default whose files the user deleted by hand', () => {
      startServer(unbundledRelease())
      removeModuleDir(configDir, KIP)
      const restarted = startServer(unbundledRelease())
      expect(restarted.npmRuns).to.have.length(0)
      expect(readConfigPackageJson().dependencies?.[KIP]).to.equal(
        DEFAULTS[KIP]
      )
    })

    it('treats a default the user marked declined by hand as declined', () => {
      bundleWithServer(Object.keys(DEFAULTS))
      startServer(bundlingRelease())
      writeConfigPackageJson({
        ...readConfigPackageJson(),
        signalkDefaultPackages: { ...states(), [TO_N2K]: 'declined' }
      })
      bundleWithServer([])
      const upgraded = startServer(unbundledRelease())
      expect(restartPackages(upgraded)).to.deep.equal([KIP, FREEBOARD])
    })

    it('leaves an unreadable package.json untouched', () => {
      fs.writeFileSync(configPackageJsonPath(), '{ not json')
      const result = startServer(unbundledRelease())
      expect(result.npmRuns).to.have.length(0)
      expect(fs.readFileSync(configPackageJsonPath(), 'utf-8')).to.equal(
        '{ not json'
      )
    })
  })
})
