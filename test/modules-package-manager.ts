import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import lockfile from 'proper-lockfile'
import {
  DISCARDED_MODULES,
  getBundledPnpm,
  getPendingRebuild,
  PREVIOUS_MODULES_BACKUP,
  recoverConfigDirModules,
  removeModule,
  resetModuleCaches,
  restoreModules,
  runPackageManager,
  runPnpmInConfigDir
} from '../src/modules'
import { Config } from '../src/config/config'

// runPackageManager calls the spawn and execFile bound from child_process;
// mocking requires the mutable CommonJS module object (the ESM namespace
// exposes read-only getters), so this test reassigns them on the required
// module and restores them afterwards.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

interface Spawned {
  command: string
  args: string[]
  cwd?: string
  child: ChildProcess
}

interface Probe {
  args: string[]
  cwd?: string
}

interface Result {
  codes: number[]
  errors: string[]
}

const STORE_DIR = '/store/v11'

// The install runs after the pnpm probe and the migration, which are
// asynchronous, so tests wait for the next observable step
async function settled(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('runPackageManager', () => {
  let configPath: string
  let config: Config
  let originalSpawn: typeof childProcess.spawn
  let originalExecFile: typeof childProcess.execFile
  let spawned: Spawned[]
  let pruned: string[]
  let probes: Probe[]
  let closed: Set<ChildProcess>
  let succeeded: number

  beforeEach(() => {
    configPath = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_pm'))
    config = { configPath, name: 'signalk-server' } as Config
    spawned = []
    pruned = []
    probes = []
    closed = new Set()
    succeeded = 0
    resetModuleCaches()
    originalSpawn = childProcess.spawn
    originalExecFile = childProcess.execFile
    childProcess.spawn = (
      command: string,
      args: string[],
      opts: { cwd?: string }
    ) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter()
      }) as unknown as ChildProcess
      // Pruning follows every successful run; it completes on its own so
      // that the tests deal with the runs they start
      if (args.at(-2) === 'store' && args.at(-1) === 'prune') {
        pruned.push(opts.cwd ?? '')
        setImmediate(() => child.emit('close', 0))
      } else {
        child.on('close', (code: number) => {
          closed.add(child)
          if (code === 0 && command === process.execPath) {
            succeeded++
          }
        })
        spawned.push({ command, args, cwd: opts.cwd, child })
      }
      return child
    }
    childProcess.execFile = (
      _command: string,
      args: string[],
      opts: { cwd?: string },
      callback: (err: Error | null, stdout: string) => void
    ) => {
      probes.push({ args, cwd: opts.cwd })
      callback(null, `${STORE_DIR}\n`)
    }
  })

  afterEach(async () => {
    // A run that was never closed would block the next test's run
    for (const { child } of spawned) {
      if (!closed.has(child)) {
        child.emit('close', 0)
      }
    }
    await settled(() => spawned.every(({ child }) => closed.has(child)))
    await settled(() => pruned.length >= succeeded)
    childProcess.spawn = originalSpawn
    childProcess.execFile = originalExecFile
    fs.rmSync(configPath, { recursive: true, force: true })
  })

  const run = async (
    name: string | null,
    version: string | null,
    command: 'install' | 'update' | 'remove'
  ) => {
    const result: Result = { codes: [], errors: [] }
    runPackageManager(
      config,
      name,
      version,
      command,
      () => {},
      (err) => result.errors.push(String(err.message ?? err)),
      (code) => result.codes.push(code)
    )
    await settled(() => spawned.length > 0 || result.codes.length > 0)
    return result
  }

  const finish = async (result: Result, code: number) => {
    spawned[0].child.emit('close', code)
    await settled(() => result.codes.length > 0)
  }

  describe('server self-update', () => {
    it('allows the canboatjs install script when installing', async () => {
      await run('signalk-server', '2.0.0', 'install')
      expect(spawned[0].args).to.include('--allow-scripts=@canboat/canboatjs')
      expect(spawned[0].args).to.include('-g')
      expect(spawned[0].args).to.include('signalk-server@2.0.0')
    })

    it('allows the canboatjs install script when updating', async () => {
      await run('signalk-server', null, 'update')
      expect(spawned[0].args).to.include('--allow-scripts=@canboat/canboatjs')
      expect(spawned[0].args).to.include('-g')
    })

    it('does not pass allow-scripts when removing', async () => {
      await run('signalk-server', null, 'remove')
      expect(spawned[0].args).to.not.include(
        '--allow-scripts=@canboat/canboatjs'
      )
      expect(spawned[0].args).to.include('-g')
    })
  })

  describe('package names', () => {
    for (const name of ['../evil', 'file:./evil', 'https://x/evil.tgz']) {
      it(`rejects ${name} without running a package manager`, async () => {
        const result = await run(name, null, 'install')
        expect(spawned).to.have.length(0)
        expect(result.errors).to.deep.equal([`Invalid package name: ${name}`])
        expect(result.codes).to.deep.equal([-1])
      })
    }

    it('accepts scoped names', async () => {
      await run('@scope/some-plugin', '1.2.3', 'install')
      expect(spawned[0].args).to.include('@scope/some-plugin@1.2.3')
    })
  })

  describe('config directory', () => {
    const pnpmOptions = () => [
      '--config.ignore-scripts=true',
      '--config.minimum-release-age=0',
      '--config.block-exotic-subdeps=false',
      '--config.confirm-modules-purge=false',
      '--config.optimistic-repeat-install=false',
      '--config.modules-cache-max-age=0',
      '--config.enable-global-virtual-store=false',
      '--config.update-notifier=false',
      `--config.store-dir=${path.join(configPath, '.pnpm-store')}`,
      `--config.cache-dir=${path.join(configPath, '.pnpm-store', 'cache')}`
    ]

    it('adds a plugin with the bundled pnpm in the config directory', async () => {
      await run('some-plugin', '1.2.3', 'install')
      expect(spawned[0].command).to.equal(process.execPath)
      expect(spawned[0].cwd).to.equal(configPath)
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        ...pnpmOptions(),
        'add',
        'some-plugin@1.2.3'
      ])
    })

    it('removes a plugin with pnpm', async () => {
      await run('some-plugin', null, 'remove')
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        ...pnpmOptions(),
        'remove',
        'some-plugin'
      ])
    })

    it('restores the plugins of a restored backup with pnpm install', async () => {
      restoreModules(
        config,
        () => {},
        () => {},
        () => {}
      )
      await settled(() => spawned.length > 0)
      expect(spawned[0].command).to.equal(process.execPath)
      expect(spawned[0].cwd).to.equal(configPath)
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        ...pnpmOptions(),
        'install'
      ])
    })

    it('asks pnpm for the store from the config directory', async () => {
      await run('some-plugin', '1.2.3', 'install')
      expect(probes).to.deep.equal([
        {
          args: [getBundledPnpm().bin, ...pnpmOptions(), 'store', 'path'],
          cwd: configPath
        }
      ])
    })

    it('prunes the store after a run that succeeded', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      await finish(result, 0)
      await settled(() => pruned.length > 0)
      expect(pruned).to.deep.equal([configPath])
    })

    it('leaves the store alone after a run that failed', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      await finish(result, 1)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(pruned).to.deep.equal([])
    })

    it('refuses to run on a Node.js that the bundled pnpm does not support', async () => {
      const original = Object.getOwnPropertyDescriptor(
        process.versions,
        'node'
      )!
      Object.defineProperty(process.versions, 'node', { value: '18.0.0' })
      let result: Result
      try {
        result = await run('some-plugin', '1.2.3', 'install')
      } finally {
        Object.defineProperty(process.versions, 'node', original)
      }
      expect(spawned).to.have.length(0)
      expect(result.errors).to.deep.equal([
        `Installing plugins and webapps needs Node.js ${getBundledPnpm().node}, but the server runs on Node.js 18.0.0`
      ])
      expect(result.codes).to.deep.equal([-1])
    })

    it('runs any pnpm command for signalk-pnpm the same way', async () => {
      const code = runPnpmInConfigDir(
        configPath,
        ['link', '/src/my-plugin'],
        () => {},
        () => {}
      )
      await settled(() => spawned.length > 0)
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        ...pnpmOptions(),
        'link',
        '/src/my-plugin'
      ])
      spawned[0].child.emit('close', 0)
      expect(await code).to.equal(0)
    })

    it('waits while another process runs pnpm in the config directory', async () => {
      const lockfilePath = path.join(configPath, '.pnpm-store', 'lock')
      fs.mkdirSync(path.dirname(lockfilePath), { recursive: true })
      const release = await lockfile.lock(configPath, {
        lockfilePath,
        realpath: false
      })
      const output: string[] = []
      runPackageManager(
        config,
        'some-plugin',
        '1.2.3',
        'install',
        (data) => output.push(String(data)),
        () => {},
        () => {}
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(spawned).to.have.length(0)
      expect(output.join('')).to.contain('Waiting for another pnpm run')

      await release()
      await settled(() => spawned.length > 0)
      expect(spawned).to.have.length(1)
    })

    it('takes over the lock of a process that died', async () => {
      const lockDir = path.join(configPath, '.pnpm-store', 'lock')
      fs.mkdirSync(lockDir, { recursive: true })
      const longAgo = new Date(Date.now() - 60_000)
      fs.utimesSync(lockDir, longAgo, longAgo)
      await run('some-plugin', '1.2.3', 'install')
      expect(spawned).to.have.length(1)
    })

    it('takes the lock at once from a process that died on this machine', async () => {
      const lockDir = path.join(configPath, '.pnpm-store', 'lock')
      fs.mkdirSync(lockDir, { recursive: true })
      const { pid } = childProcess.spawnSync(process.execPath, ['-e', ''])
      fs.writeFileSync(
        path.join(configPath, '.pnpm-store', 'lock-owner.json'),
        JSON.stringify({ host: os.hostname(), pid })
      )
      const result = await run('some-plugin', '1.2.3', 'install')
      expect(spawned).to.have.length(1)
      expect(result.errors).to.deep.equal([])
    })

    it('waits for a holder on another machine', async () => {
      fs.mkdirSync(path.join(configPath, '.pnpm-store', 'lock'), {
        recursive: true
      })
      fs.writeFileSync(
        path.join(configPath, '.pnpm-store', 'lock-owner.json'),
        JSON.stringify({ host: `not-${os.hostname()}`, pid: 1 })
      )
      runPackageManager(
        config,
        'some-plugin',
        '1.2.3',
        'install',
        () => {},
        () => {},
        () => {}
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(spawned).to.have.length(0)
      fs.rmSync(path.join(configPath, '.pnpm-store', 'lock'), {
        recursive: true
      })
      await settled(() => spawned.length > 0)
    })

    it('runs one pnpm at a time', async () => {
      const first = await run('some-plugin', '1.2.3', 'install')
      const second = await run('other-plugin', '1.0.0', 'install')
      expect(spawned).to.have.length(1)
      await finish(first, 0)
      await settled(() => spawned.length > 1)
      expect(spawned[1].args).to.include('other-plugin@1.0.0')
      expect(second.codes).to.deep.equal([])
      spawned[1].child.emit('close', 0)
      await settled(() => second.codes.length > 0)
      expect(second.codes).to.deep.equal([0])
    })

    it('keeps running after a callback throws', async () => {
      const codes: number[] = []
      runPackageManager(
        config,
        'some-plugin',
        '1.2.3',
        'install',
        () => {},
        () => {},
        () => {
          throw new Error('callback failed')
        }
      )
      await settled(() => spawned.length > 0)
      spawned[0].child.emit('close', 0)
      runPackageManager(
        config,
        'other-plugin',
        '1.0.0',
        'install',
        () => {},
        () => {},
        (code) => codes.push(code)
      )
      await settled(() => spawned.length > 1)
      spawned[1].child.emit('close', 0)
      await settled(() => codes.length > 0)
      expect(codes).to.deep.equal([0])
    })

    it('ends the run when the error callback throws', async () => {
      const codes: number[] = []
      runPackageManager(
        config,
        'some-plugin',
        '1.2.3',
        'install',
        () => {},
        () => {
          throw new Error('callback failed')
        },
        (code) => codes.push(code)
      )
      await settled(() => spawned.length > 0)
      expect(() =>
        spawned[0].child.emit('error', new Error('spawn failed'))
      ).to.throw('callback failed')
      await settled(() => codes.length > 0)
      expect(codes).to.deep.equal([-1])
    })
  })

  describe('node_modules created by npm', () => {
    const modulesDir = () => path.join(configPath, 'node_modules')
    const backupDir = () => path.join(configPath, PREVIOUS_MODULES_BACKUP)
    const discardedDir = () => path.join(configPath, DISCARDED_MODULES)
    const npmPlugin = () => path.join(modulesDir(), 'npm-plugin')
    const packageJsonPath = () => path.join(configPath, 'package.json')
    const dependencies = () =>
      JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8')).dependencies

    beforeEach(() => {
      fs.mkdirSync(npmPlugin(), { recursive: true })
      fs.writeFileSync(
        path.join(npmPlugin(), 'package.json'),
        JSON.stringify({ name: 'npm-plugin', version: '1.2.0' })
      )
      fs.writeFileSync(
        packageJsonPath(),
        JSON.stringify({
          dependencies: {
            'npm-plugin': '^1.0.0',
            'linked-plugin': 'link:../linked-plugin'
          }
        })
      )
    })

    // What pnpm leaves once it has linked every package
    const rebuild = () => {
      fs.mkdirSync(modulesDir())
      fs.writeFileSync(
        path.join(modulesDir(), '.modules.yaml'),
        JSON.stringify({ storeDir: STORE_DIR })
      )
    }

    it('is set aside so that pnpm rebuilds it, and dropped on success', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(modulesDir())).to.equal(false)
      expect(fs.existsSync(backupDir())).to.equal(true)

      rebuild()
      await finish(result, 0)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(fs.existsSync(discardedDir())).to.equal(false)
      expect(fs.existsSync(npmPlugin())).to.equal(false)
    })

    it('is not put back when its removal after a rebuild is cut short', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      fs.mkdirSync(modulesDir())
      const rebuiltMarker = path.join(modulesDir(), '.modules.yaml')
      fs.writeFileSync(rebuiltMarker, JSON.stringify({ storeDir: STORE_DIR }))
      const originalRm = fs.promises.rm
      fs.promises.rm = async () => {
        throw Object.assign(new Error('EBUSY: resource busy'), {
          code: 'EBUSY'
        })
      }
      try {
        await finish(result, 0)
      } finally {
        fs.promises.rm = originalRm
      }
      expect(result.codes).to.deep.equal([0])
      expect(result.errors).to.deep.equal(['EBUSY: resource busy'])
      expect(fs.existsSync(backupDir())).to.equal(false)

      runPackageManager(
        config,
        'other-plugin',
        '1.0.0',
        'install',
        () => {},
        () => {},
        () => {}
      )
      await settled(() => spawned.length > 1)
      expect(fs.existsSync(rebuiltMarker)).to.equal(true)
      expect(fs.existsSync(npmPlugin())).to.equal(false)
      expect(fs.existsSync(discardedDir())).to.equal(false)
    })

    it('is dropped on the next run when it cannot be moved out after a rebuild', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      fs.mkdirSync(modulesDir())
      const rebuiltMarker = path.join(modulesDir(), '.modules.yaml')
      fs.writeFileSync(rebuiltMarker, JSON.stringify({ storeDir: STORE_DIR }))
      const originalRename = fs.renameSync
      fs.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
        if (from === backupDir()) {
          throw Object.assign(new Error('EPERM: operation not permitted'), {
            code: 'EPERM'
          })
        }
        originalRename(from, to)
      }
      try {
        await finish(result, 0)
      } finally {
        fs.renameSync = originalRename
      }
      expect(result.errors).to.deep.equal(['EPERM: operation not permitted'])
      expect(fs.existsSync(backupDir())).to.equal(true)

      runPackageManager(
        config,
        'other-plugin',
        '1.0.0',
        'install',
        () => {},
        () => {},
        () => {}
      )
      await settled(() => spawned.length > 1)
      expect(fs.existsSync(rebuiltMarker)).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(fs.existsSync(discardedDir())).to.equal(false)
    })

    it('does not hold up installs while an old tree cannot be removed', async () => {
      fs.mkdirSync(discardedDir())
      const originalRm = fs.promises.rm
      fs.promises.rm = async () => {
        throw Object.assign(new Error('EPERM: operation not permitted'), {
          code: 'EPERM'
        })
      }
      let result: Result
      try {
        result = await run('some-plugin', '1.2.3', 'install')
      } finally {
        fs.promises.rm = originalRm
      }
      expect(spawned).to.have.length(1)
      expect(result.errors).to.deep.equal([])
    })

    it('takes the package-lock.json that npm kept of it along', async () => {
      const npmLockfile = path.join(configPath, 'package-lock.json')
      fs.writeFileSync(npmLockfile, '{}')
      const result = await run('some-plugin', '1.2.3', 'install')
      rebuild()
      await finish(result, 0)
      expect(fs.existsSync(npmLockfile)).to.equal(false)
    })

    it('keeps the package-lock.json of npm while it stays', async () => {
      const npmLockfile = path.join(configPath, 'package-lock.json')
      fs.writeFileSync(npmLockfile, '{}')
      const result = await run('some-plugin', '1.2.3', 'install')
      await finish(result, 1)
      expect(fs.existsSync(npmLockfile)).to.equal(true)
    })

    it('is put back when a command installs nothing', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      await finish(result, 0)
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(dependencies()['npm-plugin']).to.equal('^1.0.0')
    })

    it('is dropped once a rebuild leaves nothing to install', async () => {
      const result = await run('npm-plugin', null, 'remove')
      fs.mkdirSync(modulesDir())
      fs.writeFileSync(packageJsonPath(), JSON.stringify({ dependencies: {} }))
      await finish(result, 0)
      expect(fs.existsSync(npmPlugin())).to.equal(false)
      expect(fs.existsSync(backupDir())).to.equal(false)
    })

    it('is not settled at startup while its rebuild is still running', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      const recovery = recoverConfigDirModules(configPath)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(fs.existsSync(backupDir())).to.equal(true)
      expect(fs.existsSync(modulesDir())).to.equal(false)

      rebuild()
      await finish(result, 0)
      await recovery
      expect(fs.existsSync(path.join(modulesDir(), '.modules.yaml'))).to.equal(
        true
      )
      expect(fs.existsSync(backupDir())).to.equal(false)
    })

    it('is put back when pnpm fails', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      fs.mkdirSync(modulesDir())
      await finish(result, 1)
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(dependencies()['npm-plugin']).to.equal('^1.0.0')
      expect(result.codes).to.deep.equal([1])
    })

    it('is left as it was when it cannot be moved aside', async () => {
      const originalRename = fs.renameSync
      fs.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
        if (from === modulesDir()) {
          throw Object.assign(new Error('EBUSY: resource busy'), {
            code: 'EBUSY'
          })
        }
        originalRename(from, to)
      }
      let result: Result
      try {
        result = await run('some-plugin', '1.2.3', 'install')
      } finally {
        fs.renameSync = originalRename
      }
      expect(spawned).to.have.length(0)
      expect(result.errors).to.deep.equal(['EBUSY: resource busy'])
      expect(result.codes).to.deep.equal([-1])
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(dependencies()['npm-plugin']).to.equal('^1.0.0')
    })

    it('pins the installed versions so that the rebuild keeps them', async () => {
      await run('some-plugin', '1.2.3', 'install')
      expect(dependencies()).to.deep.equal({
        'npm-plugin': '1.2.0',
        'linked-plugin': 'link:../linked-plugin'
      })
    })

    it('is left alone once this pnpm manages it', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.modules.yaml'),
        JSON.stringify({ storeDir: STORE_DIR })
      )
      await run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(dependencies()['npm-plugin']).to.equal('^1.0.0')
    })

    it('is rebuilt when another pnpm store created it', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.modules.yaml'),
        'storeDir: /elsewhere/store/v10\n'
      )
      await run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(modulesDir())).to.equal(false)
      expect(fs.existsSync(backupDir())).to.equal(true)
    })

    it('recovers the backup of a rebuild that did not complete', async () => {
      fs.renameSync(modulesDir(), backupDir())
      fs.mkdirSync(path.join(modulesDir(), 'half-linked'), {
        recursive: true
      })
      await run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(path.join(backupDir(), 'npm-plugin'))).to.equal(true)
      expect(fs.existsSync(path.join(backupDir(), 'half-linked'))).to.equal(
        false
      )
      expect(fs.existsSync(modulesDir())).to.equal(false)
    })

    it('drops the backup of a rebuild that completed', async () => {
      fs.renameSync(modulesDir(), backupDir())
      fs.mkdirSync(modulesDir())
      const rebuiltMarker = path.join(modulesDir(), '.modules.yaml')
      fs.writeFileSync(rebuiltMarker, JSON.stringify({ storeDir: STORE_DIR }))
      const result = await run('some-plugin', '1.2.3', 'install')
      expect(spawned).to.have.length(1)
      expect(result.errors).to.deep.equal([])
      expect(fs.existsSync(rebuiltMarker)).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(fs.existsSync(discardedDir())).to.equal(false)
    })
  })

  describe('getPendingRebuild', () => {
    const modulesDir = () => path.join(configPath, 'node_modules')

    beforeEach(() => {
      fs.mkdirSync(modulesDir())
      fs.writeFileSync(
        path.join(configPath, 'package.json'),
        JSON.stringify({ dependencies: { 'some-plugin': '^1.0.0' } })
      )
    })

    it('counts the packages that npm installed', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.package-lock.json'),
        JSON.stringify({
          packages: {
            '': {},
            'node_modules/some-plugin': {},
            'node_modules/dependency': {},
            'node_modules/some-plugin/node_modules/dependency': {}
          }
        })
      )
      expect(await getPendingRebuild(configPath)).to.deep.equal({
        packages: 3
      })
    })

    it('counts the packages of a node_modules that another store holds', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.modules.yaml'),
        'storeDir: /elsewhere/store/v10\n'
      )
      for (const dir of ['some-plugin@1.0.0', 'dependency@2.0.0']) {
        fs.mkdirSync(path.join(modulesDir(), '.pnpm', dir), { recursive: true })
      }
      expect(await getPendingRebuild(configPath)).to.deep.equal({
        packages: 2
      })
    })

    it('gives no count when npm lists no packages for the declared plugins', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.package-lock.json'),
        JSON.stringify({ packages: { '': {} } })
      )
      expect(await getPendingRebuild(configPath)).to.deep.equal({
        packages: undefined
      })
    })

    it('reports nothing once this pnpm manages node_modules', async () => {
      fs.writeFileSync(
        path.join(modulesDir(), '.modules.yaml'),
        JSON.stringify({ storeDir: STORE_DIR })
      )
      expect(await getPendingRebuild(configPath)).to.equal(undefined)
    })

    it('reports nothing when no plugin is installed', async () => {
      fs.writeFileSync(path.join(configPath, 'package.json'), '{}')
      expect(await getPendingRebuild(configPath)).to.equal(undefined)
    })
  })

  describe('recoverConfigDirModules', () => {
    const modulesDir = () => path.join(configPath, 'node_modules')
    const backupDir = () => path.join(configPath, PREVIOUS_MODULES_BACKUP)
    const discardedDir = () => path.join(configPath, DISCARDED_MODULES)
    const npmPlugin = () => path.join(modulesDir(), 'npm-plugin')

    beforeEach(() => {
      fs.mkdirSync(path.join(backupDir(), 'npm-plugin'), { recursive: true })
      fs.writeFileSync(
        path.join(configPath, 'package.json'),
        JSON.stringify({ dependencies: { 'npm-plugin': '1.2.0' } })
      )
    })

    it('puts back the installation that an interrupted rebuild set aside', async () => {
      fs.mkdirSync(path.join(modulesDir(), 'half-linked'), { recursive: true })
      await recoverConfigDirModules(configPath)
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(path.join(modulesDir(), 'half-linked'))).to.equal(
        false
      )
      expect(fs.existsSync(backupDir())).to.equal(false)
      await settled(() => !fs.existsSync(discardedDir()))
      expect(fs.existsSync(discardedDir())).to.equal(false)
    })

    it('keeps a rebuild that completed and drops the old installation', async () => {
      fs.mkdirSync(modulesDir())
      const rebuiltMarker = path.join(modulesDir(), '.modules.yaml')
      fs.writeFileSync(rebuiltMarker, JSON.stringify({ storeDir: STORE_DIR }))
      const npmLockfile = path.join(configPath, 'package-lock.json')
      fs.writeFileSync(npmLockfile, '{}')
      await recoverConfigDirModules(configPath)
      expect(fs.existsSync(rebuiltMarker)).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(fs.existsSync(npmLockfile)).to.equal(false)
      await settled(() => !fs.existsSync(discardedDir()))
      expect(fs.existsSync(discardedDir())).to.equal(false)
    })

    it('leaves a config directory without a backup alone', async () => {
      fs.rmSync(backupDir(), { recursive: true })
      fs.mkdirSync(path.join(modulesDir(), 'npm-plugin'), { recursive: true })
      await recoverConfigDirModules(configPath)
      expect(fs.existsSync(npmPlugin())).to.equal(true)
    })
  })

  describe('removeModule', () => {
    it('cleans up a package that package.json does not declare', async () => {
      const handCopied = path.join(configPath, 'node_modules', 'hand-copied')
      fs.mkdirSync(handCopied, { recursive: true })
      fs.writeFileSync(
        path.join(configPath, 'package.json'),
        JSON.stringify({ dependencies: {} })
      )
      const codes: number[] = []
      removeModule(
        config,
        'hand-copied',
        null,
        () => {},
        () => {},
        (code) => codes.push(code)
      )
      await settled(() => codes.length > 0)
      expect(spawned).to.have.length(0)
      expect(codes).to.deep.equal([0])
      expect(fs.existsSync(handCopied)).to.equal(false)
    })
  })
})
