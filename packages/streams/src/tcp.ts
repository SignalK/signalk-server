import net from 'net'
import { Transform, TransformCallback } from 'stream'
import reconnect from 'reconnect-core'
import type { CreateDebug, DebugLogger, StreamsApp } from './types'

interface TcpOptions {
  host: string
  port: number
  app: StreamsApp
  providerId: string
  noDataReceivedTimeout?: string | number
  outEvent?: string
  toStdout?: string | string[]
  createDebug?: CreateDebug
  [key: string]: unknown
}

export default class TcpStream extends Transform {
  private readonly options: TcpOptions
  private readonly debug: DebugLogger
  private readonly debugData: DebugLogger
  private readonly noDataReceivedTimeout: number
  private tcpStream: net.Socket | undefined
  private reconnector: { disconnect(): void } | null = null

  constructor(options: TcpOptions) {
    super()
    this.options = options
    this.noDataReceivedTimeout =
      Number.parseInt((this.options.noDataReceivedTimeout + '').trim()) * 1000
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:tcp')
    this.debug(`noDataReceivedTimeout:${this.noDataReceivedTimeout}`)
    this.debugData = createDebug('signalk:streams:tcp-data')
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    if (this.options.outEvent) {
      this.options.app.on(this.options.outEvent, (d: string) => {
        if (this.tcpStream) {
          this.debug('sending %s', d)
          this.tcpStream.write(d)
          setImmediate(() => {
            this.options.app.emit('connectionwrite', {
              providerId: this.options.providerId
            })
          })
        }
      })
    }

    const stdOutEvent = this.options.toStdout
    if (stdOutEvent) {
      const events = Array.isArray(stdOutEvent) ? stdOutEvent : [stdOutEvent]
      for (const stdEvent of events) {
        this.options.app.on(stdEvent, (d: string) => {
          if (this.tcpStream) {
            this.tcpStream.write(d + '\r\n')
            this.debug('event %s sending %s', stdEvent, d)
          }
        })
      }
    }

    this.reconnector = reconnect((opts: object) => {
      return net.connect(opts as { host: string; port: number })
    })({ maxDelay: 5 * 1000 }, (tcpStream: net.Socket) => {
      if (!isNaN(this.noDataReceivedTimeout)) {
        tcpStream.setTimeout(this.noDataReceivedTimeout)
        this.debug(
          `Setting socket idle timeout ${this.options.host}:${this.options.port} ${this.noDataReceivedTimeout}`
        )
        tcpStream.on('timeout', () => {
          this.debug(
            `Idle timeout, closing socket ${this.options.host}:${this.options.port}`
          )
          tcpStream.end()
        })
      }
      tcpStream.on('data', (data: Buffer) => {
        if (this.debugData.enabled) {
          this.debugData(data.toString())
        }
        this.write(data)
      })
    })
      .on('connect', (con: net.Socket) => {
        this.tcpStream = con
        const msg = `Connected to ${this.options.host} ${this.options.port}`
        this.options.app.setProviderStatus(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('reconnect', (n: number, delay: number) => {
        const msg = `Reconnect ${this.options.host} ${this.options.port} retry ${n} delay ${delay}`
        this.options.app.setProviderError(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('disconnect', () => {
        this.tcpStream = undefined
        this.debug(`Disconnected ${this.options.host} ${this.options.port}`)
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
        console.error('TcpProvider:' + msg)
      })
      .connect(this.options)

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
