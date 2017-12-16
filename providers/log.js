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

/* Usage: This  pipeElement logs the output of the previous pipeElement. If placed in the end of the pipe, it will log Signal K deltas
 * Takes the options "logdir" and "discriminator". The log files are named from date and hour, and a new file is created every hour
 * Please note the standard discriminators used for playback with providers/multiplexedlog.js
 * Example:

{
  "type": "providers/log",
  "options": {
    "logdir": "logs",
    "discriminator": "I"
  }
}

*/

const Transform = require('stream').Transform
const FileTimestampStream = require('file-timestamp-stream')

const loggers = {}

function Log (options) {
  Transform.call(this, {
    objectMode: true
  })
  if (!options.logdir) {
    options.logdir = options.app.loggingDirectory || '/tmp'
  }
  this.discriminator = options.discriminator || ''
  if (!loggers[options.logdir]) {
    const path = require('path').join(
      (options.logdir.indexOf('/') === 0 ? '' : __dirname + '/../') +
        options.logdir
    )
    loggers[options.logdir] = new FileTimestampStream({
      path: path + 'signalk-rawdata.log.%Y-%m-%dT%H'
    })
  }
  this.logger = loggers[options.logdir]
}

require('util').inherits(Log, Transform)

Log.prototype._transform = function (msg, encoding, done) {
  this.push(msg)
  try {
    this.logger.write(
      new Date().getTime() +
        ';' +
        this.discriminator +
        ';' +
        (msg.updates ? JSON.stringify(msg) : msg.toString()) +
        '\n'
    )
  } catch (e) {
    console.error(e)
  }
  done()
}

function pad (num) {
  return (num > 9 ? '' : '0') + num
}

module.exports = Log
