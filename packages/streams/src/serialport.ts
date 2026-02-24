import { execSync } from 'child_process'
import { Transform, TransformCallback } from 'stream'
import shellescape from 'any-shell-escape'
import type { CreateDebug, DebugLogger } from './types'

interface SerialStreamOptions {
  device: string
  baudrate: number
  app: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
    emitPropertyValue(name: string, value: unknown): void
    setProviderStatus(id: string, msg: string): void
    setProviderError(id: string, msg: string): void
  }
  providerId: string
  toStdout?: string | string[]
  maxPendingWrites?: number
  reconnect?: boolean
  createDebug?: CreateDebug
}

export default class SerialStream extends Transform {
  private readonly options: SerialStreamOptions
  private readonly debug: DebugLogger
  private serial: import('serialport').SerialPort | null = null
  private reconnectEnabled: boolean
  private reconnectDelay = 1000
  private isFirstError = true
  private readonly maxPendingWrites: number
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(options: SerialStreamOptions) {
    super()

    this.options = options
    this.reconnectEnabled = options.reconnect ?? true
    this.maxPendingWrites = options.maxPendingWrites ?? 5

    const createDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:serialport')

    let pendingWrites = 0
    const stdOutEvents = Array.isArray(this.options.toStdout)
      ? [...this.options.toStdout]
      : ([this.options.toStdout].filter(Boolean) as string[])
    const standardOutEventName = `serial-${this.options.providerId}-toStdout`
    stdOutEvents.push(standardOutEventName)

    const onDrain = (): void => {
      pendingWrites--
    }

    for (const event of stdOutEvents) {
      this.options.app.on(event, (d: string | Buffer) => {
        if (pendingWrites > this.maxPendingWrites) {
          this.debug('Buffer overflow, not writing:' + d)
          return
        }
        this.debug('Writing:' + d)
        if (Buffer.isBuffer(d)) {
          this.serial?.write(d)
        } else {
          this.serial?.write(d + '\r\n')
        }
        setImmediate(() => {
          this.options.app.emit('connectionwrite', {
            providerId: this.options.providerId
          })
        })
        pendingWrites++
        this.serial?.drain(onDrain)
      })
    }

    this.options.app.emitPropertyValue('serialport', {
      id: this.options.providerId,
      eventNames: {
        toStdout: standardOutEventName
      }
    })

    this.start()
  }

  start(): void {
    if (this.serial !== null) {
      this.serial.unpipe(this)
      this.serial.removeAllListeners()
      this.serial = null
    }

    if (this.reconnectEnabled === false) {
      return
    }

    if (process.env['PRESERIALCOMMAND']) {
      execSync(
        `${process.env['PRESERIALCOMMAND']} ${shellescape(this.options.device)}`
      )
    }

    const { SerialPort } = require('serialport') as typeof import('serialport')
    const { ReadlineParser } =
      require('@serialport/parser-readline') as typeof import('@serialport/parser-readline')

    this.serial = new SerialPort({
      path: this.options.device,
      baudRate: this.options.baudrate
    })

    this.serial.on('open', () => {
      this.reconnectDelay = 1000
      this.options.app.setProviderStatus(
        this.options.providerId,
        `Connected to ${this.options.device}`
      )
      this.isFirstError = true
      const parser = new ReadlineParser()
      this.serial!.pipe(parser).pipe(this)
    })

    this.serial.on('error', (x: Error) => {
      this.options.app.setProviderError(this.options.providerId, x.message)
      if (this.isFirstError) {
        console.log(x.message)
      }
      this.debug(x.message)
      this.isFirstError = false
      this.scheduleReconnect()
    })

    this.serial.on('close', () => {
      this.options.app.setProviderError(
        this.options.providerId,
        'Closed, reconnecting...'
      )
      this.scheduleReconnect()
    })
  }

  end(): this {
    this.reconnectEnabled = false
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    if (this.serial) {
      this.serial.close()
    }
    return this
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    this.push(chunk)
    done()
  }

  private scheduleReconnect(): void {
    this.reconnectDelay *= this.reconnectDelay < 60 * 1000 ? 1.5 : 1
    const msg = `Not connected (retry delay ${(
      this.reconnectDelay / 1000
    ).toFixed(0)} s)`
    this.debug(msg)
    this.options.app.setProviderStatus(this.options.providerId, msg)
    this.reconnectTimeout = setTimeout(() => this.start(), this.reconnectDelay)
  }
}
