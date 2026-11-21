import { ChildProcess, spawn } from 'child_process'
import { createInterface } from 'readline'
import { Transform, TransformCallback, Writable } from 'stream'
import { unwrapAnalyzerOutput } from './analyzerOutput'
interface N2kAnalyzerOptions {
  app: {
    emit(event: string, ...args: unknown[]): void
  }
  analyzerOutEvent?: string
  [key: string]: unknown
}

interface AnalyzerOutput {
  version?: string
  [key: string]: unknown
}

export default class N2kAnalyzer extends Transform {
  private readonly analyzerOutEvent: string
  private readonly analyzerProcess: ChildProcess
  private pipeTo: Writable | null = null

  constructor(options: N2kAnalyzerOptions) {
    super({ objectMode: true })

    this.analyzerOutEvent = options.analyzerOutEvent ?? 'N2KAnalyzerOut'

    // -camel wraps each message in a {"camelPgnId": {...}} envelope (canboat
    // >= 6.0.0) and -nv emits lookup fields as {value, name} pairs; both are
    // undone by unwrapAnalyzerOutput below, which needs -nv to rebuild
    // canboatjs's per-field name-or-number convention.
    const analyzerCommand = 'analyzer -json -si -camel -nv'
    if (process.platform === 'win32') {
      this.analyzerProcess = spawn('cmd', ['/c', analyzerCommand])
    } else {
      this.analyzerProcess = spawn('sh', ['-c', analyzerCommand])
    }

    this.analyzerProcess.stderr?.on('data', (data: Buffer) => {
      console.error(data.toString())
    })

    this.analyzerProcess.on('close', (code: number | null) => {
      console.error('Analyzer process exited with code ' + code)
    })

    const linereader = createInterface(
      this.analyzerProcess.stdout!,
      this.analyzerProcess.stdin!
    )

    linereader.on('line', (data: string) => {
      try {
        const parsed: AnalyzerOutput = JSON.parse(data)
        if (parsed.version) {
          console.log('Connected to analyzer v' + parsed.version)
          return
        }
        const flat = unwrapAnalyzerOutput(parsed)
        this.push(flat)
        options.app.emit(this.analyzerOutEvent, flat)
      } catch (ex: unknown) {
        console.error(data)
        if (ex instanceof Error) {
          console.error(ex.stack)
        }
      }
    })
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    this.analyzerProcess.stdin?.write(chunk.toString() + '\n')
    done()
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    this.pipeTo = pipeTo as unknown as Writable
    return super.pipe(pipeTo)
  }

  end(): this {
    console.log('end, killing child analyzer process')
    this.analyzerProcess.kill()
    if (this.pipeTo) {
      this.pipeTo.end()
    }
    return this
  }
}
