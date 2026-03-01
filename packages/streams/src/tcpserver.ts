import { Transform, TransformCallback } from 'stream'

interface TcpServerOptions {
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
  }
}

export default class TcpServer extends Transform {
  private readonly options: TcpServerOptions

  constructor(options: TcpServerOptions) {
    super()
    this.options = options
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    this.options.app.on('tcpserver0183data', (d: string) => this.write(d))
    return super.pipe(pipeTo)
  }

  _transform(
    data: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    callback(null, data)
  }
}
