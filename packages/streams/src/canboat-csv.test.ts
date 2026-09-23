import { expect } from 'chai'
import net from 'net'
import { Writable } from 'stream'
import CanboatCsvStream from './canboat-csv'
import { createMockApp, createDebugStub } from './test-helpers'

const RAW_LINE =
  '2026-05-29T19:16:04.826Z,2,127251,14,255,8,ff,5e,7d,00,00,ff,ff,ff'

interface TestServer {
  server: net.Server
  port: number
  sockets: net.Socket[]
  received: string
}

// `halfClose` mirrors canboat-pipeline's input port, which shuts down
// its sending side of every connection as soon as it accepts it.
function startServer(halfClose = false): Promise<TestServer> {
  const server = net.createServer({ allowHalfOpen: halfClose })
  const state: TestServer = { server, port: 0, sockets: [], received: '' }
  server.on('connection', (socket) => {
    state.sockets.push(socket)
    socket.on('data', (data) => {
      state.received += data.toString()
    })
    if (halfClose) {
      socket.end()
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      state.port = (server.address() as net.AddressInfo).port
      resolve(state)
    })
  })
}

function stopServer(s: TestServer): Promise<void> {
  s.sockets.forEach((socket) => socket.destroy())
  return new Promise((resolve) => s.server.close(() => resolve()))
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'))
      } else {
        setTimeout(check, 10)
      }
    }
    check()
  })
}

describe('CanboatCsvStream', () => {
  let rawServer: TestServer
  let inputServer: TestServer
  let app: ReturnType<typeof createMockApp>
  let stream: CanboatCsvStream
  let output: string

  beforeEach(async () => {
    rawServer = await startServer()
    inputServer = await startServer(true)
    app = createMockApp()
    output = ''
    stream = new CanboatCsvStream({
      host: '127.0.0.1',
      port: rawServer.port,
      inputPort: String(inputServer.port),
      app,
      providerId: 'test-canboat-csv',
      createDebug: createDebugStub()
    })
    stream.pipe(
      new Writable({
        write(chunk, _encoding, callback) {
          output += chunk.toString()
          callback()
        }
      })
    )
    await waitFor(
      () => rawServer.sockets.length > 0 && inputServer.sockets.length > 0
    )
  })

  afterEach(async () => {
    stream.end()
    await Promise.all([stopServer(rawServer), stopServer(inputServer)])
  })

  it('pushes lines received on the raw port downstream', async () => {
    for (const socket of rawServer.sockets) {
      socket.write(`# format=FAST\r\n${RAW_LINE}\r\n`)
    }
    await waitFor(() => output.includes(RAW_LINE))
  })

  it('sends outbound lines to the input port, not the raw port', async () => {
    await waitFor(() =>
      app.providerStatuses.some(
        (s) => s.msg.includes('input port') && !s.msg.includes('connecting')
      )
    )
    app.emit('nmea2000out', RAW_LINE)
    await waitFor(() => inputServer.received.includes(`${RAW_LINE}\r\n`))
    expect(rawServer.received).to.equal('')
  })

  it('encodes nmea2000JsonOut objects onto the input port', async () => {
    await waitFor(() =>
      app.providerStatuses.some((s) => !s.msg.includes('connecting'))
    )
    app.emit('nmea2000JsonOut', {
      pgn: 59904,
      dst: 255,
      fields: { PGN: 60928 }
    })
    await waitFor(() => inputServer.received.includes(',59904,'))
    expect(rawServer.received).to.equal('')
  })
  it('keeps the input connection open when the pipeline half-closes it', async () => {
    let outAvailable = 0
    app.on('nmea2000OutAvailable', () => outAvailable++)
    await new Promise((resolve) => setTimeout(resolve, 300))
    app.emit('nmea2000out', RAW_LINE)
    await waitFor(() => inputServer.received.includes(RAW_LINE))
    expect(inputServer.sockets).to.have.lengthOf(1)
    expect(outAvailable).to.equal(0)
  })
})

describe('CanboatCsvStream nmea2000OutAvailable', () => {
  it('is only signalled once the input port connects', async () => {
    const rawServer = await startServer()
    const inputServer = await startServer()
    const inputPort = inputServer.port
    await stopServer(inputServer)

    const app = createMockApp()
    let outAvailable = 0
    app.on('nmea2000OutAvailable', () => outAvailable++)
    const stream = new CanboatCsvStream({
      host: '127.0.0.1',
      port: rawServer.port,
      inputPort,
      app,
      providerId: 'test-canboat-csv',
      createDebug: createDebugStub()
    })
    stream.pipe(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        }
      })
    )

    let reopened: net.Server | undefined
    try {
      await waitFor(() => rawServer.sockets.length > 0)
      expect(outAvailable).to.equal(0)

      const server = net.createServer()
      reopened = server
      await new Promise<void>((resolve) =>
        server.listen(inputPort, '127.0.0.1', () => resolve())
      )
      await waitFor(() => outAvailable === 1, 8000)
    } finally {
      stream.end()
      reopened?.close()
      await stopServer(rawServer)
    }
  }).timeout(10000)
})
