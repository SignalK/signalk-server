/*
 * Copyright 2018 Teppo Kurki <teppo.kurki@iki.fi>
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
 The server is the tcp nmea0183 interface, this provider just
 shovels data from tcpserver0183data to the provider pipe.
 */

import { Transform } from 'stream'
import { inherits } from 'util'

export default function TcpServer(options) {
  Transform.call(this)
  this.options = options
}

inherits(TcpServer, Transform)

TcpServer.prototype.pipe = function (pipeTo) {
  this.options.app.on('tcpserver0183data', (d) => this.write(d))
  Transform.prototype.pipe.call(this, pipeTo)
}

TcpServer.prototype._transform = function (data, encoding, callback) {
  callback(null, data)
}
