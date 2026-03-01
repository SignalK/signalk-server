import { createReadStream, readdirSync } from 'fs'
import { Transform } from 'stream'

interface FolderStreamOptions {
  folder: string
}

export default class FolderStream extends Transform {
  private readonly folder: string
  private fileIndex = 0

  constructor(options: FolderStreamOptions) {
    super({ objectMode: false })
    this.folder = options.folder
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    const files = readdirSync(this.folder)

    const pipeNextFile = (): void => {
      const file = files[this.fileIndex]
      if (!file) {
        pipeTo.end()
        return
      }
      const fileStream = createReadStream(this.folder + '/' + file)
      fileStream.pipe(pipeTo, { end: false })
      fileStream.on('end', () => {
        this.fileIndex++
        if (this.fileIndex === files.length) {
          pipeTo.end()
        } else {
          pipeNextFile()
        }
      })
    }

    pipeNextFile()
    return pipeTo
  }
}
