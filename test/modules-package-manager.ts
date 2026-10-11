import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  DISCARDED_MODULES,
  getBundledPnpm,
  PREVIOUS_MODULES_BACKUP,
  removeModule,
  resetModuleCaches,
  runPackageManager
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
  let closed: Set<ChildProcess>

  beforeEach(() => {
    configPath = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_pm'))
    config = { configPath, name: 'signalk-server' } as Config
    spawned = []
    closed = new Set()
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
      child.on('close', () => closed.add(child))
      spawned.push({ command, args, cwd: opts.cwd, child })
      return child
    }
    childProcess.execFile = (
      _command: string,
      _args: string[],
      _opts: object,
      callback: (err: Error | null, stdout: string) => void
    ) => callback(null, `${STORE_DIR}\n`)
  })

  afterEach(async () => {
    // A run that was never closed would block the next test's run
    for (const { child } of spawned) {
      if (!closed.has(child)) {
        child.emit('close', 0)
      }
    }
    await settled(() => spawned.every(({ child }) => closed.has(child)))
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

  describe('config directory', () => {
    const pnpmOptions = [
      '--config.ignore-scripts=true',
      '--config.minimum-release-age=0',
      '--config.block-exotic-subdeps=false',
      '--config.confirm-modules-purge=false',
      '--config.optimistic-repeat-install=false'
    ]

    it('adds a plugin with the bundled pnpm in the config directory', async () => {
      await run('some-plugin', '1.2.3', 'install')
      expect(spawned[0].command).to.equal(process.execPath)
      expect(spawned[0].cwd).to.equal(configPath)
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        'add',
        ...pnpmOptions,
        'some-plugin@1.2.3'
      ])
    })

    it('removes a plugin with pnpm', async () => {
      await run('some-plugin', null, 'remove')
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        'remove',
        ...pnpmOptions,
        'some-plugin'
      ])
    })

    it('restores the plugins listed in package.json with pnpm install', async () => {
      await run(null, null, 'install')
      expect(spawned[0].args).to.deep.equal([
        getBundledPnpm().bin,
        'install',
        ...pnpmOptions
      ])
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

    it('is set aside so that pnpm rebuilds it, and dropped on success', async () => {
      const result = await run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(modulesDir())).to.equal(false)
      expect(fs.existsSync(backupDir())).to.equal(true)

      fs.mkdirSync(modulesDir())
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

  describe('package names', () => {
    for (const name of [
      '../evil',
      'file:./evil',
      'https://x/evil.tgz',
      'git+https://x/evil.git',
      'evil & calc'
    ]) {
      it(`rejects ${name} without running a package manager`, async () => {
        const result = await run(name, null, 'install')
        expect(spawned).to.deep.equal([])
        expect(result.errors).to.deep.equal([`Invalid package name: ${name}`])
        expect(result.codes).to.deep.equal([-1])
      })
    }

    it('accepts scoped names', async () => {
      await run('@scope/some-plugin', '1.2.3', 'install')
      expect(spawned[0].args.at(-1)).to.equal('@scope/some-plugin@1.2.3')
    })

    it('never lets a name that looks like an option reach npm as one', async () => {
      config = { configPath, name: '--global' } as Config
      await run('--global', null, 'install')
      expect(spawned[0].args.slice(-2)).to.deep.equal(['--', '--global'])
    })
  })
})
