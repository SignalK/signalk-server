import {
  AccumulatedItem,
  accumulateLatestValue,
  buildFlushDeltas
} from './LatestValuesAccumulator'
import { Delta } from '@signalk/server-api'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:backpressure')

const DEFAULT_ENTER_THRESHOLD = 512 * 1024
const DEFAULT_EXIT_THRESHOLD = 1024
const DEFAULT_MAX_BUFFER_SIZE = 4 * 512 * 1024
const DEFAULT_MAX_BUFFER_CHECK_TIME = 30 * 1000

export interface BackpressureTransport {
  readonly id: string
  getBufferLength(): number
  write(delta: Delta): void
  destroy(): void
}

export interface BackpressureOptions {
  enterThreshold: number
  exitThreshold: number
  maxBufferSize: number
  maxBufferCheckTime: number
  beforeWrite?: (delta: Delta) => void
}

export interface BackpressureThresholds {
  enterThreshold: number
  exitThreshold: number
  maxBufferSize: number
  maxBufferCheckTime: number
}

export function parseBackpressureThresholds(configFallbacks?: {
  maxSendBufferSize?: number
  maxSendBufferCheckTime?: number
}): BackpressureThresholds {
  return {
    enterThreshold: process.env.BACKPRESSURE_ENTER
      ? parseInt(process.env.BACKPRESSURE_ENTER, 10)
      : DEFAULT_ENTER_THRESHOLD,
    exitThreshold: process.env.BACKPRESSURE_EXIT
      ? parseInt(process.env.BACKPRESSURE_EXIT, 10)
      : DEFAULT_EXIT_THRESHOLD,
    maxBufferSize: process.env.MAXSENDBUFFERSIZE
      ? parseInt(process.env.MAXSENDBUFFERSIZE, 10)
      : (configFallbacks?.maxSendBufferSize ?? DEFAULT_MAX_BUFFER_SIZE),
    maxBufferCheckTime: process.env.MAXSENDBUFFERCHECKTIME
      ? parseInt(process.env.MAXSENDBUFFERCHECKTIME, 10)
      : (configFallbacks?.maxSendBufferCheckTime ??
        DEFAULT_MAX_BUFFER_CHECK_TIME)
  }
}

export class BackpressureManager {
  private active = false
  private readonly accumulator: Map<string, AccumulatedItem> = new Map()
  private since: number | null = null
  private bufferSizeExceeded: number | undefined = undefined
  private readonly transport: BackpressureTransport
  private readonly options: BackpressureOptions

  constructor(transport: BackpressureTransport, options: BackpressureOptions) {
    this.transport = transport
    this.options = options
  }

  onDrain(): void {
    if (this.active && this.accumulator.size > 0) {
      if (this.transport.getBufferLength() <= this.options.exitThreshold) {
        this.flush()
      }
    }
  }

  send(delta: Delta): void {
    const bufferLength = this.transport.getBufferLength()
    if (bufferLength > this.options.enterThreshold) {
      if (!this.active) {
        this.active = true
        this.since = Date.now()
        debug(
          'Entering backpressure for %s (buffer: %d)',
          this.transport.id,
          bufferLength
        )
      }
      accumulateLatestValue(this.accumulator, delta)
    } else {
      this.options.beforeWrite?.(delta)
      this.transport.write(delta)
    }
    this.assertBufferSize()
  }

  flush(): void {
    if (this.accumulator.size === 0) return
    const countBefore = this.accumulator.size
    const duration = this.since ? Date.now() - this.since : 0
    const deltas = buildFlushDeltas(this.accumulator, duration)
    for (const delta of deltas) {
      this.options.beforeWrite?.(delta as Delta)
      this.transport.write(delta as Delta)
    }
    this.accumulator.clear()
    this.active = false
    this.since = null
    debug(
      'Flushed %d accumulated values for %s',
      countBefore,
      this.transport.id
    )
  }

  assertBufferSize(): void {
    if (this.options.maxBufferSize === 0) return
    const bufferLength = this.transport.getBufferLength()
    if (bufferLength > this.options.maxBufferSize) {
      if (!this.bufferSizeExceeded) {
        console.warn(
          `${this.transport.id} outgoing buffer > max:${bufferLength}`
        )
        this.bufferSizeExceeded = Date.now()
      }
      if (
        Date.now() - this.bufferSizeExceeded >
        this.options.maxBufferCheckTime
      ) {
        console.error(
          'Send buffer overflow, terminating connection ' + this.transport.id
        )
        this.transport.destroy()
      }
    } else {
      this.bufferSizeExceeded = undefined
    }
  }

  clear(): void {
    this.accumulator.clear()
    this.active = false
    this.since = null
    this.bufferSizeExceeded = undefined
  }

  get isActive(): boolean {
    return this.active
  }

  get accumulatorSize(): number {
    return this.accumulator.size
  }
}
