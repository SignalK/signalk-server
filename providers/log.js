/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@ıki.fi>
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

function Log(options) {
  Transform.call(this, {
    objectMode: true
  });
  this.logger = createLogger(options.logdir, options.discriminator);
}

require('util').inherits(Log, Transform);

Log.prototype._transform = function(msg, encoding, done) {
  this.push(msg);
  try {
    this.logger.info(msg.updates ? JSON.stringify(msg) : msg.toString());
  } catch (e) {
    console.error(e)
  }
  done();
};

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

module.exports = Log;
