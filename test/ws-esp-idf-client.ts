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
  const originalDropOnStop = process.env.SIGNALK_WS_DROP_ON_STOP

  beforeEach(() => {
    delete process.env.SIGNALK_WS_DROP_ON_STOP
    warnings = []
    originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '))
    }
  })

  afterEach(() => {
    console.warn = originalWarn
    if (originalDropOnStop === undefined) {
      delete process.env.SIGNALK_WS_DROP_ON_STOP
    } else {
      process.env.SIGNALK_WS_DROP_ON_STOP = originalDropOnStop
    }
  })

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

  async function closeCodeOnStop(): Promise<number> {
    const port = await freeport()
    const server = await startServerP(port, false)
    let stopped = false
    try {
      const other = await connect(port)
      const code = closeCode(other)

      await server.stop()
      stopped = true

      return await code
    } finally {
      if (!stopped) {
        await server.stop()
      }
    }
  }

  it('drops every client without a close frame with SIGNALK_WS_DROP_ON_STOP=all', async () => {
    process.env.SIGNALK_WS_DROP_ON_STOP = 'all'
    assert.strictEqual(await closeCodeOnStop(), ABNORMAL_CLOSURE)
  })

  it('ignores other SIGNALK_WS_DROP_ON_STOP values with a warning', async () => {
    process.env.SIGNALK_WS_DROP_ON_STOP = 'true'
    assert.notStrictEqual(await closeCodeOnStop(), ABNORMAL_CLOSURE)
    assert(warnings.some((w) => w.includes('SIGNALK_WS_DROP_ON_STOP=true')))
  })
})
