import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'
import net from 'net'

const require = createRequire(import.meta.url)

type AppLike = EventEmitter & {
  signalk: EventEmitter
}

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'string' || address === null) {
        server.close(() => resolve(10110))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })

describe('nmea tcp interface', () => {
  it('exposes mdns config with env port', () => {
    const envBackup = process.env.NMEA0183PORT
    process.env.NMEA0183PORT = '12345'

    delete require.cache[require.resolve('../../src/interfaces/nmea-tcp')]
    const nmeaTcp = require('../../src/interfaces/nmea-tcp') as (
      app: AppLike
    ) => { mdns: { name: string; type: string; port: number } }

    const app = Object.assign(new EventEmitter(), {
      signalk: new EventEmitter()
    })

    const api = nmeaTcp(app)
    expect(api.mdns).to.deep.equal({
      name: '_nmea-0183',
      type: 'tcp',
      port: '12345'
    })

    if (typeof envBackup === 'undefined') {
      delete process.env.NMEA0183PORT
    } else {
      process.env.NMEA0183PORT = envBackup
    }
  })

  it('emits incoming data and broadcasts outgoing messages', async () => {
    const envBackup = process.env.NMEA0183PORT
    const port = await getFreePort()
    process.env.NMEA0183PORT = String(port)

    delete require.cache[require.resolve('../../src/interfaces/nmea-tcp')]
    const nmeaTcp = require('../../src/interfaces/nmea-tcp') as (
      app: AppLike
    ) => { start: () => void; stop: () => void }

    const app = Object.assign(new EventEmitter(), {
      signalk: new EventEmitter()
    })

    const api = nmeaTcp(app)
    api.start()

    const socket = net.connect({ host: '127.0.0.1', port })
    await new Promise<void>((resolve) =>
      socket.once('connect', () => resolve())
    )

    const incoming = new Promise<string>((resolve) => {
      app.once('tcpserver0183data', (data: string) => resolve(data))
    })

    socket.write('$GPGLL,1')

    const incomingValue = await incoming
    expect(incomingValue).to.equal('$GPGLL,1')

    const outgoingChunks: string[] = []
    socket.on('data', (data) => outgoingChunks.push(data.toString()))

    app.signalk.emit('nmea0183', 'OUT1')
    app.emit('nmea0183out', 'OUT2')

    await new Promise((resolve) => setTimeout(resolve, 50))

    const outgoing = outgoingChunks.join('')
    expect(outgoing).to.include('OUT1\r\n')
    expect(outgoing).to.include('OUT2\r\n')

    socket.end()
    api.stop()
    if (typeof envBackup === 'undefined') {
      delete process.env.NMEA0183PORT
    } else {
      process.env.NMEA0183PORT = envBackup
    }
  })

  it('handles socket and server errors', () => {
    const netPath = require.resolve('net')
    const originalNet = require.cache[netPath]

    const serverHandlers: Record<string, (arg?: unknown) => void> = {}
    let connectionHandler: ((socket: EventEmitter) => void) | undefined

    const fakeServer = new EventEmitter() as EventEmitter & {
      listen: (_port: number) => void
      close: () => void
      on: (event: string, handler: (arg?: unknown) => void) => void
    }

    fakeServer.listen = () => {
      if (serverHandlers.listening) {
        serverHandlers.listening()
      }
    }
    fakeServer.close = () => undefined
    fakeServer.on = (event, handler) => {
      serverHandlers[event] = handler
    }

    const fakeNet = {
      createServer: (handler: (socket: EventEmitter) => void) => {
        connectionHandler = handler
        return fakeServer
      }
    }

    require.cache[netPath] = {
      id: netPath,
      filename: netPath,
      loaded: true,
      exports: fakeNet
    }

    delete require.cache[require.resolve('../../src/interfaces/nmea-tcp')]
    const nmeaTcp = require('../../src/interfaces/nmea-tcp') as (
      app: AppLike
    ) => { start: () => void; stop: () => void }

    const app = Object.assign(new EventEmitter(), {
      signalk: new EventEmitter()
    })

    const api = nmeaTcp(app)

    const originalError = console.error
    let errorCount = 0
    console.error = () => {
      errorCount += 1
    }

    try {
      api.start()

      const socket = new EventEmitter() as EventEmitter & {
        remoteAddress?: string
        remotePort?: number
        write: () => void
      }
      socket.remoteAddress = '127.0.0.1'
      socket.remotePort = 1234
      socket.write = () => {
        throw new Error('write failed')
      }

      connectionHandler?.(socket)

      app.signalk.emit('nmea0183', 'OUT')
      socket.emit('error', new Error('socket error'))
      serverHandlers.error?.(new Error('server error'))

      expect(errorCount).to.be.greaterThan(0)
    } finally {
      console.error = originalError
      api.stop()
      if (originalNet) {
        require.cache[netPath] = originalNet
      } else {
        delete require.cache[netPath]
      }
      delete require.cache[require.resolve('../../src/interfaces/nmea-tcp')]
    }
  })
})
