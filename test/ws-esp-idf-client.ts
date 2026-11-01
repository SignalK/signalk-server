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
  let warnings: string[]
  let originalWarn: typeof console.warn
  const originalCloseFrame = process.env.SEND_WS_CLOSE_FRAME

  beforeEach(() => {
    delete process.env.SEND_WS_CLOSE_FRAME
    warnings = []
    originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '))
    }
  })

  afterEach(() => {
    console.warn = originalWarn
    if (originalCloseFrame === undefined) {
      delete process.env.SEND_WS_CLOSE_FRAME
    } else {
      process.env.SEND_WS_CLOSE_FRAME = originalCloseFrame
    }
  })

  it('drops every client without a close frame on stop by default', async () => {
    const codes = await closeCodesOnStop()
    assert.strictEqual(codes.esp, ABNORMAL_CLOSURE)
    assert.strictEqual(codes.other, ABNORMAL_CLOSURE)
  })

  it('turns new connections away while the server is stopping', async () => {
    const port = await freeport()
    const server = await startServerP(port, false)
    let releaseSlowInterface = () => {}
    server.app.interfaces.slowToStop = {
      stop: () =>
        new Promise<void>((resolve) => {
          releaseSlowInterface = resolve
        })
    }
    const stopping = server.stop()
    try {
      await new Promise((resolve) => setImmediate(resolve))
      await assert.rejects(
        connect(port, ESP_IDF_WS_USER_AGENT),
        /Unexpected server response: 503/
      )
    } finally {
      releaseSlowInterface()
      await stopping
    }
  })

  async function closeCodesOnStop(): Promise<{
    other: number
    esp: number
  }> {
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

      return { other: await otherCode, esp: await espCode }
    } finally {
      if (!stopped) {
        await server.stop()
      }
    }
  }

  it('sends every client a close frame with SEND_WS_CLOSE_FRAME=all', async () => {
    process.env.SEND_WS_CLOSE_FRAME = 'all'
    const codes = await closeCodesOnStop()
    assert.notStrictEqual(codes.other, ABNORMAL_CLOSURE)
    assert.notStrictEqual(codes.esp, ABNORMAL_CLOSURE)
  })

  it('drops every client without a close frame with SEND_WS_CLOSE_FRAME=none', async () => {
    process.env.SEND_WS_CLOSE_FRAME = 'none'
    const codes = await closeCodesOnStop()
    assert.strictEqual(codes.other, ABNORMAL_CLOSURE)
    assert.strictEqual(codes.esp, ABNORMAL_CLOSURE)
  })

  it('drops only ESP-IDF clients without a close frame with SEND_WS_CLOSE_FRAME=notESP32', async () => {
    process.env.SEND_WS_CLOSE_FRAME = 'notESP32'
    const codes = await closeCodesOnStop()
    assert.notStrictEqual(codes.other, ABNORMAL_CLOSURE)
    assert.strictEqual(codes.esp, ABNORMAL_CLOSURE)
  })

  it('ignores other SEND_WS_CLOSE_FRAME values with a warning', async () => {
    process.env.SEND_WS_CLOSE_FRAME = 'true'
    const codes = await closeCodesOnStop()
    assert.strictEqual(codes.other, ABNORMAL_CLOSURE)
    assert.strictEqual(codes.esp, ABNORMAL_CLOSURE)
    assert(warnings.some((w) => w.includes('SEND_WS_CLOSE_FRAME=true')))
  })
})
