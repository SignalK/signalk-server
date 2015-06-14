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


function Liner(options) {
  Transform.call(this, {
    objectMode: true
  });
  if (options.rawlogging) {
    this.logger = createLogger(options.logdir, options.discriminator);
  }
}

require('util').inherits(Liner, Transform);

Liner.prototype._transform = function(chunk, encoding, done) {
  var data = chunk.toString()
  if (this._lastLineData) {
    data = this._lastLineData + data;
  }

  var lines = data.split('\n')
  this._lastLineData = lines.splice(lines.length - 1, 1)[0];
  if (this._lastLineData.length > 2048) {
    console.error("Are you sure you are using the correct line terminator? Not going to handle lines longer than 2048 chars.");
    this._lastLineData = '';
  }

  lines.forEach(outputLine.bind(this));

  done();
}

function outputLine(line) {
  if (typeof this.logger != 'undefined') {
    try {
      this.logger.info(line);
    } catch (ex) {
      console.error(ex);
    }
  }
  this.push(line);
}

Liner.prototype._flush = function(done) {
  if (this._lastLineData) {
    outputLine.call(this, this._lastLineData);
  }

  this._lastLineData = null;
  done();
}

function createLogger(logdir, discriminator) {
  var notEmptyDiscriminator = discriminator || "";
  var winston = require('winston'),
    transports = [];

  var logfilename = require('path').join(
    (logdir.indexOf('/') === 0 ? '' : (__dirname + "/../") ) +
    logdir +
    "/signalk-rawdata.log");
  transports.push(new winston.transports.DailyRotateFile({
    name: 'file',
    datePattern: '.yyyy-MM-ddTHH',
    filename: logfilename,
    json: false,
    formatter: function(options) {
      // Return string will be passed to logger.
      return new Date().getTime() + ';' + notEmptyDiscriminator + ';' + options.message;
    }
  }));

  return new winston.Logger({
    transports: transports
  });
}


module.exports = Liner;