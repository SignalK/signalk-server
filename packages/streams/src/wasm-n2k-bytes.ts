import { Transform, TransformCallback } from 'stream'
import { Socket } from 'net'
import type { CreateDebug, DebugLogger } from './types'

/*
 * Binary-framing NMEA 2000 source backed by @canboat/wasm's
 * ByteDecoder: Actisense BEM over TCP (W2K-1 Actisense mode) and the
 * Maretron IPG100/200 session protocol including its text handshake.
 * This element owns the TCP socket — the wasm session machine decides
 * what to write (CONNECT/init, handshake responses, keepalives) and
 * every received byte goes through the same Rust framing code the
 * native canboat gateway readers use.
 *
 * Output is canboatjs-shaped PGN objects, ready for N2kToSignalK.
 * TX: nmea2000JsonOut records are encoded to device transmit bytes
 * in-process and written to the socket.
 */

interface WasmN2kBytesOptions {
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
    setProviderStatus?(id: string, msg: string): void
    setProviderError?(id: string, msg: string): void
  }
  host?: string
  port?: number
  /** Serial transport instead of TCP (e.g. an NGT-1 dongle). */
  device?: string
  baudrate?: number
  byteKind: 'ngt1' | 'maretron-ipg'
  password?: string
  providerId?: string
  analyzerOutEvent?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

interface WasmByteApi {
  ByteDecoder: new (
    kind: string,
    camel: boolean,
    nameValue: boolean,
    si: boolean
  ) => {
    initBytes(password: string): Uint8Array
    keepaliveBytes(): Uint8Array | undefined
    decodeBytes(bytes: Uint8Array): string[]
    takePendingTx(): Uint8Array
    takeErrors(): string[]
    encodeFrame(json: string, si: boolean): Uint8Array
  }
  unwrapAnalyzerOutput(parsed: unknown): {
    timestamp?: string
    providerId?: string
  } & Record<string, unknown>
}

function requireWasm(): WasmByteApi {
  try {
    return require('@canboat/wasm') as WasmByteApi
  } catch {
    throw new Error(
      '@canboat/wasm is not installed; wasm connection types need it'
    )
  }
}

const RECONNECT_DELAY = 3000
const KEEPALIVE_INTERVAL = 20000

interface ByteTransport {
  write(data: Buffer): void
  destroy(): void
}

export default class WasmN2kBytes extends Transform {
  private readonly options: WasmN2kBytesOptions
  private readonly wasm: WasmByteApi
  private decoder!: InstanceType<WasmByteApi['ByteDecoder']>
  private socket: ByteTransport | null = null
  private keepaliveTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private stopped = false
  private readonly txHandler: (pgn: unknown) => void
  private readonly debug: DebugLogger

  constructor(options: WasmN2kBytesOptions) {
    super({ objectMode: true })
    this.options = options
    this.wasm = requireWasm()
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:wasm-n2k-bytes')

    this.connect()

    this.txHandler = (pgn: unknown) => {
      try {
        const bytes = this.decoder.encodeFrame(JSON.stringify(pgn), true)
        this.socket?.write(Buffer.from(bytes))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`wasm-n2k-bytes tx: ${message}`)
        options.app.emit('canboatjs:error', err)
      }
    }
    options.app.on('nmea2000JsonOut', this.txHandler)
    options.app.emit('nmea2000OutAvailable')
  }

  private status(msg: string): void {
    if (this.options.providerId) {
      this.options.app.setProviderStatus?.(this.options.providerId, msg)
    }
    this.debug(msg)
  }

  private connect(): void {
    if (this.stopped) {
      return
    }
    // A fresh decoder per connection: framing and session state must
    // not leak across reconnects.
    this.decoder = new this.wasm.ByteDecoder(
      this.options.byteKind,
      true,
      true,
      true
    )

    const onOpen = (transport: ByteTransport) => {
      this.status('Connected')
      transport.write(
        Buffer.from(this.decoder.initBytes(this.options.password ?? ''))
      )
      const keepalive = this.decoder.keepaliveBytes()
      if (keepalive && keepalive.length > 0) {
        this.keepaliveTimer = setInterval(() => {
          transport.write(Buffer.from(keepalive))
        }, KEEPALIVE_INTERVAL)
      }
    }

    let socket: (ByteTransport & NodeJS.EventEmitter) | null = null
    if (this.options.device) {
      const { SerialPort } =
        require('serialport') as typeof import('serialport')
      this.status(`Opening ${this.options.device}`)
      const serial = new SerialPort({
        path: this.options.device,
        baudRate: this.options.baudrate ?? 115200
      })
      serial.on('open', () => onOpen(serial))
      socket = serial
    } else {
      const { host, port } = this.options
      if (!host || !port) {
        // Retrying cannot fix missing configuration — report and stop.
        this.stopped = true
        this.options.app.setProviderError?.(
          this.options.providerId ?? '',
          'host and port are required for a TCP wasm N2K connection'
        )
        return
      }
      const tcp = new Socket()
      this.status(`Connecting to ${host}:${port}`)
      tcp.connect(port, host, () => onOpen(tcp))
      socket = tcp
    }
    this.socket = socket

    socket.on('data', (buf: Buffer) => {
      // Everything here runs inside a socket event handler, where an
      // uncaught throw takes the process down. Malformed framing from
      // a gateway must degrade to a logged error, not a crash.
      try {
        const records = this.decoder.decodeBytes(buf)
        const timestamp = new Date().toISOString()
        for (const record of records) {
          const pgnData = this.wasm.unwrapAnalyzerOutput(JSON.parse(record))
          pgnData.timestamp = timestamp
          pgnData.providerId = this.options.providerId
          this.push(pgnData)
          this.options.app.emit(
            this.options.analyzerOutEvent ?? 'N2KAnalyzerOut',
            pgnData
          )
        }
        const pending = this.decoder.takePendingTx()
        if (pending.length > 0) {
          socket.write(Buffer.from(pending))
        }
        for (const error of this.decoder.takeErrors()) {
          this.debug(`[error] ${error}`)
          this.options.app.emit('canboatjs:error', new Error(error))
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        this.debug(`[decode] ${message}`)
        this.options.app.emit('canboatjs:error', err)
      }
    })

    const retry = (why: string) => {
      if (this.keepaliveTimer) {
        clearInterval(this.keepaliveTimer)
        this.keepaliveTimer = null
      }
      socket.removeAllListeners()
      socket.destroy()
      if (this.socket === socket) {
        this.socket = null
      }
      if (!this.stopped) {
        if (this.options.providerId) {
          this.options.app.setProviderError?.(this.options.providerId, why)
        }
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, RECONNECT_DELAY)
      }
    }
    socket.on('error', (err: Error) => retry(err.message))
    socket.on('close', () => retry('Connection closed, reconnecting'))
  }

  // Source element: upstream input (there is none in practice) passes
  // through untouched.
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
    // Detach from the shared app emitter: a stale instance would keep
    // encoding outbound PGNs and writing to a destroyed socket.
    this.options.app.removeListener('nmea2000JsonOut', this.txHandler)
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    this.socket?.destroy()
    this.socket = null
    super.end()
    return this
  }
}
