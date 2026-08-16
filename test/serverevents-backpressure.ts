import { expect } from 'chai'
import WebSocket from 'ws'
import type { Socket } from 'net'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// Server events are written straight to the socket, outside the delta
// accumulator. They must still count against the send-buffer overflow
// limit, otherwise a client that stops reading (or a plugin emitting
// events in a loop) grows the socket buffer without bound.

const MAX_SEND_BUFFER = 64 * 1024
const MAX_BUFFER_CHECK_TIME_MS = 500
const EVENT_PAYLOAD = 'x'.repeat(100 * 1024)
const EMIT_INTERVAL_MS = 10
const FLOOD_MS = 1500
const OVERFLOW_MESSAGE =
  'Server outgoing buffer overflow, terminating connection'

describe('Server events send-buffer overflow', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number

  before(async function () {
    this.timeout(90000)
    port = await freeport()
    server = await startServerP(port, false, {
      maxSendBufferSize: MAX_SEND_BUFFER,
      maxSendBufferCheckTime: MAX_BUFFER_CHECK_TIME_MS
    })
  })

  after(async function () {
    await server.stop()
  })

  it('terminates a serverevents client whose send buffer stays over the limit', async function () {
    this.timeout(30000)
    const ws = new WebSocket(
      `ws://0.0.0.0:${port}/signalk/v1/stream?serverevents=all&subscribe=none&sendCachedValues=false`
    )
    const received: string[] = []
    ws.on('message', (data) => received.push(String(data)))
    const closed = new Promise<void>((resolve) =>
      ws.on('close', () => resolve())
    )
    await new Promise<void>((resolve) => ws.on('open', () => resolve()))

    // Stop reading so the server-side buffer fills up.
    const socket = (ws as unknown as { _socket?: Socket })._socket
    if (!socket) {
      throw new Error('ws client exposes no _socket to pause')
    }
    socket.pause()

    const flood = setInterval(() => {
      server.app.emit('serverevent', {
        type: 'FLOOD_TEST',
        data: EVENT_PAYLOAD
      })
    }, EMIT_INTERVAL_MS)
    await new Promise((resolve) => setTimeout(resolve, FLOOD_MS))
    clearInterval(flood)

    // Let the client drain what was queued: the overflow notice and the
    // close frame are at the end of that backlog.
    socket.resume()
    await closed

    const overflow = received
      .map((m) => {
        try {
          return JSON.parse(m)
        } catch (_e) {
          return null
        }
      })
      .find((m) => m && m.errorMessage === OVERFLOW_MESSAGE)
    expect(overflow, 'overflow notice').to.exist
  })
})
