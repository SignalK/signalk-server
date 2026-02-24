import { expect } from 'chai'
import net from 'net'
import { Writable } from 'stream'
import TcpStream from './tcp'
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

describe('TcpStream', () => {
  let server: net.Server
  let serverPort: number

  beforeEach((done) => {
    server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      serverPort = addr.port
      done()
    })
  })

  afterEach((done) => {
    server.close(() => done())
  })

  it('connects to TCP server and receives data', function (done) {
    this.timeout(5000)
    server.on('connection', (socket) => {
      socket.write('hello from server\n')
    })

    const app = createMockApp()
    const tcp = new TcpStream({
      host: '127.0.0.1',
      port: serverPort,
      app,
      providerId: 'test-tcp',
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    tcp.pipe(writable)

    setTimeout(() => {
      expect(writable.chunks.join('')).to.include('hello from server')
      expect(
        app.providerStatuses.some((s) => s.msg.includes('Connected'))
      ).to.equal(true)
      tcp.end()
      done()
    }, 1000)
  })

  it('sends data to TCP server via outEvent', function (done) {
    this.timeout(5000)
    const received: string[] = []
    server.on('connection', (socket) => {
      socket.on('data', (data) => received.push(data.toString()))
    })

    const app = createMockApp()
    const tcp = new TcpStream({
      host: '127.0.0.1',
      port: serverPort,
      app,
      providerId: 'test-tcp',
      outEvent: 'tcpOut',
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    tcp.pipe(writable)

    setTimeout(() => {
      app.emit('tcpOut', 'test data')
      setTimeout(() => {
        expect(received.join('')).to.include('test data')
        tcp.end()
        done()
      }, 500)
    }, 500)
  })

  it('sends data to TCP server via toStdout event', function (done) {
    this.timeout(5000)
    const received: string[] = []
    server.on('connection', (socket) => {
      socket.on('data', (data) => received.push(data.toString()))
    })

    const app = createMockApp()
    const tcp = new TcpStream({
      host: '127.0.0.1',
      port: serverPort,
      app,
      providerId: 'test-tcp',
      toStdout: 'stdoutEvent',
      createDebug: createDebugStub()
    })

    const writable = createCollectingWritable()
    tcp.pipe(writable)

    setTimeout(() => {
      app.emit('stdoutEvent', 'stdout data')
      setTimeout(() => {
        expect(received.join('')).to.include('stdout data')
        tcp.end()
        done()
      }, 500)
    }, 500)
  })
})
