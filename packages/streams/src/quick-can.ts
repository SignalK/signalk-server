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
import { QuickCan } from '@canboat/canboatjs'
import type { CreateDebug } from './types'

interface QuickCanOptions {
  canDevice?: string
  app?: {
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void
  }
  providerId?: string
  createDebug?: CreateDebug
  [key: string]: unknown
}

interface QuickCanLike {
  start(): void
  stop(): void
}

/**
 * Reads 11-bit standard CAN frames from a dedicated SocketCAN interface via
 * canboatjs `QuickCan` and emits raw Quick messages downstream for parsing.
 *
 * `QuickCan` is an old-style canboat constructor with a message callback, so
 * this stream adapts it to the Node Transform interface the piped-provider
 * pipeline expects.
 */
export default class QuickCanStream extends Transform {
  private readonly quickCan: QuickCanLike

  constructor(options: QuickCanOptions) {
    super({ objectMode: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.quickCan = new (QuickCan as any)(options, (msg: unknown) => {
      this.push(msg)
    })
    this.quickCan.start()
  }

  _transform(
    _chunk: unknown,
    _encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    done()
  }

  end(): this {
    this.quickCan.stop()
    return super.end()
  }
}
