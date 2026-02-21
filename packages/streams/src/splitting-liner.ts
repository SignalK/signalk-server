import { Transform, TransformCallback } from 'stream'

interface SplittingLinerOptions {
  lineSeparator?: string
  [key: string]: unknown
}

export default class SplittingLiner extends Transform {
  private readonly lineSeparator: string

  constructor(options: SplittingLinerOptions = {}) {
    super({ objectMode: true })
    this.lineSeparator = options.lineSeparator ?? '\n'
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const data = chunk.toString()
    const lines = data.split(this.lineSeparator)
    for (const line of lines) {
      this.push(line)
    }
    done()
  }
}
