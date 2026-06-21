/*
 * Copyright 2026 Kees Verruijt
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Bidirectional TCP provider for `canboat-pipeline`'s CSV R/W port.
 *
 * canboat-pipeline (https://github.com/canboat/canboat-rs) exposes
 * a "Canboat Raw CSV" port (port 2603 by default) that streams every
 * N2K frame as a canboat PLAIN/FAST line:
 *
 *   2026-05-29T19:16:04.826Z,2,127251,14,255,8,ff,5e,7d,00,00,ff,ff,ff
 *
 * Clients can also write PLAIN/FAST lines back to inject PGNs into
 * the N2K bus. The first line the server sends on connect is the
 * canboat `# format=FAST` header.
 *
 * This stream:
 *
 *  * Opens a TCP connection (with reconnect) to host:port.
 *  * Pipes received bytes downstream — the pipeline then runs them
 *    through `Liner` and `CanboatJs` which parses each line via
 *    `parseActisense` and emits N2K objects.
 *  * Listens on `nmea2000out` / `nmea2000JsonOut` (or the events
 *    named in `options.outEvent` / `options.jsonOutEvent`).
 *    String messages are sent as-is; objects are formatted with
 *    `encodeActisense` first. Each outbound line is terminated with
 *    `\r\n` and sent over the same socket.
 *
 * The wire format is identical in both directions, so the same
 * socket carries read + write traffic. canboat-pipeline parses each
 * inbound line through its standalone `parse_plain` and pushes the
 * resulting `RawFrame` to its configured device writer
 * (NGT-1 / iKonvert / Maretron).
 */

import { encodeActisense, toPgn } from '@canboat/canboatjs'
import net from 'net'
import { Transform, TransformCallback } from 'stream'
import reconnect from 'reconnect-core'
import type { CreateDebug, DebugLogger } from './types'

interface CanboatCsvOptions {
  host: string
  port: number
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void

    listenerCount?(event: string): number
  }
  providerId: string
  noDataReceivedTimeout?: string | number
  outEvent?: string
  jsonOutEvent?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

type PgnObject = {
  pgn: number
  dst?: number
  src?: number
  prio?: number
}

export default class CanboatCsvStream extends Transform {
  private readonly options: CanboatCsvOptions
  private readonly debug: DebugLogger
  private readonly debugData: DebugLogger
  private readonly debugOut: DebugLogger
  private static readonly DEFAULT_TIMEOUT_SECONDS = 60
  private readonly noDataReceivedTimeout: number
  private tcpStream: net.Socket | undefined
  private reconnector: { disconnect(): void } | null = null

  constructor(options: CanboatCsvOptions) {
    super()
    this.options = options
    const parsedTimeout = Number.parseInt(
      (this.options.noDataReceivedTimeout + '').trim()
    )
    this.noDataReceivedTimeout =
      (isNaN(parsedTimeout)
        ? CanboatCsvStream.DEFAULT_TIMEOUT_SECONDS
        : parsedTimeout) * 1000

    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:canboat-csv')
    this.debugData = createDebug('signalk:streams:canboat-csv-data')
    this.debugOut = createDebug('canboatjs:n2k-out')
    this.debug(`noDataReceivedTimeout:${this.noDataReceivedTimeout}`)
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    this.installWriteEventHandlers()
    this.connectAndStart()
    super.pipe(pipeTo)
    return pipeTo
  }

  /**
   * Wire app-side events (`nmea2000out`, `nmea2000JsonOut`) to the
   * TCP write side. Strings get sent verbatim (assumed to already be
   * canboat PLAIN/FAST). Objects get encoded via `encodeActisense`.
   *
   * Mirrors actisense-serial.ts in canboatjs, minus the NGT-1 binary
   * framing — our wire format is the PLAIN/FAST line itself.
   */
  private installWriteEventHandlers(): void {
    const outName = this.options.outEvent || 'nmea2000out'
    const outEvents = outName.split(',').map((e) => e.trim())
    for (const ev of outEvents) {
      this.options.app.on(ev, (msg: string | PgnObject) => {
        if (!this.tcpStream) {
          this.debug('write while disconnected — dropping')
          return
        }
        if (typeof msg === 'string') {
          this.writeRawLine(msg)
        } else {
          this.writeObject(msg)
        }
      })
    }

    const jsonName = this.options.jsonOutEvent || 'nmea2000JsonOut'
    const jsonEvents = jsonName.split(',').map((e) => e.trim())
    for (const ev of jsonEvents) {
      this.options.app.on(ev, (msg: PgnObject) => {
        if (!this.tcpStream) return
        this.writeObject(msg)
      })
    }
  }

  /**
   * Send a canboat PLAIN/FAST string verbatim. We always terminate
   * with `\r\n` — canboat-pipeline trims trailing whitespace so the
   * choice is cosmetic but matches what its own write_plain emits.
   */
  private writeRawLine(line: string): void {
    if (!this.tcpStream) return
    const out = line.endsWith('\n') ? line : line + '\r\n'
    // Guard the `.trim()` so it doesn't run when debug logging is
    // disabled — the `debug` package returns a function whose
    // `.enabled` property reflects whether the namespace matches
    // `DEBUG`.
    if (this.debugOut.enabled) {
      this.debugOut('sending %s', out.trim())
    }
    this.tcpStream.write(out)
    if ((this.options.app.listenerCount?.('canboatjs:rawsend') ?? 0) > 0) {
      this.options.app.emit('canboatjs:rawsend', { data: line })
    }
    this.options.app.emit('connectionwrite', {
      providerId: this.options.providerId
    })
  }

  private writeObject(msg: PgnObject): void {
    try {
      const data = toPgn(msg)
      const csv = encodeActisense({ pgn: msg.pgn, data, dst: msg.dst })
      this.writeRawLine(csv)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.options.app.setProviderError(
        this.options.providerId,
        `encode failed: ${message}`
      )
    }
  }

  private connectAndStart(): void {
    this.reconnector = reconnect((opts: object) => {
      return net.connect(opts as { host: string; port: number })
    })({ maxDelay: 5 * 1000 }, (tcpStream: net.Socket) => {
      if (this.noDataReceivedTimeout > 0) {
        tcpStream.setTimeout(this.noDataReceivedTimeout)
        this.debug(
          `Setting socket idle timeout ${this.options.host}:${this.options.port} ${this.noDataReceivedTimeout}`
        )
        tcpStream.on('timeout', () => {
          this.debug(
            `Idle timeout, closing socket ${this.options.host}:${this.options.port}`
          )
          tcpStream.end()
        })
      }
      // Disable Nagle so our small per-PGN writes flush immediately
      // — matches the TCP_NODELAY setting canboat-pipeline applies
      // on its side.
      tcpStream.setNoDelay(true)
      tcpStream.on('data', (data: Buffer) => {
        if (this.debugData.enabled) {
          this.debugData(data.toString())
        }
        // Push bytes downstream — the pipeline factory adds a
        // `Liner` after us, then canboatjs parses each line.
        this.write(data)
      })
    })
      .on('connect', (con: net.Socket) => {
        this.tcpStream = con
        const msg = `Connected to canboat-pipeline ${this.options.host}:${this.options.port}`
        this.options.app.setProviderStatus(this.options.providerId, msg)
        this.options.app.emit('nmea2000OutAvailable')
        this.debug(msg)
      })
      .on('reconnect', (n: number, delay: number) => {
        const msg = `Reconnect ${this.options.host}:${this.options.port} retry ${n} delay ${delay}`
        this.options.app.setProviderError(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('disconnect', () => {
        this.tcpStream = undefined
        const msg = `Disconnected ${this.options.host}:${this.options.port}`
        this.options.app.setProviderError(this.options.providerId, msg)
        this.debug(msg)
      })
      .on('error', (err: Error & { errors?: string[] }) => {
        let msg: string
        if (err.message && err.message.length > 0) {
          msg = err.message
        } else if (err.errors) {
          msg = err.errors.toString()
        } else {
          msg = err.toString()
        }
        this.options.app.setProviderError(this.options.providerId, msg)
        console.error('CanboatCsvProvider:' + msg)
      })
      .connect(this.options)
  }

  end(): this {
    if (this.reconnector) {
      this.reconnector.disconnect()
    }
    return this
  }

  _transform(
    data: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    callback(null, data)
  }
}
