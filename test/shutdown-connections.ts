import assert from 'assert'
import net from 'net'
import WebSocket from 'ws'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

// Well below ws's 30 s close timeout, which is what an unanswered close frame
// would otherwise cost.
const STOP_BUDGET_MS = 5000

async function timedStop(server: { stop: () => Promise<unknown> }) {
  const t0 = Date.now()
  await server.stop()
  return Date.now() - t0
}

describe('Server.stop with connections that do not end', () => {
  it('ends a WebSocket whose client never answers the close frame', async () => {
    const port = await freeport()
    const server = await startServerP(port, false)
    const ws = new WebSocket(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=none`
    )
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    // A paused socket reads nothing, so this client never sees the server's
    // close frame and never answers it, like a client on a sleeping tablet.
    ;(ws as unknown as { _socket: net.Socket })._socket.pause()

    try {
      const elapsed = await timedStop(server)
      assert(
        elapsed < STOP_BUDGET_MS,
        `stop() took ${elapsed}ms with an unanswered WebSocket`
      )
    } finally {
      ws.terminate()
    }
  })

  it('ends an HTTP connection whose request never completes', async () => {
    const port = await freeport()
    const server = await startServerP(port, false)
    const socket = net.connect(port, 'localhost')
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    // Headers without the terminating blank line: the request stays in
    // progress, so the connection never counts as idle.
    socket.write('GET /signalk HTTP/1.1\r\nHost: localhost\r\n')
    socket.on('error', () => {
      // the server destroying the socket is the expected outcome
    })

    try {
      const elapsed = await timedStop(server)
      assert(
        elapsed < STOP_BUDGET_MS,
        `stop() took ${elapsed}ms with an unfinished request`
      )
    } finally {
      socket.destroy()
    }
  })
})
