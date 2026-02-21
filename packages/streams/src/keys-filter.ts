import { Transform, TransformCallback } from 'stream'
import type { CreateDebug, DebugLogger } from './types'

interface KeysFilterOptions {
  excludeMatchingPaths: string[]
  createDebug?: CreateDebug
}

interface DeltaUpdate {
  values?: Array<{ path: string; [key: string]: unknown }>
  $source?: string
  source?: unknown
  timestamp?: string
}

interface Delta {
  updates?: DeltaUpdate[]
  [key: string]: unknown
}

export default class KeysFilter extends Transform {
  private readonly debug: DebugLogger
  private readonly exclude: string[]

  constructor(options: KeysFilterOptions) {
    super({ objectMode: true })
    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:keys-filter')
    this.exclude = options.excludeMatchingPaths
  }

  _transform(
    chunk: Buffer | string | Delta,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    let delta: Delta | null = null
    let isString = false

    if (
      typeof chunk === 'object' &&
      chunk !== null &&
      !Buffer.isBuffer(chunk)
    ) {
      delta = chunk as Delta
    } else if (typeof chunk === 'string') {
      try {
        delta = JSON.parse(chunk) as Delta
        isString = true
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        this.debug(`Error parsing chunk: ${message}`)
      }
    }

    if (delta && Array.isArray(delta.updates)) {
      const updates: DeltaUpdate[] = []
      for (const update of delta.updates) {
        if (Array.isArray(update.values)) {
          const values = update.values.filter(
            (value) => !this.exclude.includes(value.path)
          )

          if (values.length > 0) {
            const upd: DeltaUpdate = { values }

            if (update.$source) {
              upd.$source = update.$source
            }
            if (update.source) {
              upd.source = update.source
            }
            if (update.timestamp) {
              upd.timestamp = update.timestamp
            }

            updates.push(upd)
          }
        }
      }

      if (updates.length > 0) {
        delta.updates = updates
        this.push(isString ? JSON.stringify(delta) : delta)
      }
    }

    done()
  }
}
