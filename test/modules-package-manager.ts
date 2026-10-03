import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runPackageManager } from '../src/modules'
import { Config } from '../src/config/config'

// runPackageManager calls the spawn bound from child_process; mocking requires
// the mutable CommonJS module object (the ESM namespace exposes read-only
// getters), so this test reassigns spawn on the required module and restores
// it afterwards.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

interface Spawned {
  command: string
  args: string[]
  cwd?: string
  child: ChildProcess
}

describe('runPackageManager', () => {
  let configPath: string
  let config: Config
  let originalSpawn: typeof childProcess.spawn
  let spawned: Spawned[]

  beforeEach(() => {
    configPath = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_pm'))
    config = { configPath, name: 'signalk-server' } as Config
    spawned = []
    originalSpawn = childProcess.spawn
    childProcess.spawn = (
      command: string,
      args: string[],
      opts: { cwd?: string }
    ) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter()
      }) as unknown as ChildProcess
      spawned.push({ command, args, cwd: opts.cwd, child })
      return child
    }
  })

  afterEach(() => {
    childProcess.spawn = originalSpawn
    fs.rmSync(configPath, { recursive: true, force: true })
  })

  const run = (
    name: string | null,
    version: string | null,
    command: 'install' | 'update' | 'remove'
  ) => {
    const result: { codes: number[]; errors: string[] } = {
      codes: [],
      errors: []
    }
    runPackageManager(
      config,
      name,
      version,
      command,
      () => {},
      (err) => result.errors.push(String(err.message ?? err)),
      (code) => result.codes.push(code)
    )
    return result
  }

  describe('server self-update', () => {
    it('allows the canboatjs install script when installing', () => {
      run('signalk-server', '2.0.0', 'install')
      expect(spawned[0].args).to.include('--allow-scripts=@canboat/canboatjs')
      expect(spawned[0].args).to.include('-g')
      expect(spawned[0].args).to.include('signalk-server@2.0.0')
    })

    it('allows the canboatjs install script when updating', () => {
      run('signalk-server', null, 'update')
      expect(spawned[0].args).to.include('--allow-scripts=@canboat/canboatjs')
      expect(spawned[0].args).to.include('-g')
    })

    it('does not pass allow-scripts when removing', () => {
      run('signalk-server', null, 'remove')
      expect(spawned[0].args).to.not.include(
        '--allow-scripts=@canboat/canboatjs'
      )
      expect(spawned[0].args).to.include('-g')
    })
  })

  describe('config directory', () => {
    const pnpmOptions = [
      '--config.ignore-scripts=true',
      '--config.lockfile=false',
      '--config.minimum-release-age-exclude-prune=true'
    ]

    it('adds a plugin with pnpm in the config directory', () => {
      run('some-plugin', '1.2.3', 'install')
      expect(spawned[0].command).to.match(/^pnpm/)
      expect(spawned[0].cwd).to.equal(configPath)
      expect(spawned[0].args).to.deep.equal([
        'add',
        ...pnpmOptions,
        'some-plugin@1.2.3'
      ])
    })

    it('removes a plugin with pnpm', () => {
      run('some-plugin', null, 'remove')
      expect(spawned[0].args).to.deep.equal([
        'remove',
        ...pnpmOptions,
        'some-plugin'
      ])
    })

    it('restores the plugins listed in package.json with pnpm install', () => {
      run(null, null, 'install')
      expect(spawned[0].args).to.deep.equal(['install', ...pnpmOptions])
    })

    it('explains how to install pnpm when it is missing', () => {
      const result = run('some-plugin', '1.2.3', 'install')
      const enoent = Object.assign(new Error('spawn pnpm ENOENT'), {
        code: 'ENOENT',
        path: 'pnpm'
      })
      spawned[0].child.emit('error', enoent)
      spawned[0].child.emit('close', -2)
      expect(result.errors).to.deep.equal([
        'pnpm is required for installing plugins and webapps. Install it with: npm install -g pnpm@11'
      ])
      expect(result.codes).to.deep.equal([-1])
    })
  })

  describe('node_modules created by npm', () => {
    const modulesDir = () => path.join(configPath, 'node_modules')
    const backupDir = () => path.join(configPath, 'node_modules.npm')
    const npmPlugin = () => path.join(modulesDir(), 'npm-plugin')

    beforeEach(() => {
      fs.mkdirSync(npmPlugin(), { recursive: true })
    })

    it('is set aside so that pnpm rebuilds it, and dropped on success', () => {
      run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(modulesDir())).to.equal(false)
      expect(fs.existsSync(backupDir())).to.equal(true)

      fs.mkdirSync(modulesDir())
      spawned[0].child.emit('close', 0)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(fs.existsSync(npmPlugin())).to.equal(false)
    })

    it('is put back when pnpm fails', () => {
      const result = run('some-plugin', '1.2.3', 'install')
      fs.mkdirSync(modulesDir())
      spawned[0].child.emit('close', 1)
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
      expect(result.codes).to.deep.equal([1])
    })

    it('is left alone once pnpm manages it', () => {
      fs.writeFileSync(path.join(modulesDir(), '.modules.yaml'), '')
      run('some-plugin', '1.2.3', 'install')
      expect(fs.existsSync(npmPlugin())).to.equal(true)
      expect(fs.existsSync(backupDir())).to.equal(false)
    })
  })
})
