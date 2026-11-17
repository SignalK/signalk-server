import { expect } from 'chai'
import net from 'net'
import { Writable } from 'stream'
import { setTimeout as delay } from 'timers/promises'
import TcpStream from './tcp'
import { createMockApp, createDebugStub } from './test-helpers'

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for TCP data recovery')
    }
    await delay(10)
  }
}

describe('TcpStream idle timeout', () => {
  let server: net.Server
  let port: number
  let tcp: TcpStream
  let sockets: net.Socket[]
  let chunks: string[]
  let app: ReturnType<typeof createMockApp>

  beforeEach(async () => {
    sockets = []
    chunks = []
    app = createMockApp()
    // Model a gateway that accepts our FIN but keeps its sending side open.
    server = net.createServer({ allowHalfOpen: true }, (socket) => {
      sockets.push(socket)
      socket.resume()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as net.AddressInfo).port
  })

  afterEach(async () => {
    tcp?.end()
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function connect(timeoutSeconds: number): void {
    tcp = new TcpStream({
      host: '127.0.0.1',
      port,
      app,
      providerId: 'idle-test',
      noDataReceivedTimeout: timeoutSeconds,
      createDebug: createDebugStub()
    })
    tcp.pipe(
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk.toString())
          callback()
        }
      })
    )
  }

  it('reconnects and resumes data when the idle peer never closes', async () => {
    server.on('connection', (socket) => {
      socket.write(sockets.length === 1 ? 'initial\n' : 'recovered\n')
    })
    connect(1)
    await waitFor(() => chunks.join('').includes('initial\n'))
    await waitFor(() => chunks.join('').includes('recovered\n'))
    expect(sockets).to.have.length(2)
    expect(
      app.providerErrors.some(({ msg }) => msg.includes('Disconnected'))
    ).to.equal(true)
    expect(
      app.providerStatuses.filter(({ msg }) => msg.includes('Connected'))
    ).to.have.length(2)
  })

  it('keeps an idle connection when its timeout is disabled', async () => {
    connect(0)
    await waitFor(() => sockets.length === 1)
    await delay(1250)
    const peer = sockets[0]
    if (!peer) throw new Error('Missing TCP peer')
    peer.write('still connected\n')
    await waitFor(() => chunks.join('').includes('still connected\n'))
    expect(sockets).to.have.length(1)
    expect(app.providerErrors).to.have.length(0)
  })

  it('keeps a connection receiving data within the idle interval', async () => {
    connect(1)
    await waitFor(() => sockets.length === 1)
    const peer = sockets[0]
    if (!peer) throw new Error('Missing TCP peer')
    const timer = setInterval(() => peer.write('active\n'), 100)
    try {
      await delay(1250)
      expect(chunks.join('')).to.include('active\n')
      expect(sockets).to.have.length(1)
      expect(app.providerErrors).to.have.length(0)
    } finally {
      clearInterval(timer)
    }
  })
})
