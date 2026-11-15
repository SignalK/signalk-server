import { expect } from 'chai'
import dgram from 'dgram'
import { once } from 'events'
import { Writable } from 'stream'
import { mock } from 'node:test'
import Udp from './udp'
import { createMockApp, createDebugStub } from './test-helpers'

describe('Udp text encoding', () => {
  it('sends all UTF-8 bytes rather than a character count', async () => {
    const socket = dgram.createSocket('udp4')
    const packets: Buffer[] = []
    const factory = mock.method(dgram, 'createSocket', () => socket)
    const sender = mock.method(
      socket,
      'send',
      (message: string | Uint8Array, offset: number, length: number) => {
        const bytes =
          typeof message === 'string'
            ? Buffer.from(message, 'utf8')
            : Buffer.from(message)
        packets.push(bytes.subarray(offset, offset + length))
        return socket
      }
    )
    const app = createMockApp()
    const udp = new Udp({
      port: 0,
      app,
      providerId: 'unicode-test',
      outEvent: 'output',
      createDebug: createDebugStub()
    })
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      }
    })
    try {
      const listening = once(socket, 'listening')
      udp.pipe(output)
      await listening
      for (const message of ['hello', '风🌊']) app.emit('output', message)
      expect(packets.map((packet) => packet.toString())).to.deep.equal([
        'hello',
        '风🌊'
      ])
    } finally {
      const closed = once(socket, 'close')
      udp.end()
      await closed
      sender.mock.restore()
      factory.mock.restore()
    }
  })
})
