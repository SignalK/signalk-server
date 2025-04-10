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

import { Transform } from 'stream'
import { getLogger } from './logging.js'
import { inherits } from 'util'

export default function Log(options) {
  Transform.call(this, {
    objectMode: true,
  })

  this.logger = getLogger(options.app, options.discriminator, options.logdir)
}

inherits(Log, Transform)

Log.prototype._transform = function (msg, encoding, done) {
  this.push(msg)
  this.logger(msg)
  done()
}
