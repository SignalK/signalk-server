import { Transform, TransformCallback } from 'stream'
import { Socket } from 'net'
import { ByteDecoder, unwrapAnalyzerOutput } from '@canboat/wasm'
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
 * TX: nmea2000JsonOut records, and the plain-format lines or records
 * sent on nmea2000out, are encoded to device transmit bytes in-process
 * and written to the socket.
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
  noDataReceivedTimeout?: string | number
  byteKind: 'ngt1' | 'maretron-ipg'
  password?: string
  providerId?: string
  analyzerOutEvent?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

const RECONNECT_DELAY = 3000
const KEEPALIVE_INTERVAL = 20000
const MAX_TCP_PORT = 65535

/**
 * Why a TCP connection cannot be opened with these options, or null. A
 * port outside the TCP range makes net.Socket.connect() throw instead
 * of raising 'error', so it is refused here.
 */
function tcpConfigError({ host, port }: WasmN2kBytesOptions): string | null {
  if (!host || !port) {
    return 'host and port are required for a TCP wasm N2K connection'
  }
  const portNumber = Number(port)
  if (
    !Number.isInteger(portNumber) ||
    portNumber < 1 ||
    portNumber > MAX_TCP_PORT
  ) {
    return `invalid TCP port ${String(port)} for a wasm N2K connection`
  }
  return null
}

interface ByteTransport {
  write(data: Buffer): void
  destroy(): void
}

export default class WasmN2kBytes extends Transform {
  private readonly options: WasmN2kBytesOptions
  private decoder!: ByteDecoder
  private socket: ByteTransport | null = null
  private keepaliveTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private idleMs = 0
  private stopped = false
  /**
   * Senders transmit once they hear nmea2000OutAvailable, so it is
   * announced when the gateway has answered on this connection, as the
   * canboatjs gateway sources do; until then there is no session to
   * carry a frame, and frames are dropped.
   */
  private txReady = false
  private readonly txHandler: (pgn: unknown) => void
  private readonly outTxHandler: (msg: unknown) => void
  private readonly debug: DebugLogger

  constructor(options: WasmN2kBytesOptions) {
    super({ objectMode: true })
    this.options = options
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:wasm-n2k-bytes')

    this.txHandler = (pgn: unknown) =>
      this.transmit(() => this.decoder.encodeFrame(JSON.stringify(pgn), true))
    // As on the canboatjs connections, nmea2000out carries either a
    // plain-format line, sent with its payload as given, or a PGN record.
    this.outTxHandler = (msg: unknown) =>
      this.transmit(() =>
        typeof msg === 'string'
          ? this.decoder.encodeLine(msg)
          : this.decoder.encodeFrame(JSON.stringify(msg), true)
      )

    const configError = options.device ? null : tcpConfigError(options)
    if (configError) {
      // Retrying cannot fix the configuration — report and stop, before
      // listening for TX that has no transport behind it.
      this.stopped = true
      options.app.setProviderError?.(options.providerId ?? '', configError)
      return
    }

    options.app.on('nmea2000JsonOut', this.txHandler)
    options.app.on('nmea2000out', this.outTxHandler)

    this.connect()
  }

  private transmit(encode: () => Uint8Array): void {
    if (!this.txReady) {
      this.debug('TX dropped: the gateway has not answered yet')
      return
    }
    try {
      this.socket?.write(Buffer.from(encode()))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`wasm-n2k-bytes tx: ${message}`)
      this.options.app.emit('wasm-n2k:error', err)
    }
  }

  private status(msg: string): void {
    if (this.options.providerId) {
      this.options.app.setProviderStatus?.(this.options.providerId, msg)
    }
    this.debug(msg)
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private armIdleTimer(): void {
    this.clearIdleTimer()
    if (this.idleMs <= 0) {
      return
    }
    const socket = this.socket
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (!socket || this.socket !== socket) {
        return
      }
      this.debug.enabled && this.debug('Idle timeout, closing socket')
      // destroy(), not end(): the peer is presumed gone, and only
      // destroy fires 'close' immediately for the retry path.
      socket.destroy()
    }, this.idleMs)
  }

  private connect(): void {
    if (this.stopped) {
      return
    }
    // A fresh decoder per connection: framing and session state must
    // not leak across reconnects.
    this.decoder = new ByteDecoder(this.options.byteKind, true, true, true)
    this.txReady = false

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
      // Presence checked in the constructor, which never connects
      // without both.
      const { host, port } = this.options as { host: string; port: number }
      const tcp = new Socket()
      this.status(`Connecting to ${host}:${port}`)
      // Receive-only idle timer: a half-open connection raises neither
      // 'error' nor 'close', so without it the retry path never runs.
      // socket.setTimeout() cannot serve here — it counts the periodic
      // keepalive writes as activity, so it would never fire while the
      // gateway sends nothing. Re-armed only in the data handler,
      // cleared in retry and end(). Unset means disabled, as in the
      // canboatjs connection types.
      const parsedTimeout = Number.parseInt(
        String(this.options.noDataReceivedTimeout ?? '').trim()
      )
      this.idleMs = isNaN(parsedTimeout) ? 0 : parsedTimeout * 1000
      tcp.connect(port, host, () => onOpen(tcp))
      socket = tcp
    }
    this.socket = socket
    this.armIdleTimer()

    socket.on('data', (buf: Buffer) => {
      this.armIdleTimer()
      // Everything here runs inside a socket event handler, where an
      // uncaught throw takes the process down. Malformed framing from
      // a gateway must degrade to a logged error, not a crash.
      try {
        const records = this.decoder.decodeBytes(buf)
        const timestamp = new Date().toISOString()
        for (const record of records) {
          const pgnData = unwrapAnalyzerOutput(JSON.parse(record))
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
        if (!this.txReady) {
          this.txReady = true
          this.options.app.emit('nmea2000OutAvailable')
        }
        for (const error of this.decoder.takeErrors()) {
          if (this.debug.enabled) {
            this.debug(`[error] ${error}`)
          }
          this.options.app.emit('wasm-n2k:error', new Error(error))
        }
      } catch (err: unknown) {
        if (this.debug.enabled) {
          const message = err instanceof Error ? err.message : String(err)
          this.debug(`[decode] ${message}`)
        }
        this.options.app.emit('wasm-n2k:error', err)
      }
    })

    const retry = (why: string) => {
      this.clearIdleTimer()
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

  // Source element: it pushes the records it decodes from its own socket
  // or serial port, and upstream input (there is none in practice) is
  // dropped.
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
    this.options.app.removeListener('nmea2000out', this.outTxHandler)
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    this.clearIdleTimer()
    this.socket?.destroy()
    this.socket = null
    super.end()
    return this
  }
}
