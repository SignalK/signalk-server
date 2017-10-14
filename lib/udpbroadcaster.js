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

/*
    A quick hack to be able to broadcast Signal K or NMEA0183 data over UDP
    With modern Node one could figure out the broadcast address in
    simple cases where you have just one active interface.
    https://nodejs.org/api/os.html#os_os_networkinterfaces
*/

var Transform = require('stream').Transform
var dgram = require('dgram')

function UdpBroadcaster () {
  Transform.call(this)

  var socket
  this.udpSocket = socket = dgram.createSocket('udp4')
  socket.bind('192.168.1.255', function () {
    socket.setBroadcast(true)
  })
}

require('util').inherits(UdpBroadcaster, Transform)

UdpBroadcaster.prototype._transform = function (chunk, encoding, done) {
  try {
    var message = new Buffer(chunk.toString() + '\n')
    this.udpSocket.send(message, 0, message.length, 2000, '192.168.1.255')
  } catch (ex) {
    console.error(ex.stack)
  }
  this.push(chunk)
  done()
}

module.exports = UdpBroadcaster
