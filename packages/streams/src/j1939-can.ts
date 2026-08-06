import { Transform, TransformCallback } from 'stream'
import type { CreateDebug, DebugLogger } from './types'

/*
 * Listen-only SocketCAN source for plain J1939 buses (engines,
 * gensets). Opens the same AF_CAN shim canboatjs's canbus transport
 * uses, but never instantiates a candevice: on an engine's J1939
 * network the server must not claim an address or transmit anything.
 * Frames are pushed in canboatjs's canbus object shape
 * ({ pgn: header, length, data }) for the wasm element downstream,
 * which decodes them against the J1939 schema flavor.
 */

interface J1939CanOptions {
  app: {
    setProviderStatus?(id: string, msg: string): void
    setProviderError?(id: string, msg: string): void
  }
  interface?: string
  providerId?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

interface CanChannelApi {
  addListener(
    event: 'onMessage',
    cb: (msg: { id: number; data: Buffer }) => void
  ): void
  addListener(event: 'onStopped', cb: () => void): void
  start(): void
  stop(): void
  removeAllListeners(): void
}

const RECONNECT_DELAY = 2000

export default class J1939Can extends Transform {
  private readonly options: J1939CanOptions
  private channel: CanChannelApi | null = null
  private stopped = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private readonly debug: DebugLogger

  constructor(options: J1939CanOptions) {
    super({ objectMode: true })
    this.options = options
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:j1939-can')
    this.connect()
  }

  private status(msg: string): void {
    if (this.options.providerId) {
      this.options.app.setProviderStatus?.(this.options.providerId, msg)
    }
    this.debug(msg)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_DELAY)
  }

  private connect(): void {
    if (this.stopped) {
      return
    }
    const iface = this.options.interface ?? 'can0'
    const { CanChannel } = require('@canboat/canboatjs/dist/canSocket') as {
      CanChannel: new (device: string) => CanChannelApi
    }
    const { parseCanId } = require('@canboat/canboatjs/dist/canId') as {
      parseCanId: (id: number) => {
        prio: number
        pgn: number
        src: number
        dst: number
      }
    }
    let channel: CanChannelApi
    try {
      channel = new CanChannel(iface)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (this.options.providerId) {
        this.options.app.setProviderError?.(this.options.providerId, message)
      }
      this.scheduleReconnect()
      return
    }
    this.channel = channel

    channel.addListener('onMessage', (msg) => {
      // Inside a listener: an uncaught throw would take the process
      // down, so a frame the header parser rejects is dropped with a
      // log line instead.
      try {
        this.push({
          pgn: parseCanId(msg.id),
          length: msg.data.length,
          data: msg.data
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        this.debug(`[frame] ${message}`)
      }
    })
    channel.addListener('onStopped', () => {
      if (this.channel !== channel) {
        return
      }
      this.channel = null
      if (!this.stopped) {
        if (this.options.providerId) {
          this.options.app.setProviderError?.(
            this.options.providerId,
            'CAN channel stopped, reconnecting'
          )
        }
        this.scheduleReconnect()
      }
    })
    try {
      channel.start()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      channel.removeAllListeners()
      channel.stop()
      this.channel = null
      if (this.options.providerId) {
        this.options.app.setProviderError?.(this.options.providerId, message)
      }
      this.scheduleReconnect()
      return
    }
    this.status(`Listening on ${iface} (J1939, listen-only)`)
  }

  // Source element: no upstream input in practice.
  _transform(
    chunk: unknown,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }

  end(): this {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const channel = this.channel
    this.channel = null
    if (channel) {
      channel.removeAllListeners()
      channel.stop()
    }
    super.end()
    return this
  }
}
