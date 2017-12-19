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
const serialport = require('./serialport')
const udp = require('./udp')
const tcp = require('./tcp')
const filestream = require('./filestream')
const throttle = require('./throttle')

function Simple (options) {
  Transform.call(this, { objectMode: true })
  this.options = options
  this.pipeline = []

  var source = pipeStartByType[options.type]

  if ( !source ) {
    throw new Error(`invalid type: ${options.type}`)
  }

  var dataType = options.subOptions.dataType;

  if ( !dataType ) {
    dataType = dataTypeForType[options.type];
    if ( !dataType ) {
      throw new Error(`Unknown data type for ${options.type}`)
    }
  }

  if ( !dataTypeMapping[dataType] ) {
    throw new Error(`Unknown data type: ${dataType}`)
  }

  var subOptions = JSON.parse(JSON.stringify(options.subOptions))
  subOptions.app = options.app

  source(this.pipeline, subOptions)
  this.pipeline.push(new liner(subOptions))
  if ( options.logging ) {
    this.pipeline.push(new log({
      app: options.app,
      discriminator: discriminatorByDataType[dataType]
    }))
  }

  dataTypeMapping[dataType](this.pipeline, subOptions)

  for (var i = this.pipeline.length - 2; i >= 0; i--) {
    this.pipeline[i].pipe(this.pipeline[i + 1])
  }
  this.pipeline[this.pipeline.length-1].pipe(this)
}

require('util').inherits(Simple, Transform)

Simple.prototype._transform = function (msg, encoding, done) {
  this.push(msg)
  done()
}

Simple.prototype.end = function () {
  this.pipeline[0].end();
}

module.exports = Simple

const discriminatorByDataType = {
  'NMEA2000': 'A',
  'NMEA0183': 'N',
  'SignalK': 'I'
}

const pipeStartByType = {
  'NMEA2000': (pipeline, subOptions) => {
    var command;
    var toChildProcess;
    if ( subOptions.type == 'ngt-1' ) {
      command = `actisense-serial ${subOptions.device}`,
      toChildProcess = 'nmea2000out'
    } else if ( subOptions.type == 'canbus' ) {
      command = `candump ${subOptions.interface}`
      toChildProcess = null
    } else {
      throw new Error(`unknown NMEA2000 type ${subOptions.type}`)
    }
    pipeline.push(new execute({
      command: command,
      toChildProcess: toChildProcess,
      app: subOptions.app
    }));
  },
  'NMEA0183': (pipeline, subOptions) => {
    var el
    if ( subOptions.type == 'tcp' ) {
      el = new tcp(subOptions);
    } else if ( subOptions.type === 'udp' ) {
      el = new udp(subOptions);
    } else if ( subOptions.type === 'serial' ) {
      el = new serialport(subOptions);
    } else {
      throw new Error(`Unknown networking tyoe: ${options.networking}`)
    }
    pipeline.push(el)
  },
  Execute: (pipeline, subOptions) => {
    pipeline.push(new execute(subOptions));
  },
  "FileStream": (pipeline, subOptions) => {
    pipeline.push(new filestream(subOptions));
    if ( subOptions.dataType != 'Multiplexed' ) {
      pipeline.push(new throttle({
        rate: subOptions.throttleRate || 1000,
        app: subOptions.app
      }));
    }
  }
}

const dataTypeMapping = {
  'SignalK': (pipeline, options) => { pipeline.push(new from_json(options)) },
  'NMEA0183': (pipeline, options) => { pipeline.push(new nmea0183_signalk(options)) },
  'NMEA2000': (pipeline, options) => {
    pipeline.push(new n2kAnalyzer(options))
    pipeline.push(new n2k_signalk(options))
  },
  'Multiplexed': (pipeline, options) => { pipeline.push(new multiplexedlog(options)) }
}

const dataTypeForType = {
  "NMEA2000": "NMEA2000",
  'NMEA0183': "NMEA0183",
}

                      
