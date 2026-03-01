import { ChildProcess, spawn } from 'child_process'
import { Transform, TransformCallback, Writable } from 'stream'
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import type { PGN } from '@canboat/ts-pgns'
import type { CreateDebug, DebugLogger } from './types'

interface ExecuteOptions {
  command: string
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void
  }
  providerId: string
  toChildProcess?: string
  restartOnClose?: boolean
  restartThrottleTime?: number
  createDebug?: CreateDebug
  debug?: DebugLogger
  [key: string]: unknown
}

export default class Execute extends Transform {
  private readonly options: ExecuteOptions
  private readonly debug: DebugLogger
  childProcess!: ChildProcess
  private pipeTo: Writable | null = null
  private lastStartupTime = 0
  private stopped = false

  constructor(options: ExecuteOptions) {
    super({})
    this.options = options
    const createDebug = options.createDebug ?? require('debug')
    this.debug = options.debug ?? createDebug('signalk:streams:execute')
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    this.childProcess.stdin?.write(chunk.toString())
    done()
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    this.pipeTo = pipeTo as unknown as Writable
    this.startProcess(this.options.command)

    const stdOutEvent = this.options.toChildProcess ?? 'toChildProcess'
    this.debug(
      'Using event ' + stdOutEvent + " for output to child process's stdin"
    )

    this.options.app.on(stdOutEvent, (d: string) => {
      try {
        this.childProcess.stdin?.write(d + '\n')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.log('execute:' + message)
      }
    })

    if (stdOutEvent === 'nmea2000out') {
      this.options.app.on('nmea2000JsonOut', (pgn: PGN) => {
        this.childProcess.stdin?.write(pgnToActisenseSerialFormat(pgn) + '\r\n')
      })
      this.options.app.emit('nmea2000OutAvailable')
    }

    super.pipe(pipeTo)
    return pipeTo
  }

  end(): this {
    this.debug('end, killing child process')
    this.stopped = true
    this.childProcess.kill()
    if (this.pipeTo) {
      this.pipeTo.end()
    }
    return this
  }

  private startProcess(command: string): void {
    this.debug(`starting |${command}|`)
    if (process.platform === 'win32') {
      this.childProcess = spawn('cmd', ['/c', command])
    } else {
      this.childProcess = spawn('sh', ['-c', command])
    }
    this.lastStartupTime = Date.now()
    this.options.app.setProviderStatus(this.options.providerId, 'Started')

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      this.options.app.setProviderError(this.options.providerId, msg)
      console.error(msg)
    })

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      if (this.debug.enabled) {
        this.debug(data.toString())
      }
      this.push(data)
    })

    this.childProcess.on('close', (code: number | null) => {
      const msg = `|${command}| exited with ${code}`
      console.error(msg)
      if (this.stopped) return
      if (
        this.options.restartOnClose === undefined ||
        this.options.restartOnClose
      ) {
        const throttleTime = (this.options.restartThrottleTime ?? 60) * 1000

        const sinceLast = Date.now() - this.lastStartupTime
        if (sinceLast > throttleTime) {
          this.startProcess(command)
        } else {
          const nextStart = throttleTime - sinceLast
          const waitMsg = `Waiting ${nextStart / 1000} seconds to restart`
          this.options.app.setProviderStatus(this.options.providerId, waitMsg)
          this.debug(waitMsg)
          setTimeout(() => {
            this.startProcess(command)
          }, nextStart)
        }
      }
    })
  }
}
