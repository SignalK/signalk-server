/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

var toDelta = require('n2k-signalk').toDelta;

var parser = new(require('nmea0183-signalk').Parser)();

function ToSignalK() {
  Transform.call(this, {
    objectMode: true
  });

  var that = this;
  parser.on('delta', function(delta) {
    that.push(delta);
  });
}

require('util').inherits(ToSignalK, Transform);

ToSignalK.prototype._transform = function(chunk, encoding, done) {
  parser.write(chunk + '\n');
  done()
}

ToSignalK.prototype.start = function() {}
ToSignalK.prototype.stop = function() {}

module.exports = ToSignalK;