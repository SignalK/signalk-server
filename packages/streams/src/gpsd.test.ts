import { expect } from 'chai'
import net from 'net'
import { Writable } from 'stream'
import Gpsd from './gpsd'
import { createMockApp, createDebugStub } from './test-helpers'

describe('Gpsd', () => {
  let server: net.Server
  let serverPort: number
  const activeSockets = new Set<net.Socket>()
  const pendingStreams = new Set<Gpsd>()
  const pendingIntervals = new Set<ReturnType<typeof setInterval>>()

  beforeEach((done) => {
    server = net.createServer((socket) => {
      activeSockets.add(socket)
      socket.on('close', () => activeSockets.delete(socket))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      serverPort = addr.port
      done()
    })
  })

  afterEach((done) => {
    pendingIntervals.forEach((i) => clearInterval(i))
    pendingIntervals.clear()
    pendingStreams.forEach((s) => s.end())
    pendingStreams.clear()
    activeSockets.forEach((s) => s.destroy())
    activeSockets.clear()
    if (server.listening) {
      server.close(() => done())
    } else {
      done()
    }
  })

  it('does not report a provider error for the initial connection attempt', function (done) {
    this.timeout(5000)

    server.on('connection', (socket) => {
      socket.write('$GPRMC,,V,,,,,,,,,,N*53\r\n')
    })

    const app = createMockApp()
    const gpsd = new Gpsd({
      host: '127.0.0.1',
      port: serverPort,
      app,
      providerId: 'test-gpsd',
      createDebug: createDebugStub()
    })
    pendingStreams.add(gpsd)

    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      }
    })

    writable.on('pipe', () => {
      setTimeout(() => {
        const retryZeroErrors = app.providerErrors.filter((e) =>
          e.msg.includes('retry 0')
        )
        expect(retryZeroErrors).to.have.lengthOf(0)
        expect(
          app.providerStatuses.some((s) => s.msg.includes('Connected'))
        ).to.equal(true)
        done()
      }, 200)
    })

    gpsd.pipe(writable)
  })

  it('reports a provider error for actual reconnect attempts (retry > 0)', function (done) {
    this.timeout(5000)

    // Close the listener so connection attempts fail and reconnect-core retries.
    server.close(() => {
      const app = createMockApp()
      const gpsd = new Gpsd({
        host: '127.0.0.1',
        port: serverPort,
        app,
        providerId: 'test-gpsd',
        createDebug: createDebugStub()
      })
      pendingStreams.add(gpsd)

      const writable = new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        }
      })

      const check = setInterval(() => {
        const retryErrors = app.providerErrors.filter((e) =>
          /retry [1-9]/.test(e.msg)
        )
        if (retryErrors.length > 0) {
          clearInterval(check)
          pendingIntervals.delete(check)
          done()
        }
      }, 50)
      pendingIntervals.add(check)

      gpsd.pipe(writable)
    })
  })
})
