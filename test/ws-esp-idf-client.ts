import assert from 'assert'
import WebSocket from 'ws'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const ESP_IDF_WS_USER_AGENT = 'ESP32 Websocket Client'
// ws reports this code when the connection ended without a close frame.
const ABNORMAL_CLOSURE = 1006

function connect(port: number, userAgent?: string): Promise<WebSocket> {
  const ws = new WebSocket(
    `ws://localhost:${port}/signalk/v1/stream?subscribe=none`,
    userAgent ? { headers: { 'User-Agent': userAgent } } : undefined
  )
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function closeCode(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once('close', (code) => resolve(code)))
}

describe('ESP-IDF WebSocket clients', () => {
  it('drops them without a close frame on stop, and closes others cleanly', async () => {
    const port = await freeport()
    const server = await startServerP(port, false)
    let stopped = false
    try {
      const other = await connect(port)
      const esp = await connect(port, ESP_IDF_WS_USER_AGENT)
      const otherCode = closeCode(other)
      const espCode = closeCode(esp)

      await server.stop()
      stopped = true

      assert.strictEqual(await espCode, ABNORMAL_CLOSURE)
      assert.notStrictEqual(await otherCode, ABNORMAL_CLOSURE)
    } finally {
      if (!stopped) {
        await server.stop()
      }
    }
  })
})
