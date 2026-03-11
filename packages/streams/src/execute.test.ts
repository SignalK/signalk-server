import { expect } from 'chai'
import { Writable } from 'stream'
import Execute from './execute'
import { createMockApp, createDebugStub } from './test-helpers'

function createCollectingWritable(): Writable & { chunks: string[] } {
  const chunks: string[] = []
  const writable = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
      chunks.push(chunk.toString())
      writable.emit('chunk', chunk.toString())
      callback()
    }
  })
  return Object.assign(writable, { chunks })
}

describe('Execute', () => {
  it('captures stdout from child process', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const exec = new Execute({
      command: 'echo hello',
      app,
      providerId: 'test-exec',
      restartOnClose: false,
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    writable.on('chunk', () => {
      if (writable.chunks.join('').includes('hello')) {
        expect(app.providerStatuses.some((s) => s.msg === 'Started')).to.equal(
          true
        )
        exec.end()
        done()
      }
    })
    exec.pipe(writable)
  })

  it('reports stderr on app provider error', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const origSetError = app.setProviderError.bind(app)
    app.setProviderError = (id: string, msg: string) => {
      origSetError(id, msg)
      if (msg.includes('error')) {
        exec.end()
        done()
      }
    }

    const exec = new Execute({
      command: 'echo error >&2',
      app,
      providerId: 'test-exec',
      restartOnClose: false,
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    exec.pipe(writable)
  })

  it('writes to child process stdin via app event', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const origSetStatus = app.setProviderStatus.bind(app)
    app.setProviderStatus = (id: string, msg: string) => {
      origSetStatus(id, msg)
      if (msg === 'Started') {
        setImmediate(() => app.emit('testInput', 'hello from event'))
      }
    }

    const exec = new Execute({
      command: 'cat',
      app,
      providerId: 'test-exec',
      toChildProcess: 'testInput',
      restartOnClose: false,
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    writable.on('chunk', () => {
      if (writable.chunks.join('').includes('hello from event')) {
        exec.end()
        done()
      }
    })
    exec.pipe(writable)
  })
})
