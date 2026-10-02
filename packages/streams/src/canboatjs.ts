import { Transform, TransformCallback } from 'stream'
import * as canboatjs from '@canboat/canboatjs'
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

const QUIRKS_ERROR = 'Invalid quirks option: '

/**
 * Create the canboatjs parser so that a quirks problem always surfaces as
 * one clear error, whatever canboatjs version is installed. The error is
 * thrown while the connection's pipeline is built, so it becomes the
 * connection's provider error on the Dashboard (see pipedproviders.ts).
 *
 * - A setting that is not a list (cleanQuirks has made a string one) is
 *   refused here, so it cannot slip past the next check.
 * - A canboatjs without quirk support (3.20 and earlier) would silently ignore
 *   them, leaving the user believing their dates are corrected: refuse.
 * - canboatjs refuses an invalid quirk; from canboat/canboatjs#475 on its
 *   message says it is the quirks option, before that it does not: add it.
 */
export function createParser<T>(
  Parser: new (options: object) => T,
  opts: { quirks?: unknown },
  supportsQuirks: boolean
): T {
  if (
    opts.quirks !== undefined &&
    opts.quirks !== null &&
    !Array.isArray(opts.quirks)
  ) {
    throw new Error(QUIRKS_ERROR + 'expected a string or a list of strings')
  }
  const quirks = opts.quirks ?? []
  if (quirks.length > 0 && !supportsQuirks) {
    throw new Error(
      QUIRKS_ERROR +
        'the installed @canboat/canboatjs does not support quirks; ' +
        'update it, or remove the quirks from this connection'
    )
  }
  try {
    return new Parser(opts)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    if (quirks.length > 0 && !message.startsWith(QUIRKS_ERROR)) {
      throw new Error(QUIRKS_ERROR + message)
    }
    throw e
  }
}

/** Whether the installed canboatjs knows quirks (canboat/canboatjs#464). */
const canboatjsSupportsQuirks =
  typeof (canboatjs as { parseQuirks?: unknown }).parseQuirks === 'function'

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
    this.fromPgn = createParser(FromPgn, opts, canboatjsSupportsQuirks)
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
