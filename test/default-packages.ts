import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { Request, Response } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Config } from '../src/config/config'
import {
  ConfigPackageJson,
  DefaultPackagesApp,
  DefaultPackagesInput,
  planDefaultPackages,
  prepareDefaultPackages,
  registerDefaultPackagesRoutes,
  SKIP_DEFAULT_PACKAGES_ENV,
  startDefaultPackages
} from '../src/defaultPackages'
import {
  installModule,
  markDefaultPackageRemoved,
  removeModule
} from '../src/modules'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

type SpawnMock = (
  command: string,
  args: string[],
  options?: { shell?: boolean }
) => ChildProcess

const KIP = '@mxtommy/kip'
const FREEBOARD = '@signalk/freeboard-sk'
const DEFAULTS = { [KIP]: '^4.8.0', [FREEBOARD]: '^3.2.1' }

function input(overrides: Partial<DefaultPackagesInput>): DefaultPackagesInput {
  return {
    defaults: DEFAULTS,
    bundled: new Set(),
    states: {},
    dependencies: {},
    freshConfig: false,
    locate: () => undefined,
    outdated: () => false,
    ...overrides
  }
}

describe('planDefaultPackages', () => {
  it('installs every missing default into a fresh configuration', () => {
    const plan = planDefaultPackages(input({ freshConfig: true }))
    expect(plan.install).to.deep.equal(DEFAULTS)
    expect(plan.offer).to.deep.equal({})
    expect(plan.states).to.deep.equal({
      [KIP]: 'pending',
      [FREEBOARD]: 'pending'
    })
  })

  it('records a default installed in the configuration without installing it', () => {
    const plan = planDefaultPackages(
      input({
        freshConfig: true,
        dependencies: { [KIP]: '5.0.0' },
        locate: (name) => (name === KIP ? 'config' : undefined)
      })
    )
    expect(plan.install).to.deep.equal({ [FREEBOARD]: DEFAULTS[FREEBOARD] })
    expect(plan.states[KIP]).to.equal('installed')
  })

  it('records a default the server bundles as bundled', () => {
    const plan = planDefaultPackages(
      input({
        freshConfig: true,
        locate: (name) => (name === KIP ? 'server' : undefined)
      })
    )
    expect(plan.install).to.deep.equal({ [FREEBOARD]: DEFAULTS[FREEBOARD] })
    expect(plan.states[KIP]).to.equal('bundled')
  })

  it('records a bundled default the user omitted as declined', () => {
    const plan = planDefaultPackages(
      input({
        bundled: new Set([KIP, FREEBOARD]),
        locate: (name) => (name === KIP ? 'server' : undefined)
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.offer).to.deep.equal({})
    expect(plan.states).to.deep.equal({
      [KIP]: 'bundled',
      [FREEBOARD]: 'declined'
    })
  })

  it('installs once a bundled default the server no longer ships', () => {
    const plan = planDefaultPackages(
      input({ states: { [KIP]: 'bundled', [FREEBOARD]: 'declined' } })
    )
    expect(plan.install).to.deep.equal({ [KIP]: DEFAULTS[KIP] })
    expect(plan.states[KIP]).to.equal('pending')
    expect(plan.offer).to.deep.equal({})
  })

  it('declines an installed default the user removed with npm', () => {
    const plan = planDefaultPackages(input({ states: { [KIP]: 'installed' } }))
    expect(plan.install).to.deep.equal({})
    expect(plan.states[KIP]).to.equal('declined')
  })

  it('keeps a default as bundled when only the copy in the configuration was removed', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'installed', [FREEBOARD]: 'declined' },
        locate: () => 'server'
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.states[KIP]).to.equal('bundled')
  })

  it('installs the default over an older copy that a bundled copy shadowed', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'bundled', [FREEBOARD]: 'declined' },
        dependencies: { [KIP]: '4.0.0' },
        locate: () => 'config',
        outdated: (name, range) => name === KIP && range === DEFAULTS[KIP]
      })
    )
    expect(plan.install).to.deep.equal({ [KIP]: DEFAULTS[KIP] })
    expect(plan.states[KIP]).to.equal('pending')
  })

  it('installs the default over an older copy a pending install left listed', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'pending', [FREEBOARD]: 'declined' },
        dependencies: { [KIP]: '4.0.0' },
        locate: () => 'config',
        outdated: (name) => name === KIP
      })
    )
    expect(plan.install).to.deep.equal({ [KIP]: DEFAULTS[KIP] })
  })

  it('records a bundled default whose copy in the configuration is current', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'bundled', [FREEBOARD]: 'declined' },
        dependencies: { [KIP]: '5.0.0' },
        locate: () => 'config'
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.states[KIP]).to.equal('installed')
  })

  it('does not reinstall a recorded default still in the dependencies', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'installed', [FREEBOARD]: 'installed' },
        dependencies: { [KIP]: '^4.8.0', [FREEBOARD]: '^3.2.1' }
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.states).to.deep.equal({
      [KIP]: 'installed',
      [FREEBOARD]: 'installed'
    })
  })

  it('installs again a pending default an interrupted install left behind', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'pending', [FREEBOARD]: 'declined' },
        locate: () => 'config'
      })
    )
    expect(plan.install).to.deep.equal({ [KIP]: DEFAULTS[KIP] })
  })

  it('records a pending default the user installed meanwhile', () => {
    const plan = planDefaultPackages(
      input({
        states: { [KIP]: 'pending', [FREEBOARD]: 'declined' },
        dependencies: { [KIP]: '5.0.0' },
        locate: () => 'config'
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.states[KIP]).to.equal('installed')
  })

  it('never touches a declined default', () => {
    const plan = planDefaultPackages(
      input({
        freshConfig: true,
        states: { [KIP]: 'declined', [FREEBOARD]: 'declined' },
        locate: () => 'server'
      })
    )
    expect(plan.install).to.deep.equal({})
    expect(plan.offer).to.deep.equal({})
    expect(plan.states).to.deep.equal({
      [KIP]: 'declined',
      [FREEBOARD]: 'declined'
    })
  })

  it('offers unrecorded defaults to an existing configuration', () => {
    const plan = planDefaultPackages(input({}))
    expect(plan.install).to.deep.equal({})
    expect(plan.offer).to.deep.equal(DEFAULTS)
    expect(plan.states).to.deep.equal({})
  })
})

describe('markDefaultPackageRemoved', () => {
  it('declines an installed default so it is not reinstalled', () => {
    const pkg: ConfigPackageJson = {
      signalkDefaultPackages: { [KIP]: 'installed' }
    }
    expect(markDefaultPackageRemoved(pkg, KIP, false)).to.equal(true)
    expect(pkg.signalkDefaultPackages).to.deep.equal({ [KIP]: 'declined' })
  })

  it('declines a bundled default so it is not installed after an upgrade', () => {
    const pkg: ConfigPackageJson = {
      signalkDefaultPackages: { [KIP]: 'bundled' }
    }
    expect(markDefaultPackageRemoved(pkg, KIP, false)).to.equal(true)
    expect(pkg.signalkDefaultPackages).to.deep.equal({ [KIP]: 'declined' })
  })

  it('keeps a default whose bundled copy is still in use as bundled', () => {
    const pkg: ConfigPackageJson = {
      signalkDefaultPackages: { [KIP]: 'installed' }
    }
    expect(markDefaultPackageRemoved(pkg, KIP, true)).to.equal(true)
    expect(pkg.signalkDefaultPackages).to.deep.equal({ [KIP]: 'bundled' })
  })

  it('leaves packages that are not defaults alone', () => {
    const pkg: ConfigPackageJson = { dependencies: { other: '1.0.0' } }
    expect(markDefaultPackageRemoved(pkg, 'other', false)).to.equal(false)
    expect(pkg).to.deep.equal({ dependencies: { other: '1.0.0' } })
  })
})

describe('default packages in the config directory', () => {
  let appDir: string
  let configDir: string
  let config: Config
  let originalSkip: string | undefined
  let originalSpawn: SpawnMock
  let spawned: string[][]
  let npmExitCode: (args: string[]) => number
  let beforeClose: () => void

  const readPackageJson = (): ConfigPackageJson =>
    JSON.parse(fs.readFileSync(path.join(configDir, 'package.json'), 'utf-8'))

  const writePackageJson = (pkg: ConfigPackageJson) =>
    fs.writeFileSync(path.join(configDir, 'package.json'), JSON.stringify(pkg))

  const writeModule = (dir: string, name: string, version?: string) => {
    fs.mkdirSync(path.join(dir, 'node_modules', name), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'node_modules', name, 'package.json'),
      JSON.stringify(version ? { version } : {})
    )
  }

  const serverPackageJson = { signalk: { defaultPackages: DEFAULTS } }

  function fakeApp(
    security = { isDummy: () => false, allowConfigure: () => true },
    queueModuleInstall?: DefaultPackagesApp['queueModuleInstall']
  ) {
    const events: Array<{ type: string; data: unknown }> = []
    let handler: ((req: Request, res: Response) => void) | undefined
    const app: DefaultPackagesApp = {
      config,
      emit: (event: string, data: unknown) => {
        if (event === 'serverevent') {
          events.push(data as { type: string; data: unknown })
        }
        return true
      },
      securityStrategy: security,
      post: (_path: string, h: (req: Request, res: Response) => void) => {
        handler = h
      },
      queueModuleInstall
    }
    registerDefaultPackagesRoutes(app)
    const post = (body: unknown) => {
      const res = {
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) {
          this.statusCode = code
          return this
        },
        json(value: unknown) {
          this.body = value
          return this
        }
      }
      handler!({ body } as Request, res as unknown as Response)
      return res
    }
    return { app, events, post }
  }

  const installedSpecs = () =>
    spawned.map((args) => args[args.indexOf('--') + 1])

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-default-app-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-default-config-'))
    config = { appPath: appDir, configPath: configDir } as Config
    writePackageJson({ name: 'signalk-server-config' })
    originalSkip = process.env[SKIP_DEFAULT_PACKAGES_ENV]
    delete process.env[SKIP_DEFAULT_PACKAGES_ENV]
    spawned = []
    npmExitCode = () => 0
    beforeClose = () => {}
    originalSpawn = childProcess.spawn
    childProcess.spawn = ((_cmd: string, args: string[]) => {
      spawned.push(args)
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (code: number) => void) => {
          if (event === 'close') {
            beforeClose()
            cb(npmExitCode(args))
          }
        }
      } as unknown as ChildProcess
    }) as SpawnMock
  })

  afterEach(() => {
    childProcess.spawn = originalSpawn
    if (originalSkip === undefined) {
      delete process.env[SKIP_DEFAULT_PACKAGES_ENV]
    } else {
      process.env[SKIP_DEFAULT_PACKAGES_ENV] = originalSkip
    }
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('records the defaults in a fresh package.json and installs each once', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const pkg = readPackageJson()
    expect(pkg.name).to.equal('signalk-server-config')
    expect(pkg.dependencies).to.equal(undefined)
    expect(pkg.signalkDefaultPackages).to.deep.equal({
      [KIP]: 'pending',
      [FREEBOARD]: 'pending'
    })

    const { app, events } = fakeApp()
    startDefaultPackages(app)
    startDefaultPackages(app)
    expect(installedSpecs()).to.deep.equal([
      `${KIP}@${DEFAULTS[KIP]}`,
      `${FREEBOARD}@${DEFAULTS[FREEBOARD]}`
    ])
    expect(spawned[0]).to.include.members([
      '--prefer-offline',
      '--no-audit',
      '--ignore-scripts'
    ])
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'installed',
      [FREEBOARD]: 'installed'
    })
    expect(events.map((e) => e.type)).to.deep.equal([
      'DEFAULT_PACKAGES',
      'RESTART_REQUIRED',
      'DEFAULT_PACKAGES'
    ])
    expect(events[1].data).to.deep.equal({
      reason: 'defaultPackagesInstalled',
      packages: [KIP, FREEBOARD]
    })
    expect(events[2].data).to.deep.equal({ status: 'done', packages: DEFAULTS })
  })

  it('does nothing on later starts', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    startDefaultPackages(fakeApp().app)
    writePackageJson({ ...readPackageJson(), dependencies: DEFAULTS })
    writeModule(configDir, KIP)
    writeModule(configDir, FREEBOARD)
    const written = fs.readFileSync(path.join(configDir, 'package.json'))
    const plan = prepareDefaultPackages(config, serverPackageJson, false)
    expect(plan?.install).to.deep.equal({})
    expect(plan?.offer).to.deep.equal({})
    expect(fs.readFileSync(path.join(configDir, 'package.json'))).to.deep.equal(
      written
    )
  })

  it('records packages bundled with the server without installing them', () => {
    writeModule(appDir, KIP)
    const plan = prepareDefaultPackages(config, serverPackageJson, true)
    expect(plan?.install).to.deep.equal({ [FREEBOARD]: DEFAULTS[FREEBOARD] })
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'bundled',
      [FREEBOARD]: 'pending'
    })
  })

  it('installs the rest when one default fails and retries only that one', () => {
    npmExitCode = (args) => (args.includes(`${KIP}@${DEFAULTS[KIP]}`) ? 1 : 0)
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const { app, events } = fakeApp()
    startDefaultPackages(app)
    expect(events.map((e) => e.type)).to.deep.equal([
      'DEFAULT_PACKAGES',
      'RESTART_REQUIRED',
      'DEFAULT_PACKAGES'
    ])
    expect(events[1].data).to.deep.equal({
      reason: 'defaultPackagesInstalled',
      packages: [FREEBOARD]
    })
    expect(events[2].data).to.deep.equal({
      status: 'failed',
      packages: { [KIP]: DEFAULTS[KIP] }
    })
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'pending',
      [FREEBOARD]: 'installed'
    })
    writePackageJson({
      ...readPackageJson(),
      dependencies: { [FREEBOARD]: DEFAULTS[FREEBOARD] }
    })
    writeModule(configDir, FREEBOARD)
    expect(
      prepareDefaultPackages(config, serverPackageJson, false)?.install
    ).to.deep.equal({ [KIP]: DEFAULTS[KIP] })
  })

  it('reports a failed install without asking for a restart', () => {
    npmExitCode = () => 1
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const { app, events } = fakeApp()
    startDefaultPackages(app)
    expect(events.map((e) => e.type)).to.deep.equal([
      'DEFAULT_PACKAGES',
      'DEFAULT_PACKAGES'
    ])
    expect(events[1].data).to.deep.equal({
      status: 'failed',
      packages: DEFAULTS
    })
  })

  it('keeps running when package.json breaks while npm runs', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    beforeClose = () =>
      fs.writeFileSync(path.join(configDir, 'package.json'), '{')
    const { app, events } = fakeApp()
    expect(() => startDefaultPackages(app)).to.not.throw()
    expect(events.map((e) => e.type)).to.include('RESTART_REQUIRED')
  })

  it('installs through the Appstore queue when there is one', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const queued: Array<{ name: string; version: string }> = []
    const { app, events } = fakeApp(undefined, (name, version, options) => {
      queued.push({ name, version })
      expect(options.npm).to.deep.equal({ preferOffline: true })
      options.onClose(0)
    })
    startDefaultPackages(app)
    expect(spawned).to.have.length(0)
    expect(queued).to.deep.equal([
      { name: KIP, version: DEFAULTS[KIP] },
      { name: FREEBOARD, version: DEFAULTS[FREEBOARD] }
    ])
    expect(events.map((e) => e.type)).to.include('RESTART_REQUIRED')
  })

  it('offers new defaults once the others are installed', () => {
    writePackageJson({ signalkDefaultPackages: { [KIP]: 'pending' } })
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, events, post } = fakeApp()
    beforeClose = () => {
      expect(
        events.map((e) => (e.data as { status?: string }).status)
      ).to.deep.equal(['installing'])
      expect(post({ install: [FREEBOARD] }).statusCode).to.equal(409)
    }
    startDefaultPackages(app)
    expect(installedSpecs()).to.deep.equal([`${KIP}@${DEFAULTS[KIP]}`])
    expect(events.at(-1)).to.deep.equal({
      type: 'DEFAULT_PACKAGES',
      data: { status: 'offer', packages: { [FREEBOARD]: DEFAULTS[FREEBOARD] } }
    })
    beforeClose = () => {}
    expect(post({ install: [FREEBOARD] }).statusCode).to.equal(200)
  })

  it('skips a default the user removed while the ones before it installed', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    beforeClose = () => {
      beforeClose = () => {}
      const pkg = readPackageJson()
      writePackageJson({
        ...pkg,
        signalkDefaultPackages: {
          ...pkg.signalkDefaultPackages,
          [FREEBOARD]: 'declined'
        }
      })
    }
    startDefaultPackages(fakeApp().app)
    expect(installedSpecs()).to.deep.equal([`${KIP}@${DEFAULTS[KIP]}`])
    expect(readPackageJson().signalkDefaultPackages?.[FREEBOARD]).to.equal(
      'declined'
    )
  })

  it('keeps a version the user installed while the ones before it installed', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    beforeClose = () => {
      beforeClose = () => {}
      writeModule(configDir, FREEBOARD, '4.0.0-beta.1')
      writePackageJson({
        ...readPackageJson(),
        dependencies: { [FREEBOARD]: '4.0.0-beta.1' }
      })
    }
    const { app, events } = fakeApp()
    startDefaultPackages(app)
    expect(installedSpecs()).to.deep.equal([`${KIP}@${DEFAULTS[KIP]}`])
    expect(readPackageJson().signalkDefaultPackages?.[FREEBOARD]).to.equal(
      'installed'
    )
    expect(events.at(-1)?.data).to.deep.equal({
      status: 'done',
      packages: DEFAULTS
    })
  })

  it('calls back once for each default when npm cannot be started', () => {
    childProcess.spawn = ((_cmd: string, args: string[]) => {
      spawned.push(args)
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (arg: unknown) => void) => {
          if (event === 'error') {
            cb(new Error('spawn npm ENOENT'))
          } else if (event === 'close') {
            cb(-2)
          }
        }
      } as unknown as ChildProcess
    }) as SpawnMock
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const { app, events } = fakeApp()
    startDefaultPackages(app)
    expect(spawned).to.have.length(2)
    expect(
      events.map((e) => (e.data as { status: string }).status)
    ).to.deep.equal(['installing', 'failed'])
  })

  it('marks the configuration directory busy while the defaults install', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      true
    )
    const busy: Array<boolean | undefined> = []
    beforeClose = () => busy.push(config.defaultPackagesInstalling)
    startDefaultPackages(fakeApp().app)
    expect(busy).to.deep.equal([true, true])
    expect(config.defaultPackagesInstalling).to.equal(false)
  })

  it('shows a startup install that failed together with the offer', () => {
    writePackageJson({ signalkDefaultPackages: { [KIP]: 'pending' } })
    npmExitCode = () => 1
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, events } = fakeApp()
    startDefaultPackages(app)
    expect(events.at(-1)?.data).to.deep.equal({
      status: 'offer',
      packages: { [FREEBOARD]: DEFAULTS[FREEBOARD] },
      failed: { [KIP]: DEFAULTS[KIP] }
    })
  })

  it('asks for one restart for every default installed since the start', () => {
    writePackageJson({ signalkDefaultPackages: { [KIP]: 'pending' } })
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, events, post } = fakeApp()
    startDefaultPackages(app)
    expect(post({ install: [FREEBOARD] }).statusCode).to.equal(200)
    const restarts = events.filter((e) => e.type === 'RESTART_REQUIRED')
    expect(restarts.at(-1)?.data).to.deep.equal({
      reason: 'defaultPackagesInstalled',
      packages: [KIP, FREEBOARD]
    })
  })

  it('installs the default over an older copy that a bundled copy shadowed', () => {
    writeModule(configDir, KIP, '4.0.0')
    writeModule(appDir, KIP, '4.9.0')
    writePackageJson({ dependencies: { [KIP]: '4.0.0' } })
    const bundling = {
      ...serverPackageJson,
      optionalDependencies: DEFAULTS
    }
    prepareDefaultPackages(config, bundling, false)
    expect(readPackageJson().signalkDefaultPackages?.[KIP]).to.equal('bundled')

    fs.rmSync(path.join(appDir, 'node_modules', KIP), { recursive: true })
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    expect(config.defaultPackagesPlan?.install).to.deep.equal({
      [KIP]: DEFAULTS[KIP]
    })
    startDefaultPackages(fakeApp().app)
    expect(installedSpecs()).to.deep.equal([`${KIP}@${DEFAULTS[KIP]}`])
  })

  it('writes nothing when skipped by the environment', () => {
    process.env[SKIP_DEFAULT_PACKAGES_ENV] = 'true'
    expect(prepareDefaultPackages(config, serverPackageJson, true)).to.equal(
      undefined
    )
    expect(readPackageJson()).to.deep.equal({ name: 'signalk-server-config' })
  })

  for (const root of ['[]', 'null', '"text"']) {
    it(`leaves a package.json holding ${root} alone`, () => {
      fs.writeFileSync(path.join(configDir, 'package.json'), root)
      expect(prepareDefaultPackages(config, serverPackageJson, false)).to.equal(
        undefined
      )
      expect(
        fs.readFileSync(path.join(configDir, 'package.json'), 'utf-8')
      ).to.equal(root)
    })
  }

  it('leaves an unreadable package.json alone', () => {
    fs.writeFileSync(path.join(configDir, 'package.json'), '{')
    expect(prepareDefaultPackages(config, serverPackageJson, false)).to.equal(
      undefined
    )
    expect(
      fs.readFileSync(path.join(configDir, 'package.json'), 'utf-8')
    ).to.equal('{')
  })

  it('starts without default packages when package.json cannot be written', () => {
    fs.rmSync(path.join(configDir, 'package.json'))
    fs.mkdirSync(path.join(configDir, 'package.json.tmp'))
    writePackageJson({ name: 'signalk-server-config' })
    expect(prepareDefaultPackages(config, serverPackageJson, true)).to.equal(
      undefined
    )
  })

  it('installs only the offered packages the user chose', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, events, post } = fakeApp()
    startDefaultPackages(app)
    expect(spawned).to.have.length(0)
    expect(events[0]).to.deep.equal({
      type: 'DEFAULT_PACKAGES',
      data: { status: 'offer', packages: DEFAULTS }
    })

    const res = post({ install: [KIP] })
    expect(res.body).to.deep.equal({ installing: [KIP] })
    expect(installedSpecs()).to.deep.equal([`${KIP}@${DEFAULTS[KIP]}`])
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'installed',
      [FREEBOARD]: 'declined'
    })
    expect(post({ install: [] }).statusCode).to.equal(409)
  })

  it('declines a default the user removes from the appstore', () => {
    writePackageJson({
      dependencies: { [KIP]: DEFAULTS[KIP] },
      signalkDefaultPackages: { [KIP]: 'installed' }
    })
    removeModule(
      config,
      KIP,
      null,
      () => {},
      () => {},
      () => {}
    )
    const pkg = readPackageJson()
    expect(pkg.dependencies).to.deep.equal({})
    expect(pkg.signalkDefaultPackages).to.deep.equal({ [KIP]: 'declined' })
    expect(
      prepareDefaultPackages(config, serverPackageJson, false)?.install
    ).to.deep.equal({})
  })

  const npmRemoves = (name: string) => () => {
    const pkg = readPackageJson()
    delete pkg.dependencies?.[name]
    writePackageJson(pkg)
    fs.rmSync(path.join(configDir, 'node_modules', name), { recursive: true })
  }

  it('keeps a default as bundled when the user removes only its Appstore copy', () => {
    writeModule(appDir, KIP)
    writeModule(configDir, KIP)
    writePackageJson({
      dependencies: { [KIP]: DEFAULTS[KIP] },
      signalkDefaultPackages: { [KIP]: 'installed' }
    })
    beforeClose = npmRemoves(KIP)
    removeModule(
      config,
      KIP,
      null,
      () => {},
      () => {},
      () => {}
    )
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'bundled'
    })
  })

  it('declines a bundled default the user removes when it has no Appstore copy', () => {
    writeModule(appDir, KIP)
    writePackageJson({ signalkDefaultPackages: { [KIP]: 'bundled' } })
    removeModule(
      config,
      KIP,
      null,
      () => {},
      () => {},
      () => {}
    )
    expect(readPackageJson().signalkDefaultPackages).to.deep.equal({
      [KIP]: 'declined'
    })
  })

  it('rejects a package that was not offered', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp()
    startDefaultPackages(app)
    expect(post({ install: ['evil'] }).statusCode).to.equal(400)
    expect(post({ install: ['constructor'] }).statusCode).to.equal(400)
    expect(post(undefined).statusCode).to.equal(400)
    expect(spawned).to.have.length(0)
    expect(readPackageJson().signalkDefaultPackages).to.equal(undefined)
    expect(post({ install: [] }).statusCode).to.equal(200)
  })

  it('rejects a package choice from a user who may not configure', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp({
      isDummy: () => false,
      allowConfigure: () => false
    })
    startDefaultPackages(app)
    expect(post({ install: [KIP] }).statusCode).to.equal(401)
    expect(spawned).to.have.length(0)
    expect(readPackageJson().signalkDefaultPackages).to.equal(undefined)
  })

  it('accepts a package choice when security is turned off', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp({
      isDummy: () => true,
      allowConfigure: () => false
    })
    startDefaultPackages(app)
    expect(post({ install: [KIP] }).statusCode).to.equal(200)
  })

  it('reports a package choice it cannot record', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp()
    startDefaultPackages(app)
    fs.writeFileSync(path.join(configDir, 'package.json'), '{')
    expect(post({ install: [KIP] }).statusCode).to.equal(500)
    expect(spawned).to.have.length(0)
    expect(post({ install: [KIP] }).statusCode).to.equal(500)
  })

  it('keeps a version installed from the appstore while the offer was open', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp()
    startDefaultPackages(app)
    writePackageJson({ dependencies: { [KIP]: '5.0.0' } })
    writeModule(configDir, KIP)
    const res = post({ install: [KIP] })
    expect(res.body).to.deep.equal({ installing: [] })
    expect(spawned).to.have.length(0)
    const pkg = readPackageJson()
    expect(pkg.dependencies).to.deep.equal({ [KIP]: '5.0.0' })
    expect(pkg.signalkDefaultPackages?.[KIP]).to.equal('installed')
  })

  it('installs a chosen package whose files are missing', () => {
    config.defaultPackagesPlan = prepareDefaultPackages(
      config,
      serverPackageJson,
      false
    )
    const { app, post } = fakeApp()
    startDefaultPackages(app)
    writePackageJson({ dependencies: { [KIP]: '5.0.0' } })
    expect(post({ install: [KIP] }).body).to.deep.equal({ installing: [KIP] })
  })
})

describe('npm version specs', () => {
  let originalSpawn: SpawnMock
  let spawned: string[][]
  const config = { appPath: '/app', configPath: os.tmpdir() } as Config

  beforeEach(() => {
    spawned = []
    originalSpawn = childProcess.spawn
    childProcess.spawn = ((_cmd: string, args: string[]) => {
      spawned.push(args)
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: () => {}
      } as unknown as ChildProcess
    }) as SpawnMock
  })

  afterEach(() => {
    childProcess.spawn = originalSpawn
  })

  const install = (version: string) => {
    let code: number | undefined
    installModule(
      config,
      KIP,
      version,
      () => {},
      () => {},
      (c) => {
        code = c
      }
    )
    return code
  }

  it('installs a single version range', () => {
    for (const version of ['4.8.0', '^4.8.0', '~4.8.0', '0.x', '*']) {
      expect(install(version)).to.equal(undefined)
    }
    expect(spawned).to.have.length(5)
  })

  it('refuses ranges a shell could misread', () => {
    for (const version of ['>=1 <2', '1.0.0 || 2.0.0', '1.0.0&x', 'latest']) {
      expect(install(version)).to.equal(-1)
    }
    expect(spawned).to.have.length(0)
  })

  it('quotes the package for the Windows shell, which reads ^ as an escape', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    const calls: Array<{ cmd: string; shell?: boolean }> = []
    childProcess.spawn = ((
      cmd: string,
      args: string[],
      opts?: { shell?: boolean }
    ) => {
      calls.push({ cmd, shell: opts?.shell })
      spawned.push(args)
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: () => {}
      } as unknown as ChildProcess
    }) as SpawnMock
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      install('^4.8.0')
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
    expect(calls).to.deep.equal([{ cmd: 'npm.cmd', shell: true }])
    expect(spawned[0].at(-1)).to.equal(`"${KIP}@^4.8.0"`)
  })
})
