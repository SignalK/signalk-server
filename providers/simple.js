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

function Simple (options) {
  Transform.call(this, {})
  this.options = options

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

  this.last = dataTypeMapping[dataType](options)
  
  var next = this.last;

  if ( options.logging ) {
    var nlog = new log({
      app: options.app,
      discriminator: discriminatorByDataType[dataType]
    });
    next.pipe(nlog);
    next = nlog;
  }

  var nliner = new liner(options);
  nliner.pipe(next)
  next = nliner;

  var subOptions = JSON.parse(JSON.stringify(options.subOptions))
  subOptions.app = options.app
  this.pipeStart = source(subOptions).pipe(next)
}

require('util').inherits(Simple, Transform)

Simple.prototype.pipe = function (target) {
  this.last.pipe(target);
}

Simple.prototype.end = function () {
  this.pipeStart.emd();
}

module.exports = Simple

const discriminatorByDataType = {
  'NMEA2000': 'A',
  'NMEA0183': 'N',
  'SignalK': 'I'
}

const pipeStartByType = {
  'NMEA2000': (subOptions) => {
    return new execute({
      command: `actisense-serial ${subOptions.device}`,
      toChildProcess: 'nmea2000out',
      app: subOptions.app
    });
  },
  'NMEA0183': (subOptions) => {
    if ( subOptions.type == 'tcp' ) {
      return new tcp(subOptions);
    } else if ( subOptions.type === 'udp' ) {
      return new udp(subOptions);
    } else if ( subOptions.type === 'serial' ) {
      return new serialport(subOptions);
    } else {
      throw new Error(`Unknown networking tyoe: ${options.networking}`)
    }
  },
  Execute: (subOptions) => {
    return new execute(subOptions);
  },
  "FileStream": (subOptions) => {
    return new filestream(subOptions);
  }
}

const dataTypeMapping = {
  'SignalK': (options) => new from_json(options),
  'NMEA0183': (options) => new nmea0183_signalk(options),
  'NMEA2000': (options) => {
    var toJSON = new n2kAnalyzer(options)
    toJSON.pipe(new n2k_signalk(options))
    return toJSON;
  },
  'Multiplexed': (options) => new multiplexedlog(options)
}

const dataTypeForType = {
  "NMEA2000": "NMEA2000",
  'NMEA0183': "NMEA0183",
}

                      
