import { expect } from 'chai'
import { Writable } from 'stream'
import Execute from './execute'
import { createMockApp, createDebugStub } from './test-helpers'

function createCollectingWritable(): Writable & { chunks: string[] } {
  const chunks: string[] = []
  const writable = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
      chunks.push(chunk.toString())
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
    exec.pipe(writable)

    setTimeout(() => {
      expect(writable.chunks.join('')).to.include('hello')
      expect(app.providerStatuses.some((s) => s.msg === 'Started')).to.equal(
        true
      )
      exec.end()
      done()
    }, 1000)
  })

  it('reports stderr on app provider error', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const exec = new Execute({
      command: 'echo error >&2',
      app,
      providerId: 'test-exec',
      restartOnClose: false,
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    exec.pipe(writable)

    setTimeout(() => {
      expect(app.providerErrors.some((e) => e.msg.includes('error'))).to.equal(
        true
      )
      exec.end()
      done()
    }, 1000)
  })

  it('writes to child process stdin via app event', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const exec = new Execute({
      command: 'cat',
      app,
      providerId: 'test-exec',
      toChildProcess: 'testInput',
      restartOnClose: false,
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    exec.pipe(writable)

    setTimeout(() => {
      app.emit('testInput', 'hello from event')
      setTimeout(() => {
        expect(writable.chunks.join('')).to.include('hello from event')
        exec.end()
        done()
      }, 500)
    }, 500)
  })
})
