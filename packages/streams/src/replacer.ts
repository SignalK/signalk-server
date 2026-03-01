import { Transform, TransformCallback } from 'stream'

interface ReplacerOptions {
  regexp: string
  template: string
}

export default class Replacer extends Transform {
  private readonly regexp: RegExp
  private readonly template: string

  constructor(options: ReplacerOptions) {
    super({ objectMode: true })
    this.regexp = new RegExp(options.regexp, 'gu')
    this.template = options.template
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const result = chunk.toString().replace(this.regexp, this.template)
    if (result.length > 0) {
      this.push(result)
    }
    done()
  }
}
