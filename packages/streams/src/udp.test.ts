import { expect } from 'chai'
import dgram from 'dgram'
import { Writable } from 'stream'
import Udp from './udp'
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

describe('Udp', () => {
  it('receives UDP datagrams and pushes to stream', function (done) {
    this.timeout(5000)
    const app = createMockApp()
    const udp = new Udp({
      port: 0,
      app,
      providerId: 'test-udp',
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    udp.pipe(writable)

    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const socket = (udp as any).socket as dgram.Socket
      const addr = socket.address()
      const port = addr.port

      const sender = dgram.createSocket('udp4')
      const msg = Buffer.from('hello udp')
      sender.send(msg, 0, msg.length, port, '127.0.0.1', () => {
        sender.close()
      })

      setTimeout(() => {
        expect(writable.chunks.join('')).to.include('hello udp')
        udp.end()
        done()
      }, 500)
    }, 500)
  })
})
