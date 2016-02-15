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
    delta.updates.forEach(function(update) {
      if (update.values) {
        update.values.forEach(function(pathValue) {
          if (pathValue.path === 'environment.wind.angleApparent') {
            console.log('hep')
            that.emit('nmea0183', nmea.encode('II', {
              type: 'wind',
              angle: pathValue.value,
              reference: 'R',
              speed: 0,
              units: 'M',
              status: 'A'
            }))
          }
        })
      }
    })
  }
}

module.exports = Signalk2Nmea;
