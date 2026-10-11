import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resetModuleCaches } from '../src/modules'
import { main } from '../src/pnpm-command'

// The command runs pnpm through the spawn and execFile bound from
// child_process, which are reassigned on the mutable CommonJS module object
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

describe('signalk-pnpm', () => {
  let configPath: string
  let spawned: { args: string[]; cwd?: string; child: ChildProcess }[]
  let originalSpawn: typeof childProcess.spawn
  let originalExecFile: typeof childProcess.execFile
  let originalConfigDir: string | undefined

  beforeEach(() => {
    configPath = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_cmd'))
    fs.writeFileSync(path.join(configPath, 'package.json'), '{}\n')
    spawned = []
    resetModuleCaches()
    originalSpawn = childProcess.spawn
    originalExecFile = childProcess.execFile
    originalConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    process.env.SIGNALK_NODE_CONFIG_DIR = configPath
    childProcess.spawn = (
      _command: string,
      args: string[],
      opts: { cwd?: string }
    ) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter()
      }) as unknown as ChildProcess
      spawned.push({ args, cwd: opts.cwd, child })
      return child
    }
    childProcess.execFile = (
      _command: string,
      _args: string[],
      _opts: object,
      callback: (err: Error | null, stdout: string) => void
    ) => callback(null, '/store/v11\n')
  })

  afterEach(async () => {
    // A successful run is followed by pruning the store
    for (let i = 0; i < 500 && spawned.length === 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    for (const { child } of spawned) {
      child.emit('close', 0)
    }
    childProcess.spawn = originalSpawn
    childProcess.execFile = originalExecFile
    if (originalConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = originalConfigDir
    }
    fs.rmSync(configPath, { recursive: true, force: true })
  })

  it('runs a pnpm command in the configuration directory', async () => {
    const code = main(['add', '@signalk/some-plugin'])
    for (let i = 0; i < 500 && spawned.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    expect(spawned[0].cwd).to.equal(configPath)
    expect(spawned[0].args.slice(-2)).to.deep.equal([
      'add',
      '@signalk/some-plugin'
    ])
    expect(spawned[0].args).to.include('--config.ignore-scripts=true')
    spawned[0].child.emit('close', 0)
    expect(await code).to.equal(0)
  })

  it('passes relative paths on from where it was run', async () => {
    const code = main([
      'add',
      '.',
      '..',
      './plugin.tgz',
      'file:../other.tgz',
      'link:.',
      '.hidden',
      'some-plugin'
    ])
    for (let i = 0; i < 500 && spawned.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    expect(spawned[0].args.slice(-8)).to.deep.equal([
      'add',
      path.resolve('.'),
      path.resolve('..'),
      path.resolve('plugin.tgz'),
      `file:${path.resolve('..', 'other.tgz')}`,
      `link:${path.resolve('.')}`,
      '.hidden',
      'some-plugin'
    ])
    spawned[0].child.emit('close', 0)
    await code
  })

  it('refuses a configuration directory that does not exist', async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = path.join(configPath, 'missing')
    expect(await main(['add', '@signalk/some-plugin'])).to.equal(1)
    expect(spawned).to.deep.equal([])
  })

  // As in a Docker image build, before the server has ever started
  it('starts the package.json that the server would', async () => {
    fs.rmSync(path.join(configPath, 'package.json'))
    const code = main(['add', '@signalk/some-plugin'])
    for (let i = 0; i < 500 && spawned.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(configPath, 'package.json'), 'utf8')
    )
    expect(packageJson.name).to.equal('signalk-server-config')
    spawned[0].child.emit('close', 0)
    await code
  })

  it('refuses to run as root in a directory that another user owns', async () => {
    const originalGetuid = process.getuid
    if (process.getuid?.() === 0) {
      fs.chownSync(configPath, 1000, 1000)
    }
    process.getuid = () => 0
    try {
      expect(await main(['add', '@signalk/some-plugin'])).to.equal(1)
    } finally {
      process.getuid = originalGetuid
    }
    expect(spawned).to.deep.equal([])
  })
})
