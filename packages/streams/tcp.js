/*
 * Copyright 2014-2018 Fabian Tollenaar <fabian@decipher.industries>,Teppo Kurki <teppo.kurki@iki.fi
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

/* Usage: This is TCP client provider that can connect to a tcp server and pass data from there to the provider pipeline.
 * It takes the options "host" and "port".
 * Example:

 {
   "type": "providers/tcp",
   "options": {
     "host": 'localhost',
     "port": 10110,
   }
 },

 */

import net from 'net'
import { Transform } from 'stream'
import { isArray } from 'lodash'
import createDebug from 'debug'
import { inherits } from 'util'
import inject from 'reconnect-core'

export default function TcpStream(options) {
  Transform.call(this, options)
  this.options = options
  this.noDataReceivedTimeout =
    Number.parseInt((this.options.noDataReceivedTimeout + '').trim()) * 1000
  this.debug = (options.createDebug || createDebug)('signalk:streams:tcp')
  this.debug(`noDataReceivedTimeout:${this.noDataReceivedTimeout}`)
  this.debugData = (options.createDebug || createDebug)(
    'signalk:streams:tcp-data'
  )
}

inherits(TcpStream, Transform)

TcpStream.prototype.pipe = function (pipeTo) {
  const that = this
  if (this.options.outEvent) {
    that.options.app.on(that.options.outEvent, function (d) {
      if (that.tcpStream) {
        that.debug('sending %s', d)
        that.tcpStream.write(d)
        setImmediate(() => {
          that.options.app.emit('connectionwrite', {
            providerId: that.options.providerId,
          })
        })
      }
    })
  }

  const stdOutEvent = this.options.toStdout
  if (stdOutEvent) {
    const that = this //semicolon required here
    ;(isArray(stdOutEvent) ? stdOutEvent : [stdOutEvent]).forEach(
      (stdEvent) => {
        that.options.app.on(stdEvent, function (d) {
          if (that.tcpStream) {
            that.tcpStream.write(d + '\r\n')
            that.debug('event %s sending %s', stdEvent, d)
          }
        })
      }
    )
  }

  inject(function () {
    return net.connect.apply(null, arguments)
  })({ maxDelay: 5 * 1000 }, (tcpStream) => {
    if (!isNaN(this.noDataReceivedTimeout)) {
      tcpStream.setTimeout(this.noDataReceivedTimeout)
      that.debug(
        `Setting socket idle timeout ${this.options.host}:${this.options.port} ${this.noDataReceivedTimeout}`
      )
      tcpStream.on('timeout', () => {
        that.debug(
          `Idle timeout, closing socket ${this.options.host}:${this.options.port}`
        )
        tcpStream.end()
      })
    }
    tcpStream.on('data', (data) => {
      if (that.debugData.enabled) {
        that.debugData(data.toString())
      }
      this.write(data)
    })
  })
    .on('connect', (con) => {
      this.tcpStream = con
      const msg = `Connected to ${this.options.host} ${this.options.port}`
      this.options.app.setProviderStatus(this.options.providerId, msg)
      that.debug(msg)
    })
    .on('reconnect', (n, delay) => {
      const msg = `Reconnect ${this.options.host} ${this.options.port} retry ${n} delay ${delay}`
      this.options.app.setProviderError(this.options.providerId, msg)
      that.debug(msg)
    })
    .on('disconnect', () => {
      delete this.tcpStream
      that.debug(`Disconnected ${this.options.host} ${this.options.port}`)
    })
    .on('error', (err) => {
      this.options.app.setProviderError(this.options.providerId, err.message)
      console.error('TcpProvider:' + err.message)
    })
    .connect(this.options)

  Transform.prototype.pipe.call(this, pipeTo)
}

TcpStream.prototype._transform = function (data, encoding, callback) {
  callback(null, data)
}
