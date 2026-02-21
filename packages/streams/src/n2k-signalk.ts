/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

import { EventEmitter } from 'events'
import { Transform, TransformCallback } from 'stream'
import { N2kMapper } from '@signalk/n2k-signalk'
import { StreamsApp } from './types'

interface N2kFilter {
  source?: string
  pgn?: string
}

interface ToSignalKOptions {
  app: StreamsApp
  providerId: string
  filters?: N2kFilter[]
  filtersEnabled?: boolean
  useCanName?: boolean
  [key: string]: unknown
}

interface N2kMessage {
  src: string | number
  pgn: string | number
  timestamp: string
}

interface DeltaSource {
  label: string
  type: string
  pgn: number
  src: string
  canName?: string
}

interface DeltaValue {
  path: string
  value: { state: string; [key: string]: unknown }
}

interface DeltaUpdate {
  source: DeltaSource
  timestamp?: string
  values: DeltaValue[]
}

interface Delta {
  context: string
  updates: DeltaUpdate[]
}

interface SourceMeta {
  unknowCanName?: boolean
  [key: string]: unknown
}

interface NotificationEntry {
  lastTime: number
  interval: ReturnType<typeof setInterval>
}

export default class ToSignalK extends Transform {
  private readonly sourceMeta: Record<number, SourceMeta> = {}
  private readonly notifications: Record<
    string,
    Record<number, NotificationEntry>
  > = {}
  private readonly options: ToSignalKOptions
  private readonly app: StreamsApp
  private readonly filters?: N2kFilter[]
  private readonly n2kMapper: N2kMapper & EventEmitter

  constructor(options: ToSignalKOptions) {
    super({ objectMode: true })
    this.options = options
    this.app = options.app

    if (options.filters && options.filtersEnabled) {
      this.filters = options.filters.filter(
        (f) => (f.source && f.source.length) || (f.pgn && f.pgn.length)
      )
    }

    this.n2kMapper = new N2kMapper({
      ...options,
      sendMetaData: true
    }) as N2kMapper & EventEmitter

    const n2kOutEvent = 'nmea2000JsonOut'

    this.n2kMapper.on('n2kOut', (pgn: object) =>
      this.app.emit('nmea2000JsonOut', pgn)
    )

    this.n2kMapper.on(
      'n2kSourceMetadata',
      (n2k: N2kMessage, meta: Record<string, unknown>) => {
        const src = Number(n2k.src)
        const existing = this.sourceMeta[src] ?? {}
        this.sourceMeta[src] = { ...existing, ...meta }
        const delta = {
          context: this.app.selfContext,
          updates: [
            {
              source: {
                ...this.sourceMeta[src],
                label: this.options.providerId,
                type: 'NMEA2000',
                pgn: Number(n2k.pgn),
                src: n2k.src.toString()
              },
              timestamp:
                n2k.timestamp.substring(0, 10) +
                'T' +
                n2k.timestamp.substring(11, n2k.timestamp.length),
              values: []
            }
          ]
        }
        this.app.deltaCache.setSourceDelta(
          `${this.options.providerId}.${n2k.src}`,
          delta
        )
      }
    )

    this.n2kMapper.on(
      'n2kSourceMetadataTimeout',
      (pgn: string | number, src: string | number) => {
        if (Number(pgn) === 60928) {
          console.warn(`n2k-signalk: unable to detect can name for src ${src}`)
          const srcNum = Number(src)
          const meta = this.sourceMeta[srcNum]
          if (meta) {
            meta.unknowCanName = true
          }
        }
      }
    )

    this.n2kMapper.on(
      'n2kSourceChanged',
      (src: string | number, from: string, to: string) => {
        console.warn(`n2k-signalk: address ${src} changed from ${from} ${to}`)
        const srcNum = Number(src)
        if (this.sourceMeta[srcNum]) {
          delete this.sourceMeta[srcNum]
        }
      }
    )

    if (this.app.isNmea2000OutAvailable) {
      this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
    } else {
      this.app.on('nmea2000OutAvailable', () =>
        this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
      )
    }
  }

  private isFiltered(source: DeltaSource): N2kFilter | undefined {
    if (!this.filters) {
      return undefined
    }
    return this.filters.find((filter) => {
      const sFilter = this.options.useCanName ? source.canName : source.src
      return (
        (!filter.source ||
          filter.source.length === 0 ||
          filter.source === sFilter) &&
        (!filter.pgn ||
          filter.pgn.length === 0 ||
          String(filter.pgn) === String(source.pgn))
      )
    })
  }

  _transform(
    chunk: N2kMessage,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    try {
      const delta = this.n2kMapper.toDelta(chunk) as unknown as
        | Delta
        | undefined

      const src = Number(chunk.src)
      if (!this.sourceMeta[src]) {
        this.sourceMeta[src] = {}
      }

      const firstUpdate = delta?.updates[0]
      if (
        delta &&
        firstUpdate &&
        firstUpdate.values.length > 0 &&
        !this.isFiltered(firstUpdate.source)
      ) {
        if (!this.options.useCanName) {
          delete firstUpdate.source.canName
        }

        const canName = firstUpdate.source.canName

        if (
          this.options.useCanName &&
          !canName &&
          !this.sourceMeta[src]?.unknowCanName
        ) {
          done()
          return
        }

        delta.updates.forEach((update) => {
          update.values.forEach((kv) => {
            if (kv.path && kv.path.startsWith('notifications.')) {
              const pathNotifs = this.notifications[kv.path]
              if (
                kv.value.state === 'normal' &&
                pathNotifs &&
                pathNotifs[src]
              ) {
                clearInterval(pathNotifs[src].interval)
                delete pathNotifs[src]
              } else if (kv.value.state !== 'normal') {
                if (!this.notifications[kv.path]) {
                  this.notifications[kv.path] = {}
                }
                const currentPathNotifs = this.notifications[kv.path]!
                if (!currentPathNotifs[src]) {
                  const interval = setInterval(() => {
                    const entry = currentPathNotifs[src]
                    if (entry && Date.now() - entry.lastTime > 10000) {
                      const copy = JSON.parse(JSON.stringify(kv)) as DeltaValue
                      copy.value.state = 'normal'
                      const normalDelta = {
                        context: delta.context,
                        updates: [
                          {
                            source: update.source,
                            values: [copy]
                          }
                        ]
                      }
                      delete currentPathNotifs[src]
                      clearInterval(interval)
                      this.app.handleMessage(
                        this.options.providerId,
                        normalDelta
                      )
                    }
                  }, 5000)
                  currentPathNotifs[src] = {
                    lastTime: Date.now(),
                    interval
                  }
                } else {
                  currentPathNotifs[src].lastTime = Date.now()
                }
              }
            }
          })
        })
        this.push(delta)
      }
    } catch (ex) {
      console.error(ex)
    }
    done()
  }
}
