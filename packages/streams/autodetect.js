/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

const Transform = require('stream').Transform
const Writable = require('stream').Writable
const TimestampThrottle = require('./timestamp-throttle')

const N2KJsonToSignalK = require('./n2k-signalk')
const ActisenseSerialToJSON = require('./n2kAnalyzer')
const canboatjs = require('./canboatjs')
const Nmea01832SignalK = require('./nmea0183-signalk')
const _ = require('lodash')

/*

Provider to handle any kind of supported input data.

It will detect if the incoming data is in the 'multiplexedlog' format
(produced by the server's logging function)and if not, then it will
look at each incoming line to try to determine the type of data.

A multiplexed log should have this format:

milliseconds;discriminator;data
where discriminator can be
N => NMEA0183
I => Signal K delta
A => actisense-serial format N2K data

1471172400151;N;!AIVDM,1,1,,A,13KdO60034Qk?WtRHUJQ3@ol05Cd,0*55
1471172400152;I;{"updates":[{"source":{"label":"i2c"},"values":[{"path":"electrical.batteries.house.voltage","value":13.5741469711775},{"path":"electrical.batteries.house.current","value":0.39957033121875}],"timestamp":"2016-07-16T12:00:08.825Z"}],"context":"vessels.230029970"}
1471172400153;A;2016-07-16T12:00:00.000Z,2,130306,105,255,8,00,d1,03,c9,23,fa,ff,ff
*/

function DeMultiplexer(options) {
  Writable.call(this)

  this.toTimestamped = new ToTimestamped(this, options)
  this.timestampThrottle = new TimestampThrottle({
    getMilliseconds: (msg) => msg.timestamp,
  })
  this.splitter = new Splitter(this, options)
  this.options = options

  this.toTimestamped.on('drain', this.emit.bind(this, 'drain'))
}
require('util').inherits(DeMultiplexer, Writable)

DeMultiplexer.prototype.pipe = function (target) {
  return this.splitter.pipe(target)
}
DeMultiplexer.prototype.write = function (chunk, encoding, callback) {
  return this.toTimestamped.write(chunk, encoding, callback)
}

function Splitter(deMultiplexer, options) {
  Transform.call(this, { objectMode: true })
  this.demuxEmitData = function (msg) {
    deMultiplexer.emit('data', msg)
  }

  this.fromN2KJson = new N2KJsonToSignalK(options)
  this.fromN2KJson.on('data', this.demuxEmitData)

  if (_.isUndefined(options.useCanboatjs) || options.useCanboatjs) {
    this.fromActisenseSerial = new canboatjs(options)
  } else {
    this.fromActisenseSerial = new ActisenseSerialToJSON(options)
  }
  this.fromActisenseSerial.pipe(this.fromN2KJson)

  this.fromNMEA0183 = new Nmea01832SignalK(options)
  this.fromNMEA0183.on('data', this.demuxEmitData)
}
require('util').inherits(Splitter, Transform)

Splitter.prototype._transform = function (msg, encoding, _done) {
  let done = _done
  try {
    switch (msg.discriminator) {
      case 'A': {
        msg.fromFile = true
        const result = this.fromActisenseSerial.write(msg, encoding)
        if (!result) {
          this.fromActisenseSerial.once('drain', _done)
          done = () => {}
        }
        break
      }
      case 'C':
      case 'N':
      case 'G':
      case 'M':
        this.fromNMEA0183.write(
          { line: msg.data, timestamp: msg.timestamp },
          encoding
        )
        break
      case 'I':
      default:
        try {
          const parsed = JSON.parse(msg.data)
          const timestamp = new Date(Number(msg.timestamp))
          parsed.updates &&
            parsed.updates.forEach((update) => (update.timestamp = timestamp))
          this.push(parsed)
          this.demuxEmitData(parsed)
        } catch (e) {
          console.error(e)
        }
        break
    }
  } finally {
    done()
  }
}
Splitter.prototype.pipe = function (target) {
  this.fromN2KJson.pipe(target)
  this.fromNMEA0183.pipe(target)
  return Transform.prototype.pipe.call(this, target)
}

function ToTimestamped(deMultiplexer, options) {
  Transform.call(this, { objectMode: true })
  this.deMultiplexer = deMultiplexer
  this.options = options
}
require('util').inherits(ToTimestamped, Transform)

ToTimestamped.prototype._transform = function (msg, encoding, done) {
  const line = msg.toString()
  this.multiplexedFormat =
    line.length > 16 && line.charAt(13) === ';' && line.charAt(15) === ';'
  if (this.multiplexedFormat) {
    if (this.options.noThrottle) {
      this.deMultiplexer.toTimestamped.pipe(this.deMultiplexer.splitter)
    } else {
      this.deMultiplexer.toTimestamped
        .pipe(this.deMultiplexer.timestampThrottle)
        .pipe(this.deMultiplexer.splitter)
    }
    this._transform = this.handleMultiplexed
  } else {
    this._transform = this.handleMixed
  }
  this._transform(msg, encoding, done)
}

ToTimestamped.prototype.handleMixed = function (msg, encoding, done) {
  const line = msg.toString()
  const res = { timestamp: new Date().getTime(), data: line }
  if (line.charAt(0) === '{') {
    res.discriminator = 'I'
  } else if (
    (line.charAt(0) === '$' || line.charAt(0) === '!') &&
    !line.startsWith('!PDGY') // iKonect
  ) {
    res.discriminator = 'N'
  } else {
    res.discriminator = 'A'
  }
  this.push(res)
  done()
}

ToTimestamped.prototype.handleMultiplexed = function (msg, encoding, done) {
  const line = msg.toString()
  const parts = line.split(';')
  this.push({ timestamp: parts[0], discriminator: parts[1], data: parts[2] })
  done()
}

module.exports = DeMultiplexer
