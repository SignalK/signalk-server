/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

/* Usage:
 *  This is part of a PipedProvider that splits the input into separate lines and passes one line at a time to the next provider.
 *  You can specify the line separator with the option lineSeparator.

 {
   "type": "providers/liner"
 },

 */

const Transform = require('stream').Transform

require('util').inherits(Liner, Transform)

function Liner(options) {
  Transform.call(this, {
    objectMode: true
  })
  this.doPush = this.push.bind(this)
  this.lineSeparator = options.lineSeparator || '\n'
}

Liner.prototype._transform = function (chunk, encoding, done) {
  let data = chunk.toString()
  if (this._lastLineData) {
    data = this._lastLineData + data
  }

  const lines = data.split(this.lineSeparator)
  this._lastLineData = lines.splice(lines.length - 1, 1)[0]
  if (this._lastLineData.length > 2048) {
    console.error(
      'Are you sure you are using the correct line terminator? Not going to handle lines longer than 2048 chars.'
    )
    this._lastLineData = ''
  }

  lines.forEach(this.doPush)

  done()
}

Liner.prototype._flush = function (done) {
  if (this._lastLineData) {
    this.push(this._lastLineData)
  }

  this._lastLineData = null
  done()
}

module.exports = Liner
