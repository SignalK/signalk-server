import { Transform, TransformCallback } from 'stream'
import { FromPgn } from '@canboat/canboatjs'
import type { CreateDebug } from './types'

interface CanboatJsOptions {
  app: {
    emit(event: string, ...args: unknown[]): void
  }
  analyzerOutEvent?: string
  useCamelCompat?: boolean
  createDebug?: CreateDebug
  [key: string]: unknown
}

interface FileChunk {
  fromFile: boolean
  data: string
  timestamp: string
}

export default class CanboatJs extends Transform {
  private readonly fromPgn: InstanceType<typeof FromPgn>
  private readonly app: CanboatJsOptions['app']
  private readonly analyzerOutEvent: string

  constructor(options: CanboatJsOptions) {
    super({ objectMode: true })

    const opts = {
      ...options,
      useCamelCompat: options.useCamelCompat ?? true
    }
    this.fromPgn = new FromPgn(opts)
    const createDebug = options.createDebug ?? require('debug')
    const debug = createDebug('signalk:streams:canboatjs')

    this.fromPgn.on('warning', (pgn: { pgn: number }, warning: string) => {
      debug(`[warning] ${pgn.pgn} ${warning}`)
      options.app.emit('canboatjs:warning', warning)
    })

    this.fromPgn.on('error', (pgn: { input: string }, err: Error) => {
      console.error(pgn.input, err.message)
      options.app.emit('canboatjs:error', err)
    })

    this.app = options.app
    this.analyzerOutEvent = options.analyzerOutEvent ?? 'N2KAnalyzerOut'
  }

  _transform(
    chunk: Buffer | FileChunk,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    if (
      typeof chunk === 'object' &&
      chunk !== null &&
      'fromFile' in chunk &&
      chunk.fromFile
    ) {
      const pgnData = this.fromPgn.parse(chunk.data)
      if (pgnData) {
        pgnData.timestamp = new Date(Number(chunk.timestamp)).toISOString()
        this.push(pgnData)
        this.app.emit(this.analyzerOutEvent, pgnData)
      } else {
        this.app.emit('canboatjs:unparsed:object', chunk)
      }
    } else {
      const pgnData = this.fromPgn.parse(chunk)
      if (pgnData) {
        this.push(pgnData)
        this.app.emit(this.analyzerOutEvent, pgnData)
      } else {
        this.app.emit('canboatjs:unparsed:data', chunk)
      }
    }
    done()
  }
}
