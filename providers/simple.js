const Transform = require('stream').Transform
const Writable = require('stream').Writable
const _ = require('lodash')

const n2kAnalyzer = require('./n2kAnalyzer')
const from_json = require('./from_json')
const multiplexedlog = require('./multiplexedlog')
const nmea0183_signalk = require('./nmea0183-signalk')
const n2k_signalk = require('./n2k-signalk')
const log = require('./log')
const liner = require('./liner')
const execute = require('./execute')
const udp = require('./udp')
const tcp = require('./tcp')
const filestream = require('./filestream')
const throttle = require('./throttle')

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

  const subOptions = JSON.parse(JSON.stringify(options.subOptions))
  subOptions.app = options.app

  const pipeline = [].concat(
    pipeStartByType[options.type](subOptions),
    getLogger(options.app, options.logging, discriminatorByDataType[dataType]),
    dataTypeMapping[dataType](subOptions)
  )

  console.log(`pipeline ${pipeline}`)

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
      new log({
        app: app,
        discriminator
      })
    ]
    : []

const discriminatorByDataType = {
  NMEA2000: 'A',
  NMEA0183: 'N',
  SignalK: 'I'
}

const dataTypeMapping = {
  SignalK: options =>
    options.type != 'wss' && options.type != 'ws'
      ? [new from_json(options)]
      : [],
  NMEA0183: options => [new nmea0183_signalk(options)],
  NMEA2000: options => [new n2kAnalyzer(options), new n2k_signalk(options)],
  Multiplexed: options => [new multiplexedlog(options)]
}

const pipeStartByType = {
  NMEA2000: nmea2000input,
  NMEA0183: nmea0183input,
  Execute: executeInput,
  FileStream: fileInput,
  SignalK: signalKInput
}

function nmea2000input (subOptions) {
  let command
  let toChildProcess
  if (subOptions.type == 'ngt-1') {
    command = `actisense-serial ${subOptions.device}`
    toChildProcess = 'nmea2000out'
  } else if (subOptions.type == 'canbus') {
    command = `candump ${subOptions.interface}`
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
    new liner(subOptions)
  ]
}

function nmea0183input (subOptions) {
  if (subOptions.type == 'tcp') {
    return [new tcp(subOptions), new liner(subOptions)]
  } else if (subOptions.type === 'udp') {
    return [new udp(subOptions)]
  } else if (subOptions.type === 'serial') {
    const serialport = require('./serialport')
    return [new serialport(subOptions)]
  } else {
    throw new Error(`Unknown networking tyoe: ${options.networking}`)
  }
}

function executeInput (subOptions) {
  return [new execute(subOptions), new liner(subOptions)]
}

function fileInput (subOptions) {
  const result = [new filestream(subOptions)]
  if (subOptions.dataType != 'Multiplexed') {
    result.push(
      new throttle({
        rate: subOptions.throttleRate || 1000,
        app: subOptions.app
      })
    )
  }
  result.push(new liner(subOptions))
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
    return [new tcp(subOptions), new liner(suboptions)]
  } else if (subOptions.type === 'udp') {
    return [new udp(subOptions)]
  }
  throw new Error(`unknown SignalK type: ${subOptions.type}`)
}
