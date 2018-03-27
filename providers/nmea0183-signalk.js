/*
 * Copyright 2017 Signal K & Fabian Tollenaar <fabian@signalk.org>
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

/**
 * Usage: this is the pipeElement that transforms NMEA0183 input to Signal K deltas.
 * Emits sentence data as "nmea0183" events on app.signalk by default.
 * Furthermore you can use "sentenceEvent" option, that will cause sentence data to be
 * emitted as events on app. sentenceEvent can be a string or an array of strings.
 *
 * Example:
 * {
 *   "type": "providers/nmea0183-signalk",
 *   "options": {
 *     "sentenceEvent": "nmea0183-B"
 *   },
 * }
 */

const Transform = require('stream').Transform
const Parser = require('@signalk/nmea0183-signalk')
const debug = require('debug')('signalk-server-node/providers/nmea0183-signalk')

function nmea0183ToSignalK (options) {
  Transform.call(this, {
    objectMode: true
  })

  this.parser = new Parser(options)

  this.parser.on('nmea0183', sentence => {
    options.app.signalk.emit('nmea0183', sentence)
  })

  if (options.sentenceEvent) {
    ;(Array.isArray(options.sentenceEvent)
      ? options.sentenceEvent
      : [options.sentenceEvent]
    ).forEach(event => {
      this.parser.on('nmea0183', sentence => options.app.emit(event, sentence))
    })
  }

  this.parser.on('signalk:delta', delta => {
    if (this.timestamp) {
      delta.updates.forEach(update => {
        update.timestamp = this.timestamp
      })
    }

    this.push(delta)
  })

  this.parser.on('warning', warning => {
    debug(`[warning] ${warning.message}`)
  })

  this.parser.on('error', error => {
    debug(`[error] ${error.message}`)
  })
}

require('util').inherits(nmea0183ToSignalK, Transform)

nmea0183ToSignalK.prototype._transform = function (chunk, encoding, done) {
  if (Buffer.isBuffer(chunk)) {
    chunk = chunk.toString().trim()
  }

  if (chunk && typeof chunk === 'object' && typeof chunk.line === 'string') {
    this.timestamp = new Date(Number(chunk.timestamp))
    this.parser.parse(`${chunk.line.trim()}\n`).catch(() => {})
  }

  if (chunk && typeof chunk === 'string') {
    this.parser.parse(`${chunk.trim()}\n`).catch(() => {})
  }

  done()
}

module.exports = nmea0183ToSignalK
