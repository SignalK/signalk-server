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

var path = require('path');
var PassThrough = require('stream').PassThrough;

function EndIgnoringPassThrough() {
  PassThrough.call(this);
}


require('util').inherits(EndIgnoringPassThrough, PassThrough);
EndIgnoringPassThrough.prototype.end = function() {}


var FileStream = function(options) {
  this.options = options;
  this.keepRunning = true;
}


FileStream.prototype.pipe = function(pipeTo) {
  this.pipeTo = pipeTo;
  this.endIgnoringPassThrough = new EndIgnoringPassThrough();
  this.endIgnoringPassThrough.pipe(pipeTo);
  this.startStream();
}

FileStream.prototype.startStream = function() {
  if (this.keepRunning) {
    this.filestream = require('fs').createReadStream(path.join(__dirname, '..', this.options.filename));
    this.filestream.on('end', this.startStream.bind(this));
    this.filestream.pipe(this.endIgnoringPassThrough)
  }
}

FileStream.prototype.end = function() {
  this.keepRunning = false;
  this.pipeTo.end();
  this.filestream.close();
}

module.exports = FileStream;
