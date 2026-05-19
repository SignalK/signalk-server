import { Transform, TransformCallback } from 'stream'
import N2kAnalyzer from './n2kAnalyzer'
import FromJson from './from_json'
import MultiplexedLog from './multiplexedlog'
import Log from './log'
import Liner from './liner'
import SplittingLiner from './splitting-liner'
import Execute from './execute'
import Udp from './udp'
import Tcp from './tcp'
import TcpServer from './tcpserver'
import FileStream from './filestream'
import Replacer from './replacer'
import Throttle from './throttle'
import TimestampThrottle from './timestamp-throttle'
import Gpsd from './gpsd'
import PigpioSeatalk from './pigpio-seatalk'
import GpiodSeatalk from './gpiod-seatalk'
import type { CreateDebug, DeltaCache } from './types'

// canboat exports are old-style constructor functions, not classes.
// They lack construct signatures in their type declarations, so we
// define callable interfaces here to use them with `new`.
interface CanboatCtor {
  new (options: object, ...args: unknown[]): Transform
}

// CJS/ESM compat: these modules export the constructor on .default
// when compiled from ESM, or as the module itself in plain CJS.
function requireN2K(): {
  CanboatJs: new (options: object) => PipeElement
  N2kToSignalK: new (options: object) => PipeElement
} {
  const cb = require('./canboatjs')
  const n2k = require('./n2k-signalk')
  return {
    CanboatJs: cb.default ?? cb,
    N2kToSignalK: n2k.default ?? n2k
  }
}

function requireN2kToSignalK(): new (options: object) => PipeElement {
  const n2k = require('./n2k-signalk')
  return n2k.default ?? n2k
}

function requireNmea0183ToSignalK(): new (options: object) => PipeElement {
  const mod = require('./nmea0183-signalk')
  return mod.default ?? mod
}

function requireW2k01(): CanboatCtor {
  return (require('@canboat/canboatjs') as { W2k01: unknown })
    .W2k01 as unknown as CanboatCtor
}

interface SimpleApp {
  selfContext: string
  isNmea2000OutAvailable: boolean
  deltaCache: DeltaCache
  config: {
    configPath: string
    settings: {
      loggingDirectory?: string
      keepMostRecentLogsOnly?: boolean
      logCountToKeep?: number
    }
    getExternalHostname(): string
    getExternalPort(): number
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): void
  emit(event: string, ...args: unknown[]): void
  emitPropertyValue(name: string, value: unknown): void
  setProviderStatus(id: string, msg: string): void
  setProviderError(id: string, msg: string): void
  handleMessage(id: string, delta: object): void
  signalk: { emit(event: string, ...args: unknown[]): void }
}

interface SubOptions {
  app: SimpleApp
  providerId: string
  emitPropertyValue?: (name: string, value: unknown) => void
  onPropertyValues?: (name: string, callback: (value: unknown) => void) => void
  createDebug?: CreateDebug
  dataType?: string
  type?: string
  host?: string
  port?: number
  device?: string
  interface?: string
  command?: string
  filename?: string
  baudrate?: number
  throttleRate?: number
  overrideTimestamp?: boolean
  removeNulls?: boolean
  ignoredSentences?: string[]
  noThrottle?: boolean
  validateChecksum?: boolean
  useCanboatjs?: boolean
  suppress0183event?: boolean
  sentenceEvent?: string | string[]
  appendChecksum?: boolean
  filters?: Array<{ source?: string; pgn?: string }>
  filtersEnabled?: boolean
  useCanName?: boolean
  tcp?: boolean
  [key: string]: unknown
}

interface SimpleOptions {
  app: SimpleApp
  providerId: string
  type: string
  logging?: boolean
  subOptions: SubOptions
  emitPropertyValue: (name: string, value: unknown) => void
  onPropertyValues: (name: string, callback: (value: unknown) => void) => void
  createDebug?: CreateDebug
}

// Pipeline elements must support .pipe() and .end(). Most are Transform
// streams, but FileStream and DeMultiplexer are custom stream-like objects.
interface PipeElement {
  pipe(
    destination: NodeJS.WritableStream,
    options?: { end?: boolean }
  ): NodeJS.WritableStream
  end(): unknown
}

type PipelineFactory = (options: SimpleOptions) => PipeElement[]
type PipeStartFactory = (
  subOptions: SubOptions,
  logging?: boolean
) => PipeElement[]

const discriminatorByDataType: Record<string, string> = {
  NMEA2000JS: 'A',
  NMEA2000IK: 'A',
  NMEA2000YD: 'A',
  NMEA2000: 'A',
  NMEA0183: 'N',
  SignalK: 'I',
  Seatalk: 'N'
}

const dataTypeMapping: Record<string, PipelineFactory> = {
  SignalK: (options) =>
    options.subOptions.type !== 'wss' && options.subOptions.type !== 'ws'
      ? [new FromJson()]
      : [],
  Seatalk: (options) => {
    const Ctor = requireNmea0183ToSignalK()
    return [
      new Ctor({
        ...options.subOptions,
        validateChecksum: false
      })
    ]
  },
  NMEA0183: (options) => {
    const Ctor = requireNmea0183ToSignalK()
    const result: PipeElement[] = [new Ctor(options.subOptions)]
    if (options.type === 'FileStream') {
      result.unshift(
        new Throttle({
          rate: options.subOptions.throttleRate ?? 1000,
          chunksize: options.subOptions.throttleRate ?? 1000
        })
      )
    }
    return result
  },
  NMEA2000: (options) => {
    const N2kCtor = requireN2kToSignalK()
    const result: PipeElement[] = [new N2kAnalyzer(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return [...result, new N2kCtor(options.subOptions)]
  },
  NMEA2000JS: (options) => {
    const { CanboatJs, N2kToSignalK } = requireN2K()
    const result: PipeElement[] = [new CanboatJs(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return [...result, new N2kToSignalK(options.subOptions)]
  },
  NMEA2000IK: (options) => {
    const { CanboatJs, N2kToSignalK } = requireN2K()
    const canboatjs = require('@canboat/canboatjs') as {
      iKonvert: unknown
    }
    const iKonvertCtor = canboatjs.iKonvert as unknown as CanboatCtor
    const result: PipeElement[] = [new CanboatJs(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(
        new TimestampThrottle({
          getMilliseconds: (msg) => {
            return (msg as unknown as { timer: number }).timer * 1000
          }
        })
      )
    }
    {
      let subOptions: SubOptions
      if (options.subOptions.type === 'navlink2-tcp-canboatjs') {
        subOptions = { ...options.subOptions, tcp: true }
      } else {
        subOptions = options.subOptions
      }
      result.unshift(new iKonvertCtor(subOptions))
    }
    return [...result, new N2kToSignalK(options.subOptions)]
  },
  NMEA2000YD: (options) => {
    const N2kCtor = requireN2kToSignalK()
    const canboatjs = require('@canboat/canboatjs') as {
      Ydwg02: unknown
    }
    const Ydwg02Ctor = canboatjs.Ydwg02 as unknown as CanboatCtor
    const result: PipeElement[] = [
      new Ydwg02Ctor(
        { ...options.subOptions },
        options.subOptions.type === 'ydwg02-usb-canboatjs' ? 'usb' : 'network'
      )
    ]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return [...result, new N2kCtor(options.subOptions)]
  },
  NMEA2000W2K_ASCII: (options) => {
    const N2kCtor = requireN2kToSignalK()
    const W2k01Ctor = requireW2k01()
    const result: PipeElement[] = [
      new W2k01Ctor({
        format: 'ascii',
        ...options.subOptions
      })
    ]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return [...result, new N2kCtor(options.subOptions)]
  },
  NMEA2000W2K_ACTISENSE: (options) => {
    const N2kCtor = requireN2kToSignalK()
    const W2k01Ctor = requireW2k01()
    const result: PipeElement[] = [
      new W2k01Ctor({
        format: 'actisense',
        ...options.subOptions
      })
    ]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return [...result, new N2kCtor(options.subOptions)]
  },
  Multiplexed: (options) => [new MultiplexedLog(options.subOptions)]
}

function nmea2000input(
  subOptions: SubOptions,
  logging?: boolean
): PipeElement[] {
  if (subOptions.type === 'ngt-1-canboatjs') {
    const ActisenseSerial = require('./actisense-serial') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = ActisenseSerial.default ?? ActisenseSerial
    return [
      new (Ctor as new (options: object) => PipeElement)({
        ...subOptions,
        plainText: logging
      })
    ]
  } else if (subOptions.type === 'canbus-canboatjs') {
    const Canbus = require('./canbus') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = Canbus.default ?? Canbus
    return [
      new (Ctor as new (options: object) => PipeElement)({
        ...subOptions,
        canDevice: subOptions.interface
      })
    ]
  } else if (subOptions.type === 'ikonvert-canboatjs') {
    const Serialport = require('./serialport') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = Serialport.default ?? Serialport
    return [
      new (Ctor as new (options: object) => PipeElement)({
        ...subOptions,
        baudrate: 230400,
        toStdout: 'ikonvertOut'
      })
    ]
  } else if (subOptions.type === 'ydwg02-canboatjs') {
    return [
      new Tcp({ ...subOptions, outEvent: 'ydwg02-out' } as SubOptions & {
        host: string
        port: number
        outEvent: string
      }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'ydwg02-udp-canboatjs') {
    return [
      new Udp({ ...subOptions, outEvent: 'ydwg02-out' } as SubOptions & {
        port: number
        outEvent: string
      }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'navlink2-tcp-canboatjs') {
    return [
      new Tcp({ ...subOptions, outEvent: 'navlink2-out' } as SubOptions & {
        host: string
        port: number
        outEvent: string
      }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'w2k-1-n2k-ascii-canboatjs') {
    const W2k01Ctor = requireW2k01()
    return [
      new Tcp({ ...subOptions, outEvent: 'w2k-1-out' } as SubOptions & {
        host: string
        port: number
        outEvent: string
      }),
      new Liner(subOptions),
      new W2k01Ctor(subOptions, 'ascii', 'w2k-1-out')
    ]
  } else if (subOptions.type === 'w2k-1-n2k-actisense-canboatjs') {
    const W2k01Ctor = requireW2k01()
    return [
      new Tcp({ ...subOptions, outEvent: 'w2k-1-out' } as SubOptions & {
        host: string
        port: number
        outEvent: string
      }),
      new W2k01Ctor(subOptions, 'actisense', 'w2k-1-out')
    ]
  } else if (subOptions.type === 'navlink2-udp-canboatjs') {
    return [
      new Udp(subOptions as SubOptions & { port: number }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'ydwg02-usb-canboatjs') {
    const Serialport = require('./serialport') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = Serialport.default ?? Serialport
    return [
      new (Ctor as new (options: object) => PipeElement)({
        ...subOptions,
        baudrate: 38400,
        toStdout: 'ydwg02-out'
      })
    ]
  } else {
    let command: string
    let toChildProcess: string | undefined
    if (subOptions.type === 'ngt-1') {
      command = `actisense-serial -s ${subOptions.baudrate ?? 115200} ${subOptions.device}`
      toChildProcess = 'nmea2000out'
    } else if (subOptions.type === 'canbus') {
      command = `candump ${subOptions.interface} | candump2analyzer`
      toChildProcess = undefined
    } else {
      throw new Error(`unknown NMEA2000 type ${subOptions.type}`)
    }
    return [
      new Execute({
        command,
        toChildProcess,
        app: subOptions.app,
        providerId: subOptions.providerId
      }),
      new Liner(subOptions)
    ]
  }
}

function nmea0183input(subOptions: SubOptions): PipeElement[] {
  let pipePart: PipeElement[] | undefined
  if (subOptions.type === 'tcp') {
    pipePart = [
      new Tcp(subOptions as SubOptions & { host: string; port: number }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'tcpserver') {
    pipePart = [new TcpServer(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    pipePart = [
      new Udp(subOptions as SubOptions & { port: number }),
      new SplittingLiner(subOptions)
    ]
  } else if (subOptions.type === 'serial') {
    const Serialport = require('./serialport') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = Serialport.default ?? Serialport
    pipePart = [new (Ctor as new (options: object) => PipeElement)(subOptions)]
  } else if (subOptions.type === 'gpsd') {
    pipePart = [new Gpsd(subOptions), new Liner(subOptions)]
  }

  if (pipePart) {
    if (subOptions.removeNulls) {
      pipePart.push(new Replacer({ regexp: '\u0000', template: '' }))
    }
    pipePart.push(...nmea0183inputFilter(subOptions.ignoredSentences ?? []))
    return pipePart
  } else {
    throw new Error(`Unknown networking type: ${subOptions.type}`)
  }
}

function executeInput(subOptions: SubOptions): PipeElement[] {
  return [
    new Execute(subOptions as SubOptions & { command: string }),
    new Liner(subOptions)
  ]
}

function fileInput(subOptions: SubOptions): PipeElement[] {
  return [
    new FileStream(subOptions as SubOptions & { filename: string }),
    new Liner(subOptions)
  ]
}

function signalKInput(subOptions: SubOptions): PipeElement[] {
  if (subOptions.type === 'ws' || subOptions.type === 'wss') {
    const MdnsWs = require('./mdns-ws') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = MdnsWs.default ?? MdnsWs
    return [new (Ctor as new (options: object) => PipeElement)(subOptions)]
  } else if (subOptions.type === 'tcp') {
    return [
      new Tcp(subOptions as SubOptions & { host: string; port: number }),
      new Liner(subOptions)
    ]
  } else if (subOptions.type === 'udp') {
    return [new Udp(subOptions as SubOptions & { port: number })]
  } else if (subOptions.type === 'serial') {
    const Serialport = require('./serialport') as {
      default: new (options: object) => PipeElement
    }
    const Ctor = Serialport.default ?? Serialport
    return [new (Ctor as new (options: object) => PipeElement)(subOptions)]
  }
  throw new Error(`unknown SignalK type: ${subOptions.type}`)
}

function seatalkInput(subOptions: SubOptions): PipeElement[] {
  const pipePart: PipeElement[] = []
  if (subOptions.type === 'gpiod') {
    pipePart.push(new GpiodSeatalk(subOptions))
  } else {
    pipePart.push(new PigpioSeatalk(subOptions))
  }
  // Split the child process stdout on newlines so each $STALK frame and
  // each '# ...' comment from the bit-bang reader becomes its own line,
  // even when multiple writes get coalesced into one read by the OS pipe.
  pipePart.push(new Liner(subOptions))
  pipePart.push(...seatalk1inputFilter(subOptions.ignoredSentences ?? []))
  return pipePart
}

// Returns an array of pipe elements that filter NMEA0183 sentences by matching
// the three-letter sentence identifier that follows the talker id. For example,
// filtering "RMC" removes lines like "$GPRMC,123519,A,..." because the pattern
// "^...RMC.*" skips the "$GP" talker prefix (3 chars) and matches "RMC" plus
// the rest of the line.
function nmea0183inputFilter(ignoredSentences: string[]): PipeElement[] {
  return ignoredSentences
    .filter((sentence) => sentence.length > 0)
    .map(
      (sentence) =>
        new Replacer({
          regexp: `^...${sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`,
          template: ''
        })
    )
}

// Returns an array of pipe elements that filter SeaTalk1 datagrams by matching
// the command byte in $STALK sentences. SeaTalk1 data arrives as
// "$STALK,<cmd>,<d1>,<d2>,..." where <cmd> is a hex byte identifying the
// datagram type. For example, filtering "84" removes
// "$STALK,84,56,FA,01,03,37,2F,1C,0B" (depth) while letting other datagrams
// like "$STALK,9C,01,23,45" (compass heading) pass through.
function seatalk1inputFilter(ignoredCommands: string[]): PipeElement[] {
  return ignoredCommands
    .filter((command) => command.length > 0)
    .map(
      (command) =>
        new Replacer({
          regexp: `^\\$STALK,${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*`,
          template: ''
        })
    )
}

const pipeStartByType: Record<string, PipeStartFactory> = {
  NMEA2000: nmea2000input,
  NMEA0183: nmea0183input,
  Execute: executeInput,
  FileStream: fileInput,
  SignalK: signalKInput,
  Seatalk: seatalkInput
}

function getLoggerPipeline(
  app: SimpleApp,
  logging: boolean | undefined,
  discriminator: string | undefined
): PipeElement[] {
  if (!logging) {
    return []
  }
  return [
    new Log({
      app,
      discriminator
    })
  ]
}

export default class Simple extends Transform {
  private readonly pipeline: PipeElement[]

  constructor(options: SimpleOptions) {
    super({ objectMode: true })

    const { emitPropertyValue, onPropertyValues, createDebug } = options
    const opts = { ...options }
    opts.subOptions = {
      ...options.subOptions,
      emitPropertyValue,
      onPropertyValues,
      createDebug
    }

    opts.subOptions.providerId = options.providerId
    const dataType = opts.subOptions.dataType ?? options.type
    if (!dataType) {
      throw new Error(`Unknown data type for ${options.type}`)
    }

    if (!pipeStartByType[options.type]) {
      throw new Error(`Invalid input type: ${options.type}`)
    }
    if (!dataTypeMapping[dataType]) {
      throw new Error(`Unknown data type: ${dataType}`)
    }
    if (dataType !== 'Multiplexed' && !discriminatorByDataType[dataType]) {
      throw new Error(`No discriminator for: ${dataType}`)
    }

    opts.subOptions.app = options.app

    let mappingType = dataType

    if (options.type === 'NMEA2000' && opts.subOptions) {
      if (
        opts.subOptions.type === 'ngt-1-canboatjs' ||
        opts.subOptions.type === 'canbus-canboatjs' ||
        opts.subOptions.type === 'w2k-1-n2k-actisense-canboatjs' ||
        opts.subOptions.type === 'w2k-1-n2k-ascii-canboatjs'
      ) {
        mappingType = 'NMEA2000JS'
      } else if (
        opts.subOptions.type === 'ikonvert-canboatjs' ||
        opts.subOptions.type === 'navlink2-tcp-canboatjs'
      ) {
        mappingType = 'NMEA2000IK'
      } else if (
        opts.subOptions.type === 'ydwg02-canboatjs' ||
        opts.subOptions.type === 'ydwg02-udp-canboatjs' ||
        opts.subOptions.type === 'ydwg02-usb-canboatjs'
      ) {
        mappingType = 'NMEA2000YD'
      }
      options.app.on('nmea2000out', () => {
        setImmediate(() =>
          options.app.emit('connectionwrite', {
            providerId: options.providerId
          })
        )
      })
      options.app.on('nmea2000JsonOut', () => {
        setImmediate(() =>
          options.app.emit('connectionwrite', {
            providerId: options.providerId
          })
        )
      })
    }

    const pipeStart = pipeStartByType[options.type]!
    const dataMapper = dataTypeMapping[mappingType]!

    const pipeline: PipeElement[] = [
      ...pipeStart(opts.subOptions, options.logging),
      ...getLoggerPipeline(
        options.app,
        options.logging,
        discriminatorByDataType[dataType]
      ),
      ...dataMapper(opts)
    ]

    const dataReceivedEventName = `${opts.subOptions.providerId}-received`

    const spy = new Transform({
      objectMode: true,
      transform(
        chunk: unknown,
        encoding: BufferEncoding,
        callback: TransformCallback
      ) {
        options.app.emit(dataReceivedEventName, chunk)
        callback(null, chunk)
      }
    })
    pipeline.splice(pipeline.length - 1, 0, spy)

    opts.subOptions.app.emitPropertyValue('pipedprovider', {
      id: opts.subOptions.providerId,
      type: mappingType,
      eventNames: {
        received: dataReceivedEventName
      }
    })

    if (opts.subOptions.overrideTimestamp) {
      pipeline.push(
        new Transform({
          objectMode: true,
          transform(
            delta: { updates?: Array<{ timestamp?: string }> },
            encoding: BufferEncoding,
            callback: TransformCallback
          ) {
            if (delta.updates) {
              const now = new Date().toISOString()
              delta.updates.forEach((update) => {
                update.timestamp = now
              })
            }
            callback(null, delta)
          }
        })
      )
    }

    for (let i = pipeline.length - 2; i >= 0; i--) {
      pipeline[i]!.pipe(pipeline[i + 1]! as unknown as NodeJS.WritableStream)
    }
    pipeline[pipeline.length - 1]!.pipe(this)

    this.pipeline = pipeline
  }

  _transform(
    msg: unknown,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    this.push(msg)
    done()
  }

  end(): this {
    this.pipeline[0]!.end()
    return this
  }
}
