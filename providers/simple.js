const Transform = require('stream').Transform
const Writable = require('stream').Writable
const _ = require('lodash')
const debug = require('debug')('signalk:simple')
const N2kAnalyzer = require('./n2kAnalyzer')
const FromJson = require('./from_json')
const MultiplexedLog = require('./multiplexedlog')
const nmea0183_signalk = require('./nmea0183-signalk')
const N2kToSignalK = require('./n2k-signalk')
const Log = require('./log')
const Liner = require('./liner')
const execute = require('./execute')
const Udp = require('./udp')
const Tcp = require('./tcp')
const FileStream = require('./filestream')
const Throttle = require('./throttle')
const TimestampThrottle = require('./timestamp-throttle')
const CanboatJs = require('./canboatjs')

function Simple (options) {
  Transform.call(this, { objectMode: true })

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

  const mappingType =
    options.type == 'NMEA2000' &&
    options.subOptions &&
    (options.subOptions.type == 'ngt-1-canboatjs' ||
      options.subOptions.type === 'canbus-canboatjs')
      ? 'NMEA2000JS'
      : dataType

  const pipeline = [].concat(
    pipeStartByType[options.type](options.subOptions, options.logging),
    getLogger(options.app, options.logging, discriminatorByDataType[dataType]),
    dataTypeMapping[mappingType](options)
  )

  for (var i = pipeline.length - 2; i >= 0; i--) {
    pipeline[i].pipe(pipeline[i + 1])
  }
  pipeline[pipeline.length - 1].pipe(this)

  this.pipeline = pipeline
}

require('util').inherits(Simple, Transform)

Simple.prototype._transform = function (msg, encoding, done) {
  this.push(msg)
  done()
}

Simple.prototype.end = function () {
  this.pipeline[0].end()
}

module.exports = Simple

const getLogger = (app, logging, discriminator) =>
  logging
    ? [
      new Log({
        app: app,
        discriminator
      })
    ]
    : []

const discriminatorByDataType = {
  NMEA2000JS: 'A',
  NMEA2000: 'A',
  NMEA0183: 'N',
  SignalK: 'I'
}

const dataTypeMapping = {
  SignalK: options =>
    options.subOptions.type != 'wss' && options.subOptions.type != 'ws'
      ? [new FromJson(options.subOptions)]
      : [],
  NMEA0183: options => {
    const result = [new nmea0183_signalk(options.subOptions)]
    if (options.type === 'FileStream') {
      result.unshift(
        new Throttle({
          rate: options.subOptions.throttleRate || 1000
        })
      )
    }
    return result
  },
  NMEA2000: options => {
    const result = [new N2kAnalyzer(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  NMEA2000JS: options => {
    const result = [new CanboatJs(options.subOptions)]
    if (options.type === 'FileStream') {
      result.push(new TimestampThrottle())
    }
    return result.concat([new N2kToSignalK(options.subOptions)])
  },
  Multiplexed: options => [new MultiplexedLog(options.subOptions)]
}

const pipeStartByType = {
  NMEA2000: nmea2000input,
  NMEA0183: nmea0183input,
  Execute: executeInput,
  FileStream: fileInput,
  SignalK: signalKInput
}

function nmea2000input (subOptions, logging) {
  if (subOptions.type === 'ngt-1-canboatjs') {
    return [
      new require('./actisense-serial')({
        device: subOptions.device,
        app: subOptions.app,
        outEvent: 'nmea2000out',
        plainText: logging
      })
    ]
  } else if (subOptions.type === 'canbus-canboatjs') {
    return [
      new require('./canbus')({
        canDevice: subOptions.interface,
        app: subOptions.app
      })
    ]
  } else {
    let command
    let toChildProcess
    if (subOptions.type == 'ngt-1') {
      command = `actisense-serial ${subOptions.device}`
      toChildProcess = 'nmea2000out'
    } else if (subOptions.type == 'canbus') {
      command = `candump ${subOptions.interface} | candump2analyzer`
      toChildProcess = null
    } else {
      throw new Error(`unknown NMEA2000 type ${subOptions.type}`)
    }
    return [
      new execute({
        command: command,
        toChildProcess: toChildProcess,
        app: subOptions.app
      }),
      new Liner(subOptions)
    ]
  }
}

function nmea0183input (subOptions) {
  if (subOptions.type == 'tcp') {
    return [new Tcp(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    return [new Udp(subOptions)]
  } else if (subOptions.type === 'serial') {
    const serialport = require('./serialport')
    return [new serialport(subOptions)]
  } else {
    throw new Error(`Unknown networking tyoe: ${options.networking}`)
  }
}

function executeInput (subOptions) {
  return [new execute(subOptions), new Liner(subOptions)]
}

function fileInput (subOptions) {
  const result = [new FileStream(subOptions)]
  result.push(new Liner(subOptions))
  return result
}

function signalKInput (subOptions) {
  if (subOptions.type === 'ws' || subOptions.type === 'wss') {
    const options = { app: subOptions.app }
    if (!subOptions.useDiscovery) {
      options.host = subOptions.host
      options.port = subOptions.port
    }
    options.protocol = subOptions.type
    const mdns_ws = require('./mdns-ws')
    return [new mdns_ws(options)]
  } else if (subOptions.type === 'tcp') {
    return [new Tcp(subOptions), new Liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    return [new Udp(subOptions)]
  }
  throw new Error(`unknown SignalK type: ${subOptions.type}`)
}
