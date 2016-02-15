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

var Transform = require('stream').Transform;
var nmea = require('nmea');
var Qty = require('js-quantities');

var rad2deg = Qty.swiftConverter('rad', 'deg')
var identity = function(v) {
  return v;
}

function Signalk2Nmea() {
  Transform.call(this, {
    objectMode: true
  });
}

require('util').inherits(Signalk2Nmea, Transform);

Signalk2Nmea.prototype._transform = function(chunk, encoding, done) {
  try {
    this.push(chunk);
  } 
  catch (ex) {
    console.error(ex);
  }
  convert.call(this, chunk);
  done();
}

function convert(delta) {
  var that = this;
  if (delta.updates) {
    var nmea = new NmeaAccumulator(that.emit.bind(that));
    delta.updates.forEach(function(update) {
      if (update.values) {
        update.values.forEach(function(pathValue) {
          nmea.push(pathValue);
        })
      }
    })
    nmea.flush();
  }
}

function NmeaAccumulator(emit) {
  this.sentences = [new ApparentWind(emit)];
}

NmeaAccumulator.prototype.push = function(pathValue) {
  this.sentences.forEach(function(sentence) {
    sentence.push.call(sentence, pathValue);
  })
}

NmeaAccumulator.prototype.flush = function() {
  this.sentences.forEach(function(sentence) {
    sentence.flush.call(sentence);
  })
}

function ApparentWind(emit) {
  this.emit = emit;
  this.data = {
    type: 'wind',
    units: 'M',
    reference: 'R',
    status: 'A'
  }
  this.pathFields = {
    'environment.wind.angleApparent': {
      field: 'angle',
      converter: rad2deg
    },
    'environment.wind.speedApparent': {
      field: 'speed',
      converter: identity
    }
  }
}

ApparentWind.prototype.push = function(pathValue) {
  if (this.pathFields[pathValue.path]) {
    this.data[this.pathFields[pathValue.path].field] = this.pathFields[pathValue.path].converter(pathValue.value);
  }
}

ApparentWind.prototype.flush = function() {
  if (this.data.angle && this.data.speed) {
    this.emit('nmea0183', nmea.encode('II', this.data))
  }
  this.data = {
    type: 'wind',
    units: 'M',
    stattys: 'A'
  }
}

module.exports = Signalk2Nmea;
