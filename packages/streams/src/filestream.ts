import { createReadStream, existsSync, ReadStream } from 'fs'
import { isAbsolute, join } from 'path'
import { PassThrough, Writable } from 'stream'
class EndIgnoringPassThrough extends PassThrough {
  end(): this {
    return this
  }
}

interface FileStreamOptions {
  filename: string
  app: {
    config: { configPath: string }
  }
  keepRunning?: boolean
  [key: string]: unknown
}

export default class FileStream {
  private readonly options: FileStreamOptions
  private keepRunning: boolean
  private stopped = false
  private pipeTo: Writable | null = null
  private endIgnoringPassThrough: EndIgnoringPassThrough | null = null
  private filestream: ReadStream | null = null

  constructor(options: FileStreamOptions) {
    this.options = options
    this.keepRunning = options.keepRunning ?? true
  }

  pipe<T extends Writable>(pipeTo: T): T {
    this.pipeTo = pipeTo
    this.endIgnoringPassThrough = new EndIgnoringPassThrough()
    this.endIgnoringPassThrough.pipe(pipeTo)
    this.startStream()
    return pipeTo
  }

  startStream(): void {
    if (this.stopped) return

    let filename: string
    if (isAbsolute(this.options.filename)) {
      filename = this.options.filename
    } else {
      filename = join(this.options.app.config.configPath, this.options.filename)
      if (!existsSync(filename)) {
        filename = join(__dirname, '..', this.options.filename)
      }
    }

    this.filestream = createReadStream(filename)
    this.filestream.on('error', (err: Error) => {
      console.error(err.message)
      this.keepRunning = false
    })
    if (this.keepRunning) {
      this.filestream.on('end', () => {
        if (this.keepRunning) this.startStream()
      })
    }
    this.filestream.pipe(this.endIgnoringPassThrough!)
  }

  end(): void {
    if (this.stopped) return
    this.stopped = true
    this.keepRunning = false
    this.filestream?.destroy()
    this.endIgnoringPassThrough?.destroy()
    this.pipeTo?.end()
  }
}
