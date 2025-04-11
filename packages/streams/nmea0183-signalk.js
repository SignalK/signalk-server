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
 * Emits sentence data as "nmea0183" events on app and app.signalk by default.
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
const utils = require('@signalk/nmea0183-utilities')
const n2kToDelta = require('@signalk/n2k-signalk').toDelta
const FromPgn = require('@canboat/canboatjs').FromPgn

function Nmea0183ToSignalK(options) {
  Transform.call(this, {
    objectMode: true
  })
  this.debug = (options.createDebug || require('debug'))(
    'signalk:streams:nmea0183-signalk'
  )

  this.parser = new Parser(options)
  this.n2kParser = new FromPgn(options)
  this.n2kState = {}

  // Object on which to send 'sentence' events
  this.app = options.app

  // Prepare a list of events to send for each sentence received
  this.sentenceEvents = options.suppress0183event ? [] : ['nmea0183']
  this.appendChecksum = options.appendChecksum

  if (options.sentenceEvent) {
    if (Array.isArray(options.sentenceEvent)) {
      this.sentenceEvents = this.sentenceEvents.concat(options.sentenceEvent)
    } else {
      this.sentenceEvents.push(options.sentenceEvent)
    }
  }
}

require('util').inherits(Nmea0183ToSignalK, Transform)

Nmea0183ToSignalK.prototype._transform = function (chunk, encoding, done) {
  let sentence
  let timestamp = null

  if (chunk && typeof chunk === 'object' && typeof chunk.line === 'string') {
    timestamp = new Date(Number(chunk.timestamp))
    sentence = chunk.line.trim()
  } else if (Buffer.isBuffer(chunk)) {
    sentence = chunk.toString().trim()
  } else if (chunk && typeof chunk === 'string') {
    sentence = chunk.trim()
  }

  try {
    if (sentence !== undefined) {
      if (this.appendChecksum) {
        sentence = utils.appendChecksum(sentence)
      }
      // Send 'sentences' event to the app for each sentence
      this.sentenceEvents.forEach((eventName) => {
        this.app.emit(eventName, sentence)
        this.app.signalk.emit(eventName, sentence)
      })

      let delta = null
      if (this.n2kParser.isN2KOver0183(sentence)) {
        const pgn = this.n2kParser.parseN2KOver0183(sentence)
        if (pgn) {
          delta = n2kToDelta(pgn, this.state, { sendMetaData: true })
        }
      } else {
        delta = this.parser.parse(sentence)
      }

      if (delta !== null) {
        if (timestamp !== null) {
          delta.updates.forEach((update) => {
            update.timestamp = timestamp
          })
        }

        this.push(delta)
      }
    }
  } catch (e) {
    this.debug(e)
  }

  done()
}

module.exports = Nmea0183ToSignalK
