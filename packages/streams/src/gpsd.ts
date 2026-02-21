import { Transform, TransformCallback } from 'stream'
import GpsdClient from 'node-gpsd-client'
import type { CreateDebug, StreamsApp } from './types'

interface GpsdOptions {
  port?: number
  hostname?: string
  host?: string
  noDataReceivedTimeout?: number
  app: StreamsApp
  providerId: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

export default class Gpsd extends Transform {
  private readonly listener: GpsdClient

  constructor(options: GpsdOptions) {
    super({ objectMode: true })

    const port = options.port ?? 2947
    const hostname = options.hostname ?? options.host ?? 'localhost'
    const noDataReceivedTimeout = options.noDataReceivedTimeout ?? 0

    const setProviderStatus = (msg: string): void => {
      options.app.setProviderStatus(options.providerId, msg)
    }

    const createDebug = options.createDebug ?? require('debug')

    this.listener = new GpsdClient({
      port,
      hostname,
      logger: {
        info: createDebug('signalk:streams:gpsd'),
        warn: console.warn,
        error: (msg: unknown) => {
          options.app.setProviderError(
            options.providerId,
            `${hostname}:${port}: ` + msg
          )
        }
      },
      parse: false,
      reconnectThreshold: noDataReceivedTimeout,
      reconnectInterval: noDataReceivedTimeout / 2
    })

    setProviderStatus(`Connecting to ${hostname}:${port}`)

    this.listener.on('connected', () => {
      setProviderStatus(`Connected to ${hostname}:${port}`)
      this.listener.watch({
        class: 'WATCH',
        nmea: true,
        json: false
      })
    })

    this.listener.on('raw', (data: string) => {
      this.push(data)
    })

    this.listener.connect()
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }
}
