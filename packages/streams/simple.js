import { Transform } from 'stream'
import _ from 'lodash'
import N2kAnalyzer from './n2kAnalyzer.js'
import FromJson from './from_json.js'
import MultiplexedLog from './multiplexedlog.js'
import nmea0183_signalk from './nmea0183-signalk.js'
import N2kToSignalK from './n2k-signalk.js'
import Log from './log.js'
import Liner from './liner.js'
import SplittingLiner from './splitting-liner.js'
import execute from './execute.js'
import Udp from './udp.js'
import Tcp from './tcp.js'
import TcpServer from './tcpserver.js'
import FileStream from './filestream.js'
import Replacer from './replacer.js'
import Throttle from './throttle.js'
import TimestampThrottle from './timestamp-throttle.js'
import CanboatJs from './canboatjs.js'
import { iKonvert, Ydwg02, W2k01 } from '@canboat/canboatjs'
import gpsd from './gpsd.js'
import pigpioSeatalk from './pigpio-seatalk.js'
import gpiodSeatalk from './gpiod-seatalk.js'
import { inherits } from 'util'
import actisenseSerial from './actisense-serial.js'
import canbus from './canbus.js'
import serialport from './serialport.js'
import mdns_ws from './mdns-ws.js'

export default function Simple(options) {
  Transform.call(this, { objectMode: true })

  const { emitPropertyValue, onPropertyValues, createDebug } = options
  options = { ...options }
  options.subOptions = {
    ...options.subOptions,
    emitPropertyValue,
    onPropertyValues,
    createDebug,
  }

  options.subOptions.providerId = options.providerId
  const dataType = options.subOptions.dataType || options.type
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

  options.subOptions.app = options.app

  let mappingType = dataType

  if (options.type === 'NMEA2000' && options.subOptions) {
    if (
      options.subOptions.type === 'ngt-1-canboatjs' ||
      options.subOptions.type === 'canbus-canboatjs' ||
      options.subOptions.type === 'w2k-1-n2k-actisense-canboatjs' ||
      options.subOptions.type === 'w2k-1-n2k-ascii-canboatjs'
    ) {
      mappingType = 'NMEA2000JS'
    } else if (
      options.subOptions.type === 'ikonvert-canboatjs' ||
      options.subOptions.type === 'navlink2-tcp-canboatjs'
    ) {
      mappingType = 'NMEA2000IK'
    } else if (
      options.subOptions.type === 'ydwg02-canboatjs' ||
      options.subOptions.type === 'ydwg02-udp-canboatjs' ||
      options.subOptions.type === 'ydwg02-usb-canboatjs'
    ) {
      mappingType = 'NMEA2000YD'
    }
    options.app.on('nmea2000out', () => {
      setImmediate(() =>
        options.app.emit('connectionwrite', { providerId: options.providerId })
      )
    })
    options.app.on('nmea2000JsonOut', () => {
      setImmediate(() =>
        options.app.emit('connectionwrite', { providerId: options.providerId })
      )
    })
  }

  const pipeline = [].concat(
    pipeStartByType[options.type](options.subOptions, options.logging),
    getLogger(options.app, options.logging, discriminatorByDataType[dataType]),
    dataTypeMapping[mappingType](options)
  )
  if (options.subOptions.overrideTimestamp) {
    pipeline.push(
      new Transform({
        objectMode: true,
        transform(delta, encoding, callback) {
          if (delta.updates) {
            const now = new Date().toISOString()
            delta.updates.forEach((update) => (update.timestamp = now))
          }
          callback(null, delta)
        },
      })
    )
  }

  for (let i = pipeline.length - 2; i >= 0; i--) {
    pipeline[i].pipe(pipeline[i + 1])
  }
  pipeline[pipeline.length - 1].pipe(this)

  this.pipeline = pipeline
}

inherits(Simple, Transform)

Simple.prototype._transform = function (msg, encoding, done) {
  this.push(msg)
  done()
}

Simple.prototype.end = function () {
  this.pipeline[0].end()
}

const getLogger = (app, logging, discriminator) =>
  logging
    ? [
        new Log({
          app: app,
          discriminator,
        }),
      ]
    : []

const discriminatorByDataType = {
  NMEA2000JS: 'A',
  NMEA2000IK: 'A',
  NMEA2000YD: 'A',
  NMEA2000: 'A',
  NMEA0183: 'N',
  SignalK: 'I',
  Seatalk: 'N',
}

const dataTypeMapping = {
  SignalK: (options) =>
    options.subOptions.type !== 'wss' && options.subOptions.type !== 'ws'
      ? [new FromJson(options.subOptions)]
      : [],
  Seatalk: (options) => [
    new nmea0183_signalk({ ...options.subOptions, validateChecksum: false }),
  ],
  NMEA0183: (options) => {
    const result = [new nmea0183_signalk(options.subOptions)]
    if (options.type === 'FileStream') {
      result.unshift(
        new Throttle({
          rate: options.subOptions.throttleRate || 1000,
        })
      )
    }
    return result
  },
  NMEA2000: (options) => {
    const result = [new N2kAnalyzer(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000JS: (options) => {
    const result = [new CanboatJs(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000IK: (options) => {
    const result = [new CanboatJs(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(
        new TimestampThrottle({
          getMilliseconds: (msg) => {
            return msg.timer * 1000
          },
        })
      )
    } // else
    {
      let subOptions
      if (options.subOptions.type === 'navlink2-tcp-canboatjs') {
        subOptions = { ...options.subOptions, tcp: true }
      } else {
        subOptions = options.subOptions
      }
      result.unshift(new iKonvert(subOptions))
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000YD: (options) => {
    const result = [
      new Ydwg02(
        options.subOptions,
        options.subOptions.type === 'ydwg02-usb-canboatjs' ? 'usb' : 'network'
      ),
    ]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000W2K_ASCII: (options) => {
    const result = [new W2k01({ format: 'ascii', ...options.subOptions })]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000W2K_ACTISENSE: (options) => {
    const result = [new W2k01({ format: 'actisense', ...options.subOptions })]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  Multiplexed: (options) => [new MultiplexedLog(options.subOptions)],
}

const pipeStartByType = {
  NMEA2000: nmea2000input,
  NMEA0183: nmea0183input,
  Execute: executeInput,
  FileStream: fileInput,
  SignalK: signalKInput,
  Seatalk: seatalkInput,
}

function nmea2000input(subOptions, logging) {
  if (subOptions.type === 'ngt-1-canboatjs') {
    if (!actisenseSerial) {
      throw new Error('unable to load actisense serial')
    }
    return [
      new actisenseSerial({
        ...subOptions,
        plainText: logging,
      }),
    ]
  } else if (subOptions.type === 'canbus-canboatjs') {
    return [
      new canbus({
        ...subOptions,
        canDevice: subOptions.interface,
      }),
    ]
  } else if (subOptions.type === 'ikonvert-canboatjs') {
    return [
      new serialport({
        ...subOptions,
        baudrate: 230400,
        toStdout: 'ikonvertOut',
      }),
    ]
  } else if (subOptions.type === 'ydwg02-canboatjs') {
    return [
      new Tcp({
        ...subOptions,
        outEvent: 'ydwg02-out',
      }),
      new Liner(subOptions),
    ]
  } else if (subOptions.type === 'ydwg02-udp-canboatjs') {
    return [
      new Udp({
        ...subOptions,
        outEvent: 'ydwg02-out',
      }),
      new Liner(subOptions),
    ]
  } else if (subOptions.type === 'navlink2-tcp-canboatjs') {
    return [
      new Tcp({
        ...subOptions,
        outEvent: 'navlink2-out',
      }),
      new Liner(subOptions),
    ]
  } else if (subOptions.type === 'w2k-1-n2k-ascii-canboatjs') {
    return [
      new Tcp({
        ...subOptions,
        outEvent: 'w2k-1-out',
      }),
      new Liner(subOptions),
      new W2k01(subOptions, 'ascii', 'w2k-1-out'),
    ]
  } else if (subOptions.type === 'w2k-1-n2k-actisense-canboatjs') {
    return [
      new Tcp({
        ...subOptions,
        outEvent: 'w2k-1-out',
      }),
      new W2k01(subOptions, 'actisense', 'w2k-1-out'),
    ]
  } else if (subOptions.type === 'navlink2-udp-canboatjs') {
    return [new Udp(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'ydwg02-usb-canboatjs') {
    return [
      new serialport({
        ...subOptions,
        baudrate: 38400,
        toStdout: 'ydwg02-out',
      }),
    ]
  } else {
    let command
    let toChildProcess
    if (subOptions.type === 'ngt-1') {
      command = `actisense-serial -s ${subOptions.baudrate || 115200} ${
        subOptions.device
      }`
      toChildProcess = 'nmea2000out'
    } else if (subOptions.type === 'canbus') {
      command = `candump ${subOptions.interface} | candump2analyzer`
      toChildProcess = null
    } else {
      throw new Error(`unknown NMEA2000 type ${subOptions.type}`)
    }
    return [
      new execute({
        command: command,
        toChildProcess: toChildProcess,
        app: subOptions.app,
        providerId: subOptions.providerId,
      }),
      new Liner(subOptions),
    ]
  }
}

function nmea0183input(subOptions) {
  let pipePart
  if (subOptions.type === 'tcp') {
    pipePart = [new Tcp(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'tcpserver') {
    pipePart = [new TcpServer(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    pipePart = [new Udp(subOptions), new SplittingLiner(subOptions)]
  } else if (subOptions.type === 'serial') {
    pipePart = [new serialport(subOptions)]
  } else if (subOptions.type === 'gpsd') {
    pipePart = [new gpsd(subOptions)]
  }

  if (pipePart) {
    if (subOptions.removeNulls) {
      pipePart.push(
        new Replacer({
          regexp: '\u0000',
          template: '',
        })
      )
    }
    if (subOptions.ignoredSentences) {
      console.log(subOptions.ignoredSentences)
      subOptions.ignoredSentences.forEach((sentence) => {
        if (sentence.length > 0) {
          pipePart.push(
            new Replacer({
              regexp: `^...${sentence}.*`,
              template: '',
            })
          )
        }
      })
    }
    return pipePart
  } else {
    throw new Error(`Unknown networking type: ${subOptions.type}`)
  }
}

function executeInput(subOptions) {
  return [new execute(subOptions), new Liner(subOptions)]
}

function fileInput(subOptions) {
  const result = [new FileStream(subOptions)]
  result.push(new Liner(subOptions))
  return result
}

function signalKInput(subOptions) {
  if (subOptions.type === 'ws' || subOptions.type === 'wss') {
    return [new mdns_ws(subOptions)]
  } else if (subOptions.type === 'tcp') {
    return [new Tcp(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    return [new Udp(subOptions)]
  } else if (subOptions.type === 'serial') {
    return [new serialport(subOptions)]
  }
  throw new Error(`unknown SignalK type: ${subOptions.type}`)
}

function seatalkInput(subOptions) {
  if (subOptions.type === 'gpiod') {
    return [new gpiodSeatalk(subOptions)]
  } else {
    return [new pigpioSeatalk(subOptions)]
  }
}
