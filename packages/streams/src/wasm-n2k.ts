import { Transform, TransformCallback } from 'stream'
import type { CreateDebug, DebugLogger } from './types'

/*
 * NMEA 2000 parser element backed by @canboat/wasm — the canboat wire
 * brain compiled to WebAssembly, running in-process. Same decode code
 * as the native `canboat` binary (byte-identical output), without the
 * child process: the transport stays a plain JS stream (TCP, serial,
 * or canboatjs's canbus/canSocket frame mover) and this element turns
 * its output into canboatjs-shaped PGN objects for n2k-signalk.
 *
 * Inputs handled:
 *  - text lines (plain/Actisense serial, YDWG RAW, iKonvert, Actisense
 *    ASCII — the wasm decoder sniffs the format like the native reader)
 *  - canboatjs canbus frame objects ({ pgn: header, length, data }),
 *    synthesized into plain wire lines so the wasm reassembler handles
 *    fast-packets
 *  - file-log chunks ({ fromFile, data, timestamp })
 *
 * TX: when txFormat/txEvent are configured, nmea2000JsonOut records are
 * encoded to the gateway's transmit dialect (ydwg-raw with fast-packet
 * fragmentation, n2k-ascii, plain) and emitted line-by-line on txEvent
 * for the transport element to write.
 *
 * @canboat/wasm is resolved lazily so the server runs fine without it;
 * the admin UI gates these connection subtypes on availability.
 */

interface WasmN2kOptions {
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
  }
  providerId?: string
  analyzerOutEvent?: string
  txFormat?: 'ydwg-raw' | 'n2k-ascii' | 'plain'
  txEvent?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

interface FileChunk {
  fromFile: boolean
  data: string
  timestamp: string
}

interface CanFrameChunk {
  pgn: { prio: number; pgn: number; src: number; dst: number }
  length: number
  data: Buffer
}

interface WasmCompat {
  FromPgn: new () => {
    on(event: string, cb: (...args: unknown[]) => void): void
    parseString(
      line: string
    ):
      | ({ timestamp?: string; providerId?: string } & Record<string, unknown>)
      | undefined
  }
  TxEncoder: new (si: boolean) => {
    encode(json: string, format: string): string[]
  }
}

function requireWasm(): WasmCompat {
  try {
    return require('@canboat/wasm') as WasmCompat
  } catch {
    throw new Error(
      '@canboat/wasm is not installed; wasm connection types need it'
    )
  }
}

const isCanFrameChunk = (chunk: unknown): chunk is CanFrameChunk =>
  typeof chunk === 'object' &&
  chunk !== null &&
  'pgn' in chunk &&
  typeof (chunk as CanFrameChunk).pgn === 'object' &&
  Buffer.isBuffer((chunk as CanFrameChunk).data)

export default class WasmN2k extends Transform {
  private readonly fromPgn: InstanceType<WasmCompat['FromPgn']>
  private readonly app: WasmN2kOptions['app']
  private readonly analyzerOutEvent: string
  private readonly providerId: string | undefined
  private readonly debug: DebugLogger

  constructor(options: WasmN2kOptions) {
    super({ objectMode: true })

    const { FromPgn, TxEncoder } = requireWasm()
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:wasm-n2k')

    this.fromPgn = new FromPgn()
    this.fromPgn.on('error', (line: unknown, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.debug(`[error] ${String(line)} ${message}`)
      options.app.emit('canboatjs:error', err)
    })

    this.app = options.app
    this.analyzerOutEvent = options.analyzerOutEvent ?? 'N2KAnalyzerOut'
    this.providerId = options.providerId

    if (options.txFormat && options.txEvent) {
      const tx = new TxEncoder(true)
      const { txFormat, txEvent } = options
      options.app.on('nmea2000JsonOut', (pgn: unknown) => {
        try {
          for (const line of tx.encode(JSON.stringify(pgn), txFormat)) {
            options.app.emit(txEvent, line)
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`wasm-n2k tx: ${message}`)
          options.app.emit('canboatjs:error', err)
        }
      })
      options.app.emit('nmea2000OutAvailable')
    }
  }

  private parseLine(line: string, timestamp?: string): void {
    const pgnData = this.fromPgn.parseString(line)
    if (pgnData) {
      if (timestamp) {
        pgnData.timestamp = timestamp
      } else if (!pgnData.timestamp) {
        pgnData.timestamp = new Date().toISOString()
      }
      pgnData.providerId = this.providerId
      this.push(pgnData)
      this.app.emit(this.analyzerOutEvent, pgnData)
    }
  }

  _transform(
    chunk: Buffer | string | FileChunk | CanFrameChunk,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    if (isCanFrameChunk(chunk)) {
      // A frame from canboatjs's canbus transport (the canSocket
      // AF_CAN shim): header already decomposed, payload raw. Render
      // it as a plain wire line; the wasm reassembler does the rest.
      const { prio, pgn, src, dst } = chunk.pgn
      const hex = Array.from(chunk.data)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(',')
      this.parseLine(
        `,${prio},${pgn},${src},${dst},${chunk.data.length},${hex}`
      )
    } else if (
      typeof chunk === 'object' &&
      chunk !== null &&
      'fromFile' in chunk &&
      chunk.fromFile
    ) {
      this.parseLine(
        chunk.data,
        new Date(Number(chunk.timestamp)).toISOString()
      )
    } else {
      this.parseLine(chunk.toString())
    }
    done()
  }
}
