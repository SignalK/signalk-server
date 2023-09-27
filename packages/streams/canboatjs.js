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

const Transform = require('stream').Transform
const FromPgn = require('@canboat/canboatjs').FromPgn
const _ = require('lodash')

function CanboatJs(options) {
  Transform.call(this, {
    objectMode: true,
  })

  this.fromPgn = new FromPgn(options)
  const createDebug = options.createDebug || require('debug')
  const debug = createDebug('signalk:streams:canboatjs')

  this.fromPgn.on('warning', (pgn, warning) => {
    debug(`[warning] ${pgn.pgn} ${warning}`)
  })

  this.fromPgn.on('error', (pgn, err) => {
    console.error(pgn.input, err.message)
  })

  this.app = options.app
  this.analyzerOutEvent = options.analyzerOutEvent || 'N2KAnalyzerOut'
}

require('util').inherits(CanboatJs, Transform)

CanboatJs.prototype._transform = function (chunk, encoding, done) {
  if (_.isObject(chunk) && chunk.fromFile) {
    const pgnData = this.fromPgn.parse(chunk.data)
    if (pgnData) {
      pgnData.timestamp = new Date(Number(chunk.timestamp)).toISOString()
      this.push(pgnData)
      this.app.emit(this.analyzerOutEvent, pgnData)
    }
  } else {
    const pgnData = this.fromPgn.parse(chunk)
    if (pgnData) {
      this.push(pgnData)
      this.app.emit(this.analyzerOutEvent, pgnData)
    }
  }
  done()
}

module.exports = CanboatJs
