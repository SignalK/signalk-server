import { expect } from 'chai'
import fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Writable } from 'stream'
import { once } from 'events'
import { mock } from 'node:test'
import FileStream from './filestream'

for (const keepRunning of [true, false]) {
  describe(`FileStream stopped at EOF (keepRunning=${keepRunning})`, () => {
    it('does not reopen a file after stop', async () => {
      const directory = fs.mkdtempSync(join(tmpdir(), 'signalk-file-stop-'))
      const filename = join(directory, 'data.log')
      fs.writeFileSync(filename, 'record\n')
      const provider = new FileStream({
        filename,
        app: { config: { configPath: directory } },
        keepRunning
      })
      const streams: fs.ReadStream[] = []
      const originalReadStream = fs.createReadStream
      const replacement = mock.method(
        fs,
        'createReadStream',
        (...args: Parameters<typeof fs.createReadStream>) => {
          const stream = originalReadStream(...args)
          streams.push(stream)
          if (streams.length === 1) {
            stream.prependOnceListener('end', () => provider.end())
          }
          return stream
        }
      )
      const output = new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        }
      })
      try {
        const finished = once(output, 'finish')
        provider.pipe(output)
        await finished
        expect(streams).to.have.length(1)
      } finally {
        for (const stream of streams) stream.destroy()
        output.destroy()
        replacement.mock.restore()
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })
  })
}
