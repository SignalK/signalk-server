import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import { SERVER_START_TIMEOUT, startServer } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')

interface QueueApp {
  queueModuleInstall: (
    name: string,
    version: string,
    options: { npm: object; onClose: (code: number) => void }
  ) => void
}

interface FakeNpm {
  args: string[]
  spec: string
  close: (code: number) => void
}

describe('appstore install queue', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let stop: (() => Promise<unknown>) | undefined
  let app: QueueApp
  let originalSpawn: typeof childProcess.spawn
  const running: FakeNpm[] = []

  before(async function () {
    const s = await startServer()
    stop = s.stop
    app = (s.server as unknown as { app: QueueApp }).app
    originalSpawn = childProcess.spawn
    childProcess.spawn = (_cmd: string, args: string[]) => {
      const handlers: Record<string, (code: number) => void> = {}
      running.push({
        args,
        spec: args[args.indexOf('--') + 1],
        close: (code) => handlers.close(code)
      })
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (code: number) => void) => {
          handlers[event] = cb
        }
      } as unknown as ChildProcess
    }
  })

  after(async function () {
    childProcess.spawn = originalSpawn
    if (stop) await stop()
  })

  it('runs an install started from a completion callback after the queued ones', function () {
    const npm = { preferOffline: true }
    const closed: Array<[string, number]> = []
    app.queueModuleInstall('first-plugin', '1.0.0', {
      npm,
      onClose: (code) => {
        closed.push(['first-plugin', code])
        app.queueModuleInstall('chained-plugin', '1.0.0', {
          npm,
          onClose: (code) => closed.push(['chained-plugin', code])
        })
      }
    })
    app.queueModuleInstall('queued-plugin', '1.0.0', {
      npm,
      onClose: (code) => closed.push(['queued-plugin', code])
    })
    expect(running.map((p) => p.spec)).to.deep.equal(['first-plugin@1.0.0'])

    running[0].close(0)
    expect(running.map((p) => p.spec)).to.deep.equal([
      'first-plugin@1.0.0',
      'queued-plugin@1.0.0'
    ])

    running[1].close(0)
    expect(running.map((p) => p.spec)).to.deep.equal([
      'first-plugin@1.0.0',
      'queued-plugin@1.0.0',
      'chained-plugin@1.0.0'
    ])
    running[2].close(1)
    expect(closed).to.deep.equal([
      ['first-plugin', 0],
      ['queued-plugin', 0],
      ['chained-plugin', 1]
    ])
    for (const { args } of running) {
      expect(args).to.include.members(['--prefer-offline', '--no-audit'])
    }
  })
})
