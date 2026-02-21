import { createSocket, Socket } from 'dgram'
import { Transform, TransformCallback, Writable } from 'stream'
import type { CreateDebug, DebugLogger, StreamsApp } from './types'

interface UdpOptions {
  port: number
  host?: string
  app: StreamsApp
  providerId: string
  outEvent?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

export default class Udp extends Transform {
  private readonly options: UdpOptions
  private readonly debug: DebugLogger
  private socket: Socket | null = null
  private pipeTo: Writable | null = null

  constructor(options: UdpOptions) {
    super({ objectMode: false })
    this.options = options
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:udp')
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    this.pipeTo = pipeTo as unknown as Writable
    super.pipe(pipeTo)

    const socket = createSocket('udp4')
    this.socket = socket

    if (this.options.outEvent && this.options.port !== undefined) {
      this.options.app.on(this.options.outEvent, (d: string) => {
        this.debug('sending over udp: %s', d)
        socket.send(
          d,
          0,
          d.length,
          this.options.port,
          this.options.host ?? '255.255.255.255'
        )
      })
    }

    socket.on('message', (message: Buffer) => {
      this.debug(message.toString())
      this.push(message)
    })

    socket.on('error', (err: Error) => {
      this.options.app.setProviderError(this.options.providerId, err.message)
      console.error('UdpProvider:' + err)
    })

    socket.bind(this.options.port, () => {
      socket.setBroadcast(true)
    })

    return pipeTo
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }

  end(): this {
    if (this.socket) {
      this.socket.close()
    }
    if (this.pipeTo) {
      this.pipeTo.end()
    }
    return this
  }
}
