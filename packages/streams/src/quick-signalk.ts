/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Transform, TransformCallback } from 'stream'
import { QuickMapper, QuickMessage, QuickDelta } from '@signalk/quick-signalk'

interface QuickToSignalKOptions {
  app: {
    selfContext: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
  }
  [key: string]: unknown
}

/**
 * Converts parsed Quick PCS messages (from canboatjs `FromPgn`) into
 * Signal K deltas via @signalk/quick-signalk.
 *
 * The pipeline is: `QuickCan (11-bit SocketCAN) -> CanboatJs (FromPgn parser)
 * -> QuickToSignalK (this stream)`.
 */
export default class QuickToSignalK extends Transform {
  private readonly mapper: QuickMapper
  private readonly app: QuickToSignalKOptions['app']

  constructor(options: QuickToSignalKOptions) {
    super({ objectMode: true })
    this.mapper = new QuickMapper(options)
    this.app = options.app
  }

  _transform(
    chunk: QuickMessage,
    _encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    try {
      const delta = this.mapper.toDelta(chunk) as QuickDelta & {
        context?: string
      }
      if (delta && delta.updates && delta.updates.length > 0) {
        delta.context = this.app.selfContext
        this.push(delta)
      }
    } catch (ex) {
      console.error(ex)
    }
    done()
  }
}
