import { Transform, TransformCallback } from 'stream'
import { getLogger } from './logging'
import type { LoggingApp } from './logging'

interface LogOptions {
  app: LoggingApp
  discriminator?: string
  logdir?: string
  [key: string]: unknown
}

export default class Log extends Transform {
  private readonly logger: (msg: unknown) => void

  constructor(options: LogOptions) {
    super({ objectMode: true })
    this.logger = getLogger(options.app, options.discriminator, options.logdir)
  }

  _transform(
    msg: unknown,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    this.push(msg)
    this.logger(msg)
    done()
  }
}
