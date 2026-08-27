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
