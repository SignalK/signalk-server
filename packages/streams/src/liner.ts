import { Transform, TransformCallback } from 'stream'

interface LinerOptions {
  lineSeparator?: string
  [key: string]: unknown
}

export default class Liner extends Transform {
  private readonly lineSeparator: string
  private lastLineData: string | null = null

  constructor(options: LinerOptions = {}) {
    super({ objectMode: true })
    this.lineSeparator = options.lineSeparator ?? '\n'
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    let data = chunk.toString()
    if (this.lastLineData) {
      data = this.lastLineData + data
    }

    const lines = data.split(this.lineSeparator)
    this.lastLineData = lines.splice(lines.length - 1, 1)[0] ?? null

    if (this.lastLineData && this.lastLineData.length > 2048) {
      console.error(
        'Are you sure you are using the correct line terminator? Not going to handle lines longer than 2048 chars.'
      )
      this.lastLineData = ''
    }

    for (const line of lines) {
      this.push(line)
    }

    done()
  }

  _flush(done: TransformCallback): void {
    if (this.lastLineData) {
      this.push(this.lastLineData)
    }
    this.lastLineData = null
    done()
  }
}
