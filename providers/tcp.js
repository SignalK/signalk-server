/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@decipher.industries>
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
 * It takes the options "host" and "port" and optionally "reconnect" (default true) and "maxRetries" (default 10)
 * Example:

 {
   "type": "providers/tcp",
   "options": {
     "host": 'localhost',
     "port": 10110,
   }
 },

 */

var net = require('net'),
  Transform = require('stream').Transform,
  debug = require('debug')('signalk-provider-tcp')

function TcpStream (options) {
  if (!(this instanceof TcpStream)) {
    return new TcpStream(options)
  }

  Transform.call(this, options)

  this.options = options
  this.reconnect = !(
    typeof options.reconnect === 'boolean' && options.reconnect === false
  )
  this.socket = null
  this.retries = 0
  this.maxRetries =
    typeof options.maxRetries === 'number' && options.maxRetries > 0
      ? options.maxRetries
      : 10

  this.__reset = null
  this.__timeout = null
  this.__last = -1

  this.start(true)

  this.on('error', function (err) {
    debug('Stream: "error". Message: ' + err.message)
  })
}

require('util').inherits(TcpStream, Transform)

TcpStream.prototype.handleTimeout = function () {
  if (Date.now() - this.__last > 90000 && this.__reset === null) {
    debug('Connection timed out. Resetting.')
    this.start()
    return
  }

  if (this.__timeout !== null) {
    clearTimeout(this.__timeout)
  }

  this.__timeout = setTimeout(this.handleTimeout.bind(this), 120000)
}

TcpStream.prototype.start = function (force) {
  if (this.socket !== null) {
    this.socket.unpipe(this)
    this.socket.removeAllListeners('error')
    this.socket.removeAllListeners('close')
    this.socket.removeAllListeners('end')
    this.socket.destroy()
    this.socket = null
  }

  if (force !== true && this.reconnect !== true) {
    debug('Reconnect is turned off. Game over.', this.reconnect)
    return
  }

  if (this.__timeout !== null) {
    clearTimeout(this.__timeout)
  }

  this.socket = net.connect(this.options)
  this.__timeout = setTimeout(this.handleTimeout.bind(this), 30000)

  this.socket.on(
    'close',
    function () {
      if (this.__reset === null) {
        debug('Socket: "close". Re-starting')
        this.start()
      }
    }.bind(this)
  )

  this.socket.on('connect', function () {
    if (this.__reset !== null) {
      clearTimeout(this.__reset)
    }

    debug('Socket: "connect". Connected!')
  })

  this.socket.on(
    'error',
    function (err) {
      debug('Socket: "error". Message: ' + err.message)
      this.retries++

      if (this.retries < this.maxRetries) {
        debug(
          'Socket: "error". Retrying... ' +
            this.retries +
            ' / ' +
            this.maxRetries
        )
        this.start()
      } else {
        debug('Socket: "error". Out of retries, retrying in 30 seconds.\n\n')
        if (this.__reset === null) {
          if (this.__timeout !== null) {
            clearTimeout(this.__timeout)
          }

          this.__reset = setTimeout(
            function () {
              this.maxRetries = 10
              this.retries = 0
              this.__reset = null
              this.start()
            }.bind(this),
            30000
          )
        }
      }
    }.bind(this)
  )

  this.socket.pipe(this)
}

TcpStream.prototype._transform = function (chunk, encoding, done) {
  this.__last = Date.now()
  this.push(chunk)
  done()
}

TcpStream.prototype.end = function () {
  console.error('tcp provider stream ended')
}

module.exports = TcpStream
