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
  providerId?: string
  [key: string]: unknown
}

interface FileChunk {
  fromFile: boolean
  data: string
  timestamp: string
}

type ParsedPgnData = ReturnType<InstanceType<typeof FromPgn>['parse']> & {
  providerId?: string
}

/**
 * The connection's `quirks` setting as canboatjs takes it: a list of
 * `gps-rollover[=...]` strings. The admin UI stores the field split on
 * whitespace, so drop the empty entries a trailing space leaves; canboatjs
 * would refuse an empty quirk name.
 */
export function cleanQuirks(quirks: unknown): unknown {
  if (typeof quirks === 'string') {
    quirks = [quirks]
  }
  if (!Array.isArray(quirks)) {
    return quirks
  }
  return quirks
    .map((q) => (typeof q === 'string' ? q.trim() : q))
    .filter((q) => q !== '')
}

export default class CanboatJs extends Transform {
  private readonly fromPgn: InstanceType<typeof FromPgn>
  private readonly app: CanboatJsOptions['app']
  private readonly analyzerOutEvent: string
  private readonly providerId: string | undefined

  constructor(options: CanboatJsOptions) {
    super({ objectMode: true })

    const opts = {
      ...options,
      useCamelCompat: options.useCamelCompat ?? false,
      quirks: cleanQuirks(options.quirks)
    }
    // An invalid quirk makes FromPgn throw; the error ends up as this
    // connection's provider error (see pipedproviders.ts).
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
    this.providerId = options.providerId
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
      const pgnData = this.fromPgn.parse(chunk.data) as ParsedPgnData
      if (pgnData) {
        pgnData.timestamp = new Date(Number(chunk.timestamp)).toISOString()
        pgnData.providerId = this.providerId
        this.push(pgnData)
        this.app.emit(this.analyzerOutEvent, pgnData)
      } else {
        this.app.emit('canboatjs:unparsed:object', chunk)
      }
    } else {
      const pgnData = this.fromPgn.parse(chunk) as ParsedPgnData
      if (pgnData) {
        pgnData.providerId = this.providerId
        this.push(pgnData)
        this.app.emit(this.analyzerOutEvent, pgnData)
      } else {
        this.app.emit('canboatjs:unparsed:data', chunk)
      }
    }
    done()
  }
}
