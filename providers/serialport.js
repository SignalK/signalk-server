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

var Transform = require('stream').Transform
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;

function SerialStream(options) {
  if(!(this instanceof SerialStream)) {
    return new SerialStream(options);
  }

  Transform.call(this, options);

  this.reconnect = options.reconnect || true;
  this.serial = null;
  this.options = options;
  this.start();
}

require('util').inherits(SerialStream, Transform);

SerialStream.prototype.start = function() {
  if(this.serial !== null) {
    this.serial.unpipe(this);
    this.serial.removeAllListeners();
    this.serial = null;
  }

  if(this.reconnect === false) {
    return;
  }

  this.serial = new SerialPort(this.options.device, {
    baudrate: this.options.baudrate,
    parser: serialport.parsers.readline("\n")
  });

  this.serial.on('open', function() {
    this.serial.pipe(this);
  }.bind(this));

  this.serial.on('error', this.start.bind(this));
  this.serial.on('close', this.start.bind(this));
};

SerialStream.prototype.end = function() {
  this.reconnect = false;
  this.start();
};

SerialStream.prototype._transform = function(chunk, encoding, done) {
  this.push(chunk);
  done();
};  

module.exports = SerialStream;
