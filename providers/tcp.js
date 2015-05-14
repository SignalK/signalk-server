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

var net = require('net');
var PassThrough = require('stream').PassThrough;

function EndIgnoringPassThrough() {
  PassThrough.call(this);
}

require('util').inherits(EndIgnoringPassThrough, PassThrough);
EndIgnoringPassThrough.prototype.end = function() {}

var TcpStream = function(options) {
  this.options = options;
  this.keepRunning = true;
}

TcpStream.prototype.pipe = function(pipeTo) {
  this.pipeTo = pipeTo;
  this.endIgnoringPassThrough = new EndIgnoringPassThrough();
  this.endIgnoringPassThrough.pipe(pipeTo);
  this.startStream();
}

TcpStream.prototype.startStream = function() {
  if (this.keepRunning) {
    this.client = net.connect(this.options);
    this.client.on('end', this.startStream.bind(this));
    this.client.pipe(this.endIgnoringPassThrough);
  }
}

TcpStream.prototype.end = function() {
  this.keepRunning = false;
  this.pipeTo.end();
  this.client.close();
}

module.exports = TcpStream;
