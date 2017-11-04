/*
 * Copyright 2015 Teppo Kurki <teppo.kurki@iki.fi>
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

/* Usage: This pipeElement takes any TCP stream and passes it to the next pipeElement.
 * It takes the options "host" and "port" and optionally "reconnect" (default true) and "maxRetries" (default 10)
 * Example:

 {
   "type": "providers/udp",
   "options": {
     "port": 12345
   },
   "optionMappings": [
     {
       "fromAppProperty": "argv.udpport",
       "toOption": "port"
     }
   ]
 },

 */

var Transform = require('stream').Transform
const debug = require('debug')('signalk-server:udp-provider')

function Udp (options) {
  Transform.call(this, {
    objectMode: false
  })
  this.options = options
}

require('util').inherits(Udp, Transform)

Udp.prototype.pipe = function (pipeTo) {
  Udp.super_.prototype.pipe.call(this, pipeTo)

  var socket = require('dgram').createSocket('udp4')
  var self = this
  socket.on('message', function (message, remote) {
    debug(message.toString())
    self.push(message)
  })
  socket.bind(this.options.port)
}

Udp.prototype._transform = function (chunk, encoding, done) {
  done()
}

module.exports = Udp
