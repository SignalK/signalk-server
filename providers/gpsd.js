/*
 * Copyright 2014-2015 Teppo Kurki <teppo.kurki@iki.fi>
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
var gpsd = require('node-gpsd');
var debug = require('debug')('signalk:provider:gpsd');

function Gpsd(options) {
  Transform.call(this, {
    objectMode: true
  });
  this.listener = new gpsd.Listener({
    port: options.port || 2947,
    hostname: options.hostname || 'localhost',
    logger: {
      info: debug,
      warn: console.warn,
      error: console.error
    },
    parse: false
  });

  this.listener.connect(function() {
    debug('Connected');
  });

  var self = this;
  this.listener.on('raw', function(data) {
    self.push(data);
  })

  this.listener.watch({
    class: 'WATCH',
    nmea: true
  });
}

require('util').inherits(Gpsd, Transform);

Gpsd.prototype._transform = function(chunk, encoding, done) {
  done();
}

module.exports = Gpsd;