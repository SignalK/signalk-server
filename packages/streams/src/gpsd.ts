import net from 'net'
import { Transform, TransformCallback } from 'stream'
import reconnect from 'reconnect-core'
import type { CreateDebug, DebugLogger } from './types'

const GPSD_DEFAULT_PORT = 2947
const GPSD_WATCH_COMMAND = '?WATCH={"class":"WATCH","nmea":true,"json":false}\n'

interface GpsdOptions {
  port?: number
  hostname?: string
  host?: string
  noDataReceivedTimeout?: number
  app: {
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void
  }
  providerId: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

export default class Gpsd extends Transform {
  private readonly hostname: string
  private readonly port: number
  private readonly debug: DebugLogger
  private readonly noDataReceivedTimeout: number
  private readonly options: GpsdOptions
  private reconnector: { disconnect(): void } | null = null

  constructor(options: GpsdOptions) {
    super()
    this.options = options
    this.port = options.port ?? GPSD_DEFAULT_PORT
    this.hostname = options.hostname ?? options.host ?? 'localhost'
    this.noDataReceivedTimeout = (options.noDataReceivedTimeout ?? 0) * 1000

    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:gpsd')
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    if (this.reconnector) {
      return super.pipe(pipeTo)
    }

    const label = `${this.hostname}:${this.port}`

    this.options.app.setProviderStatus(
      this.options.providerId,
      `Connecting to ${label}`
    )

    this.reconnector = reconnect((opts: object) => {
      return net.connect(opts as { host: string; port: number })
    })({ maxDelay: 5 * 1000 }, (socket: net.Socket) => {
      if (this.noDataReceivedTimeout > 0) {
        socket.setTimeout(this.noDataReceivedTimeout)
        this.debug(`Socket idle timeout set to ${this.noDataReceivedTimeout}ms`)
        socket.on('timeout', () => {
          this.debug(`Idle timeout on ${label}`)
          socket.end()
        })
      }

      socket.write(GPSD_WATCH_COMMAND)
      this.debug(`Sent WATCH command to ${label}`)

      socket.on('data', (data: Buffer) => {
        this.write(data)
      })
    })
      .on('connect', () => {
        const msg = `Connected to ${label}`
        this.options.app.setProviderStatus(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('reconnect', (n: number, delay: number) => {
        const msg = `Reconnect ${label} retry ${n} delay ${delay}`
        this.options.app.setProviderError(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('disconnect', () => {
        const msg = `Disconnected from ${label}`
        this.options.app.setProviderError(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('error', (err: Error & { errors?: string[] }) => {
        let msg: string
        if (err.message && err.message.length > 0) {
          msg = err.message
        } else if (err.errors) {
          msg = err.errors.toString()
        } else {
          msg = err.toString()
        }
        this.options.app.setProviderError(this.options.providerId, msg)
        console.error(`GpsdProvider: ${msg}`)
      })
      .connect({ host: this.hostname, port: this.port })

    super.pipe(pipeTo)
    return pipeTo
  }

  end(): this {
    if (this.reconnector) {
      this.reconnector.disconnect()
    }
    return this
  }

  _transform(
    data: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    callback(null, data)
  }
}
