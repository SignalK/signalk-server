/*
 * Copyright 2017 Signal K & Fabian Tollenaar <fabian@signalk.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Transform, TransformCallback } from 'stream'
import Parser from '@signalk/nmea0183-signalk'
import { appendChecksum } from '@signalk/nmea0183-utilities'
import type { CreateDebug } from './types'

function isN2KOver0183(msg: string): boolean {
  const sentence = msg.charAt(0) === '\\' ? msg.split('\\')[2] : msg
  return sentence
    ? sentence.startsWith('$PCDIN,') || sentence.startsWith('$MXPGN,')
    : false
}

interface Nmea0183ToSignalKOptions {
  app: {
    emit(event: string, ...args: unknown[]): void
    signalk: { emit(event: string, ...args: unknown[]): void }
  }
  providerId: string
  createDebug?: CreateDebug
  suppress0183event?: boolean
  appendChecksum?: boolean
  sentenceEvent?: string | string[]
  [key: string]: unknown
}

interface TimestampedChunk {
  line: string
  timestamp: number | string
}

interface DeltaUpdate {
  timestamp?: Date | null
  [key: string]: unknown
}

interface Delta {
  updates: DeltaUpdate[]
}

export default class Nmea0183ToSignalK extends Transform {
  private readonly debug: (...args: unknown[]) => void
  private readonly parser: InstanceType<typeof Parser>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private n2kParser: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private n2kToDelta: any
  private readonly n2kState: Record<string, unknown> = {}
  private readonly app: Nmea0183ToSignalKOptions['app']
  private readonly sentenceEvents: string[]
  private readonly appendChecksumFlag: boolean
  private readonly options: Nmea0183ToSignalKOptions

  constructor(options: Nmea0183ToSignalKOptions) {
    super({ objectMode: true })
    this.debug = (options.createDebug ?? require('debug'))(
      'signalk:streams:nmea0183-signalk'
    )

    this.parser = new Parser(options)
    this.options = options

    this.app = options.app
    this.appendChecksumFlag = options.appendChecksum ?? false

    this.sentenceEvents = options.suppress0183event ? [] : ['nmea0183']

    if (options.sentenceEvent) {
      if (Array.isArray(options.sentenceEvent)) {
        this.sentenceEvents = this.sentenceEvents.concat(options.sentenceEvent)
      } else {
        this.sentenceEvents.push(options.sentenceEvent)
      }
    }
  }

  _transform(
    chunk: string | Buffer | TimestampedChunk,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    let sentence: string | undefined
    let timestamp: Date | null = null

    if (
      chunk &&
      typeof chunk === 'object' &&
      !Buffer.isBuffer(chunk) &&
      typeof (chunk as TimestampedChunk).line === 'string'
    ) {
      const tsChunk = chunk as TimestampedChunk
      timestamp = new Date(Number(tsChunk.timestamp))
      sentence = tsChunk.line.trim()
    } else if (Buffer.isBuffer(chunk)) {
      sentence = chunk.toString().trim()
    } else if (chunk && typeof chunk === 'string') {
      sentence = chunk.trim()
    }

    try {
      if (sentence !== undefined) {
        if (this.appendChecksumFlag) {
          sentence = appendChecksum(sentence)
        }
        this.sentenceEvents.forEach((eventName) => {
          this.app.emit(eventName, sentence)
          this.app.signalk.emit(eventName, sentence)
        })

        let delta: Delta | null = null
        if (isN2KOver0183(sentence)) {
          if (!this.n2kParser) {
            const { FromPgn } = require('@canboat/canboatjs')
            const { toDelta } = require('@signalk/n2k-signalk')
            this.n2kParser = new FromPgn(this.options)
            this.n2kToDelta = toDelta
          }
          const pgn = this.n2kParser.parseN2KOver0183(sentence, () => {})
          if (pgn) {
            delta = this.n2kToDelta(pgn, this.n2kState, {
              sendMetaData: true
            }) as unknown as Delta | null
          }
        } else {
          delta = this.parser.parse(sentence) as Delta | null
        }

        if (delta !== null) {
          if (timestamp !== null) {
            delta.updates.forEach((update) => {
              update.timestamp = timestamp
            })
          }

          this.push(delta)
        }
      }
    } catch (e) {
      this.debug(e)
    }

    done()
  }
}
