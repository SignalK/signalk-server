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
const Nmea01832SignalK = require('./nmea0183-signalk')

/*

Provider to play back logs that the log provider produces, of the format

milliseconds;discriminator;data
where discriminator can be
N => NMEA0183
I => Signal K delta
A => actisense-serial format N2K data

1471172400151;N;!AIVDM,1,1,,A,13KdO60034Qk?WtRHUJQ3@ol05Cd,0*55
1471172400152;I;{"updates":[{"source":{"label":"i2c"},"values":[{"path":"electrical.batteries.house.voltage","value":13.5741469711775},{"path":"electrical.batteries.house.current","value":0.39957033121875}],"timestamp":"2016-07-16T12:00:08.825Z"}],"context":"vessels.230029970"}
1471172400153;A;2016-07-16T12:00:00.000Z,2,130306,105,255,8,00,d1,03,c9,23,fa,ff,ff
*/

function DeMultiplexer (options) {
  Writable.call(this)

  this.toTimestamped = new ToTimestamped()
  this.timestampThrottle = new TimestampThrottle({
    getMilliseconds: msg => msg.timestamp
  })
  this.splitter = new Splitter(this, options)
  if (options.noThrottle) {
    this.toTimestamped.pipe(this.splitter)
  } else {
    this.toTimestamped.pipe(this.timestampThrottle).pipe(this.splitter)
  }
  this.toTimestamped.on('drain', this.emit.bind(this, 'drain'))
}
require('util').inherits(DeMultiplexer, Writable)

DeMultiplexer.prototype.pipe = function (target) {
  this.splitter.pipe(target)
}
DeMultiplexer.prototype.write = function (chunk, encoding, callback) {
  return this.toTimestamped.write(chunk, encoding, callback)
}

function Splitter (deMultiplexer, options) {
  Transform.call(this, { objectMode: true })
  this.demuxEmitData = function (msg) {
    deMultiplexer.emit('data', msg)
  }

  this.fromN2KJson = new N2KJsonToSignalK()
  this.fromN2KJson.on('data', this.demuxEmitData)
  this.fromActisenseSerial = new ActisenseSerialToJSON(options)
  this.fromActisenseSerial.pipe(this.fromN2KJson)

  this.fromNMEA0183 = new Nmea01832SignalK(options)
  this.fromNMEA0183.on('data', this.demuxEmitData)
}
require('util').inherits(Splitter, Transform)

Splitter.prototype._transform = function (msg, encoding, done) {
  try {
    switch (msg.discriminator) {
      case 'A':
        return this.fromActisenseSerial.write(msg.data, encoding)
      case 'C':
      case 'N':
      case 'G':
        return this.fromNMEA0183.write(
          { line: msg.data, timestamp: msg.timestamp },
          encoding
        )
      case 'I':
        try {
          const parsed = JSON.parse(msg.data)
          this.push(parsed)
          this.demuxEmitData(parsed)
        } catch (e) {
          console.error(e)
        }
        break
      default:
        console.log('Unrecognized discriminator:' + msg.discriminator)
    }
  } finally {
    done()
  }
}
Splitter.prototype.pipe = function (target) {
  this.fromN2KJson.pipe(target)
  this.fromNMEA0183.pipe(target)
  Transform.prototype.pipe.call(this, target)
}

function ToTimestamped () {
  Transform.call(this, { objectMode: true })
}
require('util').inherits(ToTimestamped, Transform)

ToTimestamped.prototype._transform = function (msg, encoding, done) {
  const parts = msg.toString().split(';')
  this.push({ timestamp: parts[0], discriminator: parts[1], data: parts[2] })
  done()
}

module.exports = DeMultiplexer
