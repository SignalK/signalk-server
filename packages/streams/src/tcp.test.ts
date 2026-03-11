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
      writable.emit('chunk', chunk.toString())
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
    writable.on('chunk', () => {
      if (writable.chunks.join('').includes('hello from server')) {
        expect(
          app.providerStatuses.some((s) => s.msg.includes('Connected'))
        ).to.equal(true)
        tcp.end()
        done()
      }
    })
    tcp.pipe(writable)
  })

  it('sends data to TCP server via outEvent', function (done) {
    this.timeout(5000)
    const received: string[] = []
    server.on('connection', (socket) => {
      socket.on('data', (data) => {
        received.push(data.toString())
        if (received.join('').includes('test data')) {
          tcp.end()
          done()
        }
      })
    })

    const app = createMockApp()
    const origSetStatus = app.setProviderStatus.bind(app)
    app.setProviderStatus = (id: string, msg: string) => {
      origSetStatus(id, msg)
      if (msg.includes('Connected')) {
        app.emit('tcpOut', 'test data')
      }
    }

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
  })

  it('sends data to TCP server via toStdout event', function (done) {
    this.timeout(5000)
    const received: string[] = []
    server.on('connection', (socket) => {
      socket.on('data', (data) => {
        received.push(data.toString())
        if (received.join('').includes('stdout data')) {
          tcp.end()
          done()
        }
      })
    })

    const app = createMockApp()
    const origSetStatus = app.setProviderStatus.bind(app)
    app.setProviderStatus = (id: string, msg: string) => {
      origSetStatus(id, msg)
      if (msg.includes('Connected')) {
        app.emit('stdoutEvent', 'stdout data')
      }
    }

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
  })
})
