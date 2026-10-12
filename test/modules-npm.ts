import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { runNpm } from '../src/modules'
import { Config } from '../src/config/config'

// runNpm calls the spawn bound from child_process; mocking requires the mutable
// CommonJS module object (the ESM namespace exposes read-only getters), so this
// test reassigns spawn on the required module and restores it afterwards.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

type SpawnMock = (command: string, args: string[]) => ChildProcess

describe('runNpm allow-scripts', () => {
  const config = { configPath: '/tmp', name: 'signalk-server' } as Config

  const capturedArgs = (name: string, command: string): string[] => {
    const originalSpawn: SpawnMock = childProcess.spawn
    let args: string[] = []
    const spawnMock: SpawnMock = (_cmd, spawnArgs) => {
      args = spawnArgs
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (code: number) => void) => {
          if (event === 'close') cb(0)
        }
      } as unknown as ChildProcess
    }
    childProcess.spawn = spawnMock
    try {
      runNpm(
        config,
        name,
        null,
        command,
        () => {},
        () => {},
        () => {}
      )
    } finally {
      childProcess.spawn = originalSpawn
    }
    // On non-Windows the server path spawns `sudo npm <args>`, so args already
    // omit the leading npm; the plugin path spawns npm directly.
    return args
  }

  it('allows the canboatjs install script when self-updating the server', () => {
    const args = capturedArgs('signalk-server', 'install')
    expect(args).to.include('--allow-scripts=@canboat/canboatjs')
    expect(args).to.include('-g')
  })

  it('allows the canboatjs install script when updating the server', () => {
    const args = capturedArgs('signalk-server', 'update')
    expect(args).to.include('--allow-scripts=@canboat/canboatjs')
    expect(args).to.include('-g')
  })

  it('does not pass allow-scripts when removing the server', () => {
    const args = capturedArgs('signalk-server', 'remove')
    expect(args).to.not.include('--allow-scripts=@canboat/canboatjs')
    expect(args).to.include('-g')
  })

  it('does not pass allow-scripts when installing a plugin', () => {
    const args = capturedArgs('some-plugin', 'install')
    expect(args).to.not.include('--allow-scripts=@canboat/canboatjs')
    expect(args).to.include('--ignore-scripts')
  })
})

describe('runNpm package names', () => {
  const config = { configPath: '/tmp', name: 'signalk-server' } as Config

  const run = (name: string, version: string | null) => {
    const originalSpawn: SpawnMock = childProcess.spawn
    const result = {
      args: undefined as string[] | undefined,
      errors: [] as string[],
      codes: [] as number[]
    }
    childProcess.spawn = ((_cmd: string, spawnArgs: string[]) => {
      result.args = spawnArgs
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: () => {}
      } as unknown as ChildProcess
    }) as SpawnMock
    try {
      runNpm(
        config,
        name,
        version,
        'install',
        () => {},
        (err) => result.errors.push(err.message),
        (code) => result.codes.push(code)
      )
    } finally {
      childProcess.spawn = originalSpawn
    }
    return result
  }

  for (const name of [
    '../evil',
    'file:./evil',
    'https://x/evil.tgz',
    'git+https://x/evil.git',
    'evil & calc'
  ]) {
    it(`rejects ${name} without running npm`, () => {
      const result = run(name, null)
      expect(result.args).to.equal(undefined)
      expect(result.errors).to.deep.equal([`Invalid package name: ${name}`])
      expect(result.codes).to.deep.equal([-1])
    })
  }

  it('never lets a name that looks like an option reach npm as one', () => {
    const { args } = run('--global', null)
    expect(args?.slice(-3)).to.deep.equal(['install', '--', '--global'])
  })

  it('accepts scoped names', () => {
    const { args } = run('@scope/some-plugin', '1.2.3')
    expect(args?.slice(-2)).to.deep.equal(['--', '@scope/some-plugin@1.2.3'])
  })
})
