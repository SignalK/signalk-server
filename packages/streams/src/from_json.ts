import { Transform, TransformCallback } from 'stream'

export default class FromJson extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(chunk.toString())
    } catch {
      console.error('Could not parse JSON:' + chunk.toString())
    }
    if (parsed) {
      this.push(parsed)
    }
    done()
  }
}
