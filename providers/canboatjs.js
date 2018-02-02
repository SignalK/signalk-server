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
const FromPgn = require('canboatjs').FromPgn
const debug = require('debug')('signalk:canbusjs')
const _ = require('lodash')

function canboatjs (options) {
  Transform.call(this, {
    objectMode: true
  })

  this.fromPgn = new FromPgn(options)

  this.fromPgn.on('pgn', pgn => {
    this.push(pgn)
    options.app.emit('N2KAnalyzerOut', pgn)
  })

  this.fromPgn.on('warning', (pgn, warning) => {
    debug(`[warning] ${pgn.pgn} ${warning}`)
  })

  this.fromPgn.on('error', (pgn, error) => {
    debug(`[error] ${pgn.pgn} ${error}`)
  })
}

require('util').inherits(canboatjs, Transform)

canboatjs.prototype._transform = function (chunk, encoding, done) {
  this.fromPgn.parse(chunk)
  done()
}

module.exports = canboatjs
